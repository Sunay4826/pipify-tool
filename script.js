// Advanced PiPify - Professional Picture-in-Picture Tool

class AdvancedPiPify {
    constructor() {
        this.activePiPWindows = new Map();
        this.settings = this.loadSettings();
        this.notificationSystem = new NotificationSystem();
        this.currentStream = null;
        this.isInitialized = false;
        
        this.init();
    }

    async init() {
        try {
            this.setupEventListeners();
            this.setupKeyboardShortcuts();
            this.loadSettings();
            this.updateUI();
            this.isInitialized = true;
            
            this.notificationSystem.show('success', 'Advanced PiPify Ready', 'All systems initialized successfully');
            this.updateStatus('Ready');
        } catch (error) {
            console.error('Initialization error:', error);
            this.notificationSystem.show('error', 'Initialization Failed', 'Failed to initialize Advanced PiPify');
        }
    }

    setupEventListeners() {
        // Action cards
        document.querySelectorAll('.action-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const mode = card.dataset.mode;
                this.startCapture(mode);
            });
        });

        // Settings
        document.getElementById('settingsToggle').addEventListener('click', () => {
            this.toggleSettings();
        });

        document.getElementById('closeSettings').addEventListener('click', () => {
            this.toggleSettings();
        });

        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Settings form
        document.querySelectorAll('.settings-content input, .settings-content select').forEach(input => {
            input.addEventListener('change', (e) => {
                this.saveSetting(e.target.id, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
            });
        });

        // Control buttons
        document.querySelectorAll('.control-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                const value = btn.dataset[Object.keys(btn.dataset).find(key => key !== 'action')];
                this.handleControl(action, value);
            });
        });

        // Close settings on overlay click
        document.getElementById('settingsOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'settingsOverlay') {
                this.toggleSettings();
            }
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl + Shift + P: Toggle PiP
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                this.togglePiP();
            }
            
            // Esc: Close PiP
            if (e.key === 'Escape') {
                this.closeAllPiP();
            }
            
            // Ctrl + M: Toggle Audio
            if (e.ctrlKey && e.key === 'M') {
                e.preventDefault();
                this.toggleAudio();
            }
        });
    }

    async startCapture(mode) {
        try {
            this.updateStatus('Starting capture...');

            let stream;
            if (mode === 'camera') {
                // Use camera and optional microphone for camera mode
                const audioEnabled = this.settings.audioEnabled !== false;
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        frameRate: { ideal: 30 }
                    },
                    audio: audioEnabled
                });
            } else {
                // Screen/window/tab are all handled by the browser picker in getDisplayMedia
                const audioEnabled = this.settings.audioEnabled !== false;
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: audioEnabled
                });
            }

            this.currentStream = stream;
            await this.createPiPWindow(stream, mode);

            this.notificationSystem.show('success', 'Capture Started', `${mode.charAt(0).toUpperCase() + mode.slice(1)} capture activated`);
            this.updateStatus('Capture active');

        } catch (error) {
            console.error('Capture error:', error);
            this.handleCaptureError(error);
        }
    }

    getConstraintsForMode(mode) {
        // Kept for backward-compatibility; not used for capture anymore.
        // Screen/window/tab selection is handled by the browser UI in getDisplayMedia.
        // Camera uses getUserMedia.
        const audioEnabled = this.settings.audioEnabled !== false;
        if (mode === 'camera') {
            return {
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 30 }
                },
                audio: audioEnabled
            };
        }
        return { video: true, audio: audioEnabled };
    }

    async createPiPWindow(stream, mode) {
        const video = document.createElement('video');
        video.srcObject = stream;
        video.style.display = 'none';
        document.body.appendChild(video);

        await new Promise((resolve) => {
            video.onloadedmetadata = async () => {
                await video.play();
                resolve();
            };
        });

        if (document.pictureInPictureEnabled) {
            try {
                const pipWindow = await video.requestPictureInPicture();
                const pipId = this.generatePiPId();
                
                this.activePiPWindows.set(pipId, {
                    video,
                    stream,
                    mode,
                    pipWindow,
                    id: pipId,
                    audioEnabled: this.settings.audioEnabled !== false,
                    size: this.settings.defaultSize || 'medium',
                    position: 'bottom-right'
                });

                this.setupPiPEvents(pipId);
                this.updatePiPList();
                this.showControls();
                
                // Apply default settings
                this.applyPiPSettings(pipId);
                
            } catch (error) {
                console.error('PiP error:', error);
                this.notificationSystem.show('error', 'PiP Failed', 'Failed to enter Picture-in-Picture mode');
            }
        } else {
            this.notificationSystem.show('error', 'PiP Not Supported', 'Picture-in-Picture is not supported in this browser');
        }
    }

    setupPiPEvents(pipId) {
        const pipData = this.activePiPWindows.get(pipId);
        const { video } = pipData;

        video.addEventListener('leavepictureinpicture', () => {
            this.removePiPWindow(pipId);
        });

        video.addEventListener('enterpictureinpicture', () => {
            this.notificationSystem.show('success', 'PiP Active', 'Picture-in-Picture window opened');
        });
    }

    generatePiPId() {
        return `pip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    removePiPWindow(pipId) {
        const pipData = this.activePiPWindows.get(pipId);
        if (pipData) {
            pipData.stream.getTracks().forEach(track => track.stop());
            pipData.video.remove();
            this.activePiPWindows.delete(pipId);
            
            this.updatePiPList();
            this.updateStatus(`${this.activePiPWindows.size} PiP windows active`);
            
            if (this.activePiPWindows.size === 0) {
                this.hideControls();
            }
        }
    }

    updatePiPList() {
        const pipList = document.getElementById('pipList');
        const pipCount = document.getElementById('pipCount');
        
        pipCount.textContent = `${this.activePiPWindows.size} PiP windows`;
        
        if (this.activePiPWindows.size === 0) {
            pipList.innerHTML = `
                <div class="no-pip-message">
                    <i class="fas fa-window-restore"></i>
                    <p>No active PiP windows</p>
                </div>
            `;
        } else {
            pipList.innerHTML = '';
            this.activePiPWindows.forEach((pipData, pipId) => {
                const pipItem = this.createPiPListItem(pipData, pipId);
                pipList.appendChild(pipItem);
            });
        }
    }

    createPiPListItem(pipData, pipId) {
        const item = document.createElement('div');
        item.className = 'pip-item';
        item.innerHTML = `
            <div class="pip-item-content">
                <div class="pip-item-info">
                    <i class="fas fa-${this.getModeIcon(pipData.mode)}"></i>
                    <span>${pipData.mode.charAt(0).toUpperCase() + pipData.mode.slice(1)} Capture</span>
                </div>
                <div class="pip-item-controls">
                    <button class="pip-control-btn" data-action="close" data-pip-id="${pipId}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
        
        item.querySelector('.pip-control-btn').addEventListener('click', () => {
            this.removePiPWindow(pipId);
        });
        
        return item;
    }

    getModeIcon(mode) {
        const icons = {
            screen: 'desktop',
            window: 'window-maximize',
            tab: 'globe',
            camera: 'camera'
        };
        return icons[mode] || 'play';
    }

    handleControl(action, value) {
        switch (action) {
            case 'resize':
                this.resizePiP(value);
                break;
            case 'position':
                this.positionPiP(value);
                break;
            case 'audio':
                this.toggleAudio();
                break;
        }
    }

    resizePiP(size) {
        this.activePiPWindows.forEach((pipData) => {
            pipData.size = size;
            this.applyPiPSettings(pipData.id);
        });
        
        this.notificationSystem.show('info', 'Size Changed', `PiP size set to ${size}`);
    }

    positionPiP(position) {
        this.activePiPWindows.forEach((pipData) => {
            pipData.position = position;
            this.applyPiPSettings(pipData.id);
        });
        
        this.notificationSystem.show('info', 'Position Changed', `PiP position set to ${position}`);
    }

    toggleAudio() {
        this.activePiPWindows.forEach((pipData) => {
            pipData.audioEnabled = !pipData.audioEnabled;
            pipData.video.muted = !pipData.audioEnabled;
        });
        
        const audioState = this.activePiPWindows.size > 0 && 
            Array.from(this.activePiPWindows.values())[0].audioEnabled ? 'enabled' : 'disabled';
        
        this.notificationSystem.show('info', 'Audio Toggled', `Audio ${audioState}`);
    }

    applyPiPSettings(pipId) {
        const pipData = this.activePiPWindows.get(pipId);
        if (!pipData) return;

        // Apply size
        const sizes = {
            small: { width: 320, height: 180 },
            medium: { width: 480, height: 270 },
            large: { width: 640, height: 360 }
        };

        const size = sizes[pipData.size] || sizes.medium;
        
        // Note: PiP size control is limited by browser implementation
        // This is more of a conceptual implementation
        console.log(`Applying settings to PiP ${pipId}:`, { size, position: pipData.position });
    }

    togglePiP() {
        if (this.activePiPWindows.size > 0) {
            this.closeAllPiP();
        } else {
            this.startCapture('screen');
        }
    }

    closeAllPiP() {
        this.activePiPWindows.forEach((pipData, pipId) => {
            this.removePiPWindow(pipId);
        });
        
        this.notificationSystem.show('info', 'PiP Closed', 'All PiP windows closed');
    }

    toggleSettings() {
        const overlay = document.getElementById('settingsOverlay');
        overlay.classList.toggle('active');
    }

    toggleTheme() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        html.setAttribute('data-theme', newTheme);
        this.saveSetting('theme', newTheme);
        
        const icon = document.querySelector('#themeToggle i');
        icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        
        this.notificationSystem.show('info', 'Theme Changed', `${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)} theme activated`);
    }

    showControls() {
        document.getElementById('controlsPanel').style.display = 'block';
    }

    hideControls() {
        document.getElementById('controlsPanel').style.display = 'none';
    }

    updateStatus(text) {
        document.getElementById('statusText').textContent = text;
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('pipify_settings');
            return saved ? JSON.parse(saved) : this.getDefaultSettings();
        } catch (error) {
            console.error('Error loading settings:', error);
            return this.getDefaultSettings();
        }
    }

    getDefaultSettings() {
        return {
            theme: 'dark',
            autoStartPiP: false,
            rememberPositions: true,
            defaultSize: 'medium',
            audioEnabled: true,
            multiplePiP: true,
            pipQuality: 'medium'
        };
    }

    saveSetting(key, value) {
        this.settings[key] = value;
        localStorage.setItem('pipify_settings', JSON.stringify(this.settings));
    }

    handleCaptureError(error) {
        let message = 'Unknown error occurred';
        
        if (error.name === 'NotAllowedError') {
            message = 'Permission denied. Please allow screen sharing.';
        } else if (error.name === 'NotFoundError') {
            message = 'No screen or window selected.';
        } else if (error.name === 'NotSupportedError') {
            message = 'Screen sharing not supported in this browser.';
        } else if (error.name === 'NotReadableError') {
            message = 'Unable to read screen content.';
        }
        
        this.notificationSystem.show('error', 'Capture Failed', message);
        this.updateStatus('Capture failed');
    }

    updateUI() {
        // Apply theme
        document.documentElement.setAttribute('data-theme', this.settings.theme);
        
        // Update theme icon
        const themeIcon = document.querySelector('#themeToggle i');
        themeIcon.className = this.settings.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        
        // Load settings into form
        Object.keys(this.settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = this.settings[key];
                } else {
                    element.value = this.settings[key];
                }
            }
        });
    }
}

// Notification System
class NotificationSystem {
    constructor() {
        this.container = document.getElementById('notificationContainer');
    }

    show(type, title, message, duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icon = this.getIconForType(type);
        
        notification.innerHTML = `
            <i class="fas ${icon} notification-icon"></i>
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        notification.querySelector('.notification-close').addEventListener('click', () => {
            this.removeNotification(notification);
        });
        
        this.container.appendChild(notification);
        
        // Auto remove after duration
        setTimeout(() => {
            this.removeNotification(notification);
        }, duration);
    }

    getIconForType(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        return icons[type] || 'fa-info-circle';
    }

    removeNotification(notification) {
        notification.style.animation = 'slideOutRight 0.3s ease-in-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.pipify = new AdvancedPiPify();
});

// Add slideOutRight animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .pip-item {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: 1rem;
        margin-bottom: 0.5rem;
    }
    
    .pip-item-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    
    .pip-item-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--text-primary);
        font-weight: 500;
    }
    
    .pip-control-btn {
        background: var(--error-color);
        color: white;
        border: none;
        padding: 0.5rem;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all var(--transition-fast);
    }
    
    .pip-control-btn:hover {
        background: #dc2626;
        transform: scale(1.05);
    }
`;
document.head.appendChild(style);
