import { CONFIG } from '../config.js';

export class Target {
    constructor(scene) {
        this.scene = scene;
        this.rotation = 0; // Current rotation in degrees
        this.rotationDirection = 1; // 1 for clockwise, -1 for counter-clockwise
        this.rotationSpeed = CONFIG.TARGET.ROTATION_SPEED;
        this.sprite = null;
        this.isRotating = true;

        this.createSprite();
    }

    createSprite() {
        this.sprite = this.scene.add.image(
            this.scene.centerX,
            this.scene.centerY,
            'target'
        );

        // Scale to match desired radius
        const scale = (CONFIG.TARGET.RADIUS * 2) / this.sprite.width;
        this.sprite.setScale(scale);
        this.sprite.setDepth(5);
    }

    update(delta) {
        if (!this.isRotating) return;

        // Update rotation
        this.rotation += this.rotationSpeed * this.rotationDirection;

        // Keep rotation in 0-360 range
        if (this.rotation >= 360) {
            this.rotation -= 360;
        } else if (this.rotation < 0) {
            this.rotation += 360;
        }

        // Apply rotation to sprite
        if (this.sprite) {
            this.sprite.setRotation(Phaser.Math.DegToRad(this.rotation));
        }
    }

    setRotationSpeed(speed) {
        this.rotationSpeed = speed;
    }

    setRotationDirection(direction) {
        this.rotationDirection = direction;
    }

    reverseDirection() {
        this.rotationDirection *= -1;
    }

    randomizeDirection() {
        this.rotationDirection = Math.random() < 0.5 ? 1 : -1;
    }

    getRotation() {
        return this.rotation;
    }

    stopRotation() {
        this.isRotating = false;
    }

    startRotation() {
        this.isRotating = true;
    }

    destroy() {
        if (this.sprite) {
            this.sprite.destroy();
        }
    }
}
