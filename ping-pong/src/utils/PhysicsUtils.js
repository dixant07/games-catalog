import GameConfig from '../config/GameConfig.js';

/**
 * PhysicsUtils - Reusable physics utilities
 * 
 * Common physics calculations that can be used across different games.
 */
export default class PhysicsUtils {
    /**
     * Apply gravity to a velocity
     * @param {number} vz - Current vertical velocity
     * @param {number} dt - Delta time in seconds
     * @returns {number} Updated velocity
     */
    static applyGravity(vz, dt) {
        return vz - (GameConfig.PHYSICS.GRAVITY * dt);
    }

    /**
     * Apply bounce physics
     * @param {number} vz - Current vertical velocity
     * @returns {number} Bounced velocity
     */
    static bounce(vz) {
        return -vz * GameConfig.PHYSICS.BOUNCE_DAMPING;
    }

    /**
     * Apply friction to horizontal velocity
     * @param {number} velocity - Current velocity
     * @returns {number} Velocity with friction applied
     */
    static applyFriction(velocity) {
        return velocity * GameConfig.PHYSICS.FRICTION;
    }

    /**
     * Clamp velocity to maximum speed
     * @param {number} velocity - Current velocity
     * @param {number} maxSpeed - Maximum allowed speed (optional, uses config default)
     * @returns {number} Clamped velocity
     */
    static clampVelocity(velocity, maxSpeed = null) {
        const max = maxSpeed || GameConfig.PHYSICS.MAX_SPEED;
        return Math.max(-max, Math.min(max, velocity));
    }

    /**
     * Calculate distance between two points
     * @param {number} x1 - First point X
     * @param {number} y1 - First point Y
     * @param {number} x2 - Second point X
     * @param {number} y2 - Second point Y
     * @returns {number} Distance
     */
    static distance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Check if two circles are colliding
     * @param {number} x1 - First circle X
     * @param {number} y1 - First circle Y
     * @param {number} r1 - First circle radius
     * @param {number} x2 - Second circle X
     * @param {number} y2 - Second circle Y
     * @param {number} r2 - Second circle radius
     * @returns {boolean} True if colliding
     */
    static circleCollision(x1, y1, r1, x2, y2, r2) {
        const dist = this.distance(x1, y1, x2, y2);
        return dist < (r1 + r2);
    }

    static isStuck(vx, vy, vz) {
        const threshold = GameConfig.PHYSICS.MIN_STUCK_VELOCITY;
        return Math.abs(vx) < threshold &&
            Math.abs(vy) < threshold &&
            Math.abs(vz) < threshold;
    }
}
