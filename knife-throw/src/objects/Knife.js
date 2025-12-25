import { CONFIG } from '../config.js';

export class Knife {
    constructor(scene, angle, type, isStuck = false) {
        this.scene = scene;
        this.angle = angle; // Angle on the disc in degrees
        this.type = type; // 'playerA', 'playerB', 'dummy'
        this.isStuck = isStuck;
        this.sprite = null;

        this.createSprite();
    }

    createSprite() {
        const radius = CONFIG.TARGET.RADIUS - CONFIG.KNIFE.PENETRATION_DEPTH;
        const centerX = this.scene.centerX;
        const centerY = this.scene.centerY;

        // Calculate position on the disc edge
        const radians = Phaser.Math.DegToRad(this.angle);
        const x = centerX + Math.cos(radians) * radius;
        const y = centerY + Math.sin(radians) * radius;

        // Choose the correct knife sprite based on type
        let textureKey;
        switch (this.type) {
            case 'playerA':
                textureKey = 'red_knife';
                break;
            case 'playerB':
                textureKey = 'blue_knife';
                break;
            case 'dummy':
                textureKey = 'dummy_knife';
                break;
        }

        this.sprite = this.scene.add.image(x, y, textureKey);
        this.sprite.setScale(0.5);

        // Rotate knife to point toward center
        this.sprite.setRotation(radians + Math.PI / 2);

        if (this.isStuck) {
            this.sprite.setDepth(4); // Below target (depth 5)
        }
    }

    updatePosition(discRotation) {
        if (!this.sprite || !this.isStuck) return;

        const radius = CONFIG.TARGET.RADIUS - CONFIG.KNIFE.PENETRATION_DEPTH;
        const centerX = this.scene.centerX;
        const centerY = this.scene.centerY;

        // Update angle based on disc rotation
        const currentAngle = this.angle + discRotation;
        const radians = Phaser.Math.DegToRad(currentAngle);

        const x = centerX + Math.cos(radians) * radius;
        const y = centerY + Math.sin(radians) * radius;

        this.sprite.setPosition(x, y);
        this.sprite.setRotation(radians + Math.PI / 2);
    }

    destroy() {
        if (this.sprite) {
            this.sprite.destroy();
        }
    }

    // Check if this knife collides with another knife
    checkCollision(otherAngle, discRotation) {
        const normalizedAngle = (this.angle + discRotation) % 360;
        const normalizedOtherAngle = otherAngle % 360;

        let diff = Math.abs(normalizedAngle - normalizedOtherAngle);
        if (diff > 180) {
            diff = 360 - diff;
        }

        return diff < CONFIG.KNIFE.COLLISION_THRESHOLD;
    }
}

export class ThrowingKnife {
    constructor(scene, type, targetAngle, isOpponent = false) {
        this.scene = scene;
        this.type = type;
        this.targetAngle = targetAngle;
        this.isOpponent = isOpponent; // If true, starts from top
        this.sprite = null;
        this.isFlying = true;

        this.createSprite();
    }

    createSprite() {
        const centerX = this.scene.centerX;
        const centerY = this.scene.centerY;

        // Start position - bottom for player, top for opponent
        const startY = this.isOpponent ? 50 : CONFIG.HEIGHT - 50;

        let textureKey;
        switch (this.type) {
            case 'playerA':
                textureKey = 'red_knife';
                break;
            case 'playerB':
                textureKey = 'blue_knife';
                break;
        }

        this.sprite = this.scene.add.image(centerX, startY, textureKey);
        this.sprite.setScale(0.5);

        // Rotation: upward for player (from bottom), downward for opponent (from top)
        this.sprite.setRotation(this.isOpponent ? 0 : Math.PI); // 0 = down, PI = up
        this.sprite.setDepth(20);
    }

    update(delta) {
        if (!this.isFlying || !this.sprite) return false;

        const centerY = this.scene.centerY;
        const targetRadius = CONFIG.TARGET.RADIUS;
        const penetrationDepth = CONFIG.KNIFE.PENETRATION_DEPTH || 0;

        // Calculate target Y position where the knife should stop
        const knifeHeight = this.sprite.displayHeight;
        const targetY = centerY + targetRadius - penetrationDepth + (knifeHeight / 2);

        // Move knife toward target
        let speed = CONFIG.KNIFE.THROW_SPEED * (delta / 1000);

        // Calculate distance to target (different direction for opponent)
        const distanceToTarget = this.isOpponent
            ? targetY - this.sprite.y  // Opponent: moving down (increasing y)
            : this.sprite.y - targetY; // Player: moving up (decreasing y)

        // Snap effect when close to target
        if (distanceToTarget > 0 && distanceToTarget < CONFIG.KNIFE.SNAP_DISTANCE) {
            speed *= CONFIG.KNIFE.SNAP_SPEED_MULTIPLIER;
        }

        // Move in correct direction
        if (this.isOpponent) {
            this.sprite.y += speed; // Move down
        } else {
            this.sprite.y -= speed; // Move up
        }

        // Check if reached target
        const reached = this.isOpponent
            ? this.sprite.y >= targetY
            : this.sprite.y <= targetY;

        if (reached) {
            this.sprite.y = targetY; // Snap to exact position
            this.isFlying = false;
            return true; // Reached target
        }

        return false;
    }

    destroy() {
        if (this.sprite) {
            this.sprite.destroy();
        }
    }

    getPosition() {
        return this.sprite ? { x: this.sprite.x, y: this.sprite.y } : null;
    }
}
