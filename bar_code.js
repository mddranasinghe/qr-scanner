import { BrowserMultiFormatReader, NotFoundException, ChecksumException, FormatException } from 'https://unpkg.com/@zxing/library@0.19.1/index.js';

class BarcodeScanner {
    constructor() {
        this.codeReader = new BrowserMultiFormatReader();
        this.videoElement = document.getElementById('video');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.testCameraBtn = document.getElementById('testCameraBtn');
        this.cameraSelect = document.getElementById('cameraSelect');
        this.resultElement = document.getElementById('result');
        this.resultTypeElement = document.getElementById('resultType');
        this.statusElement = document.getElementById('status');
        this.scanOverlay = document.getElementById('scanOverlay');
        this.videoPlaceholder = document.getElementById('videoPlaceholder');
        
        this.isScanning = false;
        this.selectedDeviceId = null;
        this.devices = [];
        this.currentStream = null;
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        await this.getAvailableDevices();
        
        // Don't auto-start, let user choose camera first
        this.showStatus('Please select a camera and click "Test Camera"', 'info');
    }
    
    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.startScanning());
        this.stopBtn.addEventListener('click', () => this.stopScanning());
        this.testCameraBtn.addEventListener('click', () => this.testCamera());
        this.cameraSelect.addEventListener('change', (e) => {
            this.selectedDeviceId = e.target.value;
            if (this.selectedDeviceId) {
                this.testCamera();
            }
        });
    }
    
    async getAvailableDevices() {
        try {
            // First check if browser supports media devices
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                this.showStatus('Your browser does not support camera access', 'error');
                return;
            }
            
            // Request permission first
            await navigator.mediaDevices.getUserMedia({ video: true });
            
            // Get all video devices
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.devices = devices.filter(device => device.kind === 'videoinput');
            
            if (this.devices.length === 0) {
                this.showStatus('No camera found. Please check your device.', 'error');
                return;
            }
            
            // Populate camera selector
            this.cameraSelect.innerHTML = '<option value="">Select a camera...</option>';
            this.devices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Camera ${index + 1}`;
                this.cameraSelect.appendChild(option);
            });
            
            // Auto-select first camera
            this.selectedDeviceId = this.devices[0].deviceId;
            this.cameraSelect.value = this.selectedDeviceId;
            
            this.showStatus(`✅ Found ${this.devices.length} camera(s). Click "Test Camera" to preview.`, 'success');
            
        } catch (error) {
            console.error('Error getting devices:', error);
            if (error.name === 'NotAllowedError') {
                this.showStatus('Camera permission denied. Please allow camera access and refresh the page.', 'error');
            } else if (error.name === 'NotFoundError') {
                this.showStatus('No camera found on this device.', 'error');
            } else {
                this.showStatus(`Camera error: ${error.message}`, 'error');
            }
        }
    }
    
    async testCamera() {
        try {
            this.showStatus('🔍 Testing camera...', 'info');
            
            // Stop any existing stream
            if (this.currentStream) {
                this.currentStream.getTracks().forEach(track => track.stop());
            }
            
            // Stop ZXing if it's running
            if (this.isScanning) {
                await this.stopScanning();
            }
            
            // Simple camera test with getUserMedia
            const constraints = {
                video: {
                    deviceId: this.selectedDeviceId ? { exact: this.selectedDeviceId } : undefined,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.currentStream = stream;
            
            // Set video source
            this.videoElement.srcObject = stream;
            this.videoElement.style.display = 'block';
            this.videoPlaceholder.style.display = 'none';
            
            // Wait for video to start playing
            await this.videoElement.play();
            
            this.showStatus('✅ Camera working! Click "Start Scanner" to begin scanning.', 'success');
            this.startBtn.disabled = false;
            
        } catch (error) {
            console.error('Camera test failed:', error);
            this.videoElement.style.display = 'none';
            this.videoPlaceholder.style.display = 'flex';
            this.showStatus(`Camera test failed: ${error.message}`, 'error');
            this.startBtn.disabled = true;
        }
    }
    
    async startScanning() {
        if (this.isScanning) {
            return;
        }
        
        if (!this.selectedDeviceId) {
            this.showStatus('Please select a camera first', 'warning');
            return;
        }
        
        try {
            this.showStatus('🔍 Starting scanner...', 'info');
            
            // Ensure camera is running
            if (!this.currentStream || this.currentStream.getVideoTracks().length === 0) {
                await this.testCamera();
            }
            
            // Show scan overlay
            this.scanOverlay.style.display = 'flex';
            
            // Start ZXing scanning
            await this.codeReader.decodeFromVideoDevice(
                this.selectedDeviceId,
                this.videoElement,
                (result, error) => {
                    if (result) {
                        this.handleScanResult(result);
                    }
                    
                    if (error && !(error instanceof NotFoundException)) {
                        // Ignore NotFoundException (no barcode in frame)
                        if (!(error instanceof ChecksumException) && !(error instanceof FormatException)) {
                            console.log('Scan error:', error.name);
                        }
                    }
                }
            );
            
            this.isScanning = true;
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.showStatus('✅ Scanner active - point camera at a barcode', 'success');
            
        } catch (error) {
            console.error('Failed to start scanning:', error);
            this.showStatus(`Failed to start scanner: ${error.message}`, 'error');
            this.scanOverlay.style.display = 'none';
        }
    }
    
    async stopScanning() {
        if (!this.isScanning && !this.currentStream) {
            return;
        }
        
        try {
            // Reset ZXing reader
            this.codeReader.reset();
            this.isScanning = false;
            
            // Stop video stream
            if (this.currentStream) {
                this.currentStream.getTracks().forEach(track => track.stop());
                this.currentStream = null;
                this.videoElement.srcObject = null;
            }
            
            // Hide scan overlay
            this.scanOverlay.style.display = 'none';
            
            // Show placeholder
            this.videoElement.style.display = 'none';
            this.videoPlaceholder.style.display = 'flex';
            
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            
            this.showStatus('⏹ Scanner stopped', 'info');
            
        } catch (error) {
            console.error('Error stopping scanner:', error);
        }
    }
    
    handleScanResult(result) {
        const text = result.getText();
        const format = result.getBarcodeFormat().toString();
        
        // Display the result
        this.resultElement.textContent = text;
        this.resultTypeElement.textContent = format;
        
        // Add visual feedback
        this.resultElement.style.animation = 'none';
        this.resultElement.offsetHeight; // Trigger reflow
        this.resultElement.style.animation = 'pulse 0.5s ease';
        
        // Show success status
        this.showStatus(`✅ Scanned ${format}`, 'success');
        
        // Optional: Add to history
        this.addToHistory(text, format);
        
        // Optional: Beep
        this.playBeep();
        
        console.log(`Scanned ${format}: ${text}`);
    }
    
    addToHistory(text, format) {
        // Create history element
        const historyEntry = document.createElement('div');
        historyEntry.style.padding = '8px';
        historyEntry.style.borderBottom = '1px solid #e0e0e0';
        historyEntry.style.fontSize = '12px';
        historyEntry.innerHTML = `<strong>${format}</strong>: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`;
        
        // You can add this to a history container if you create one
        console.log('Scan history:', { format, text, timestamp: new Date() });
    }
    
    showStatus(message, type) {
        this.statusElement.textContent = message;
        this.statusElement.className = `status ${type}`;
        
        // Auto-clear non-info messages after 5 seconds
        if (type !== 'info') {
            setTimeout(() => {
                if (this.statusElement.textContent === message) {
                    if (this.isScanning) {
                        this.statusElement.textContent = '✅ Scanner active - point camera at a barcode';
                        this.statusElement.className = 'status success';
                    } else {
                        this.statusElement.textContent = 'Select a camera and click "Test Camera" to begin';
                        this.statusElement.className = 'status info';
                    }
                }
            }, 5000);
        }
    }
    
    playBeep() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 880;
            gainNode.gain.value = 0.1;
            
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.2);
            oscillator.stop(audioContext.currentTime + 0.2);
        } catch (error) {
            // Beep not supported, ignore
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.scanner = new BarcodeScanner();
});

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(1.02); background: #e8f5e9; }
        100% { opacity: 1; transform: scale(1); }
    }
`;
document.head.appendChild(style);
