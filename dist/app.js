export class FaceTracker {
    constructor() {
        this.isSmiling = false;
        this.isEyebrowsRaised = false;
        this.lastClick = 0;
        this.clickDelay = 500;
        this.cursorX = window.innerWidth / 2;
        this.cursorY = window.innerHeight / 2;
        this.speed = 50;
        this.deadZone = 0.1;
        this.maxAngle = 0.3;
        this.frameId = 0;
        this.moveX = 0;
        this.moveY = 0;
        this.lastTime = 0;
        this.isTracking = false;
        this.baselineMouthWidth = 0;
        this.baselineEyebrowDistance = 0;
        this.lastEyebrowRaiseTime = 0;
        this.eyebrowRaiseCooldown = 1000;
        this.setupElements();
        this.setupFaceMesh();
        this.setupCamera();
        this.startMoving();
        this.cursorX = window.innerWidth / 2;
        this.cursorY = window.innerHeight / 2;
        this.cursor.style.left = `${this.cursorX}px`;
        this.cursor.style.top = `${this.cursorY}px`;
    }
    setupElements() {
        this.video = document.getElementById('webcam');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.status = document.getElementById('status');
        this.cursor = document.getElementById('custom-cursor');
        if (!this.video || !this.canvas || !this.ctx || !this.status || !this.cursor) {
            this.showError('Error: Could not find required elements');
            return;
        }
        this.video.onerror = () => {
            this.showError('Error: Could not access webcam');
        };
    }
    setupFaceMesh() {
        try {
            this.faceMesh = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`;
                }
            });
            this.faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
                enableFaceGeometry: false,
                staticImageMode: false,
                modelComplexity: 0
            });
            this.faceMesh.onResults((results) => {
                try {
                    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
                        this.status.textContent = 'No face detected';
                        return;
                    }
                    this.handleResults(results);
                }
                catch (error) {
                    console.error('Error in handleResults:', error);
                    this.status.textContent = 'Error processing face data';
                }
            });
        }
        catch (error) {
            this.showError('Error setting up face tracking: ' + error.message);
        }
    }
    async setupCamera() {
        try {
            this.camera = new Camera(this.video, {
                onFrame: async () => {
                    if (this.isTracking) {
                        try {
                            await this.faceMesh.send({ image: this.video });
                        }
                        catch (error) {
                            console.error('Face tracking error:', error);
                            this.status.textContent = 'Face tracking error';
                        }
                    }
                },
                width: 640,
                height: 480
            });
            await this.camera.start();
            this.isTracking = true;
            this.status.textContent = 'Camera ready';
        }
        catch (error) {
            this.showError('Error starting camera: ' + error.message);
        }
    }
    showError(message) {
        this.status.textContent = message;
        this.status.style.color = 'red';
        console.error(message);
    }
    handleResults(results) {
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            this.status.textContent = 'No face detected';
            return;
        }
        const landmarks = results.multiFaceLandmarks[0];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const leftCorner = landmarks[61];
        const rightCorner = landmarks[291];
        const mouthCornerDistance = Math.sqrt(Math.pow(leftCorner.x - rightCorner.x, 2) +
            Math.pow(leftCorner.y - rightCorner.y, 2));
        if (!this.baselineMouthWidth) {
            this.baselineMouthWidth = mouthCornerDistance;
            return;
        }
        const smileRatio = mouthCornerDistance / this.baselineMouthWidth;
        const leftEyebrow = landmarks[70];
        const rightEyebrow = landmarks[300];
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const leftEyebrowDistance = Math.sqrt(Math.pow(leftEyebrow.x - leftEye.x, 2) +
            Math.pow(leftEyebrow.y - leftEye.y, 2));
        const rightEyebrowDistance = Math.sqrt(Math.pow(rightEyebrow.x - rightEye.x, 2) +
            Math.pow(rightEyebrow.y - rightEye.y, 2));
        if (!this.baselineEyebrowDistance) {
            this.baselineEyebrowDistance = (leftEyebrowDistance + rightEyebrowDistance) / 2;
            return;
        }
        const currentEyebrowDistance = (leftEyebrowDistance + rightEyebrowDistance) / 2;
        const eyebrowRatio = currentEyebrowDistance / this.baselineEyebrowDistance;
        const nose = landmarks[4];
        const turnX = nose.x - 0.5;
        const turnY = nose.y - 0.5;
        this.moveX = this.getMoveX(turnX);
        this.moveY = this.getMoveY(turnY);
        this.checkGestures(smileRatio, eyebrowRatio);
    }
    checkGestures(smileRatio, eyebrowRatio) {
        const now = Date.now();
        if (smileRatio > 1.1 && !this.isSmiling && now - this.lastClick > this.clickDelay) {
            this.leftClick();
            this.isSmiling = true;
            this.lastClick = now;
            this.status.textContent = 'Left click (smile)';
        }
        else if (smileRatio <= 1.05) {
            this.isSmiling = false;
        }
        if (eyebrowRatio > 1.15 && !this.isEyebrowsRaised &&
            now - this.lastClick > this.clickDelay &&
            now - this.lastEyebrowRaiseTime > this.eyebrowRaiseCooldown) {
            this.rightClick();
            this.isEyebrowsRaised = true;
            this.lastClick = now;
            this.lastEyebrowRaiseTime = now;
            this.status.textContent = 'Right click (eyebrows raised)';
        }
        else if (eyebrowRatio <= 1.1) {
            this.isEyebrowsRaised = false;
        }
    }
    leftClick() {
        this.cursor.style.backgroundColor = '#2196F3';
        setTimeout(() => {
            this.cursor.style.backgroundColor = 'transparent';
        }, 150);
        const event = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: this.cursorX,
            clientY: this.cursorY,
            button: 0
        });
        document.dispatchEvent(event);
    }
    rightClick() {
        this.cursor.style.backgroundColor = '#F44336';
        setTimeout(() => {
            this.cursor.style.backgroundColor = 'transparent';
        }, 150);
        const event = new MouseEvent('contextmenu', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: this.cursorX,
            clientY: this.cursorY,
            button: 2
        });
        document.dispatchEvent(event);
    }
    getMoveX(turn) {
        const zone = this.deadZone * 0.5;
        if (Math.abs(turn) < zone) {
            return 0;
        }
        const move = (Math.abs(turn) - zone) / (this.maxAngle - zone);
        const speed = Math.min(1, move * 2) * Math.sign(turn) * -1;
        return speed;
    }
    getMoveY(turn) {
        const zone = this.deadZone * 0.5;
        if (Math.abs(turn) < zone) {
            return 0;
        }
        const move = (Math.abs(turn) - zone) / (this.maxAngle - zone);
        const speed = Math.min(1, move * 2) * Math.sign(turn);
        return speed;
    }
    startMoving() {
        const move = (time) => {
            if (!this.lastTime)
                this.lastTime = time;
            const delta = (time - this.lastTime) / 16.67;
            this.lastTime = time;
            const acceleration = Math.min(3.0, 1.0 + Math.abs(this.moveX) + Math.abs(this.moveY));
            this.cursorX += this.moveX * this.speed * delta * acceleration;
            this.cursorY += this.moveY * this.speed * delta * acceleration;
            this.cursorX = Math.max(0, Math.min(window.innerWidth, this.cursorX));
            this.cursorY = Math.max(0, Math.min(window.innerHeight, this.cursorY));
            this.cursor.style.left = `${this.cursorX}px`;
            this.cursor.style.top = `${this.cursorY}px`;
            const event = new MouseEvent('mousemove', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: this.cursorX,
                clientY: this.cursorY
            });
            document.dispatchEvent(event);
            this.frameId = requestAnimationFrame(move);
        };
        this.frameId = requestAnimationFrame(move);
    }
}
window.addEventListener('load', () => {
    new FaceTracker();
});
