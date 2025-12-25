/**
 * ViewTransform - Coordinate transformation utilities
 * 
 * Handles world-to-screen coordinate transformations for different player perspectives.
 * Useful for multiplayer games where players need different viewpoints.
 */
export default class ViewTransform {
    constructor(centerX, centerY) {
        this.centerX = centerX;
        this.centerY = centerY;
        this.scale = 1; // Global scale factor
    }

    /**
     * Update center position and scale
     * @param {number} centerX 
     * @param {number} centerY 
     * @param {number} scale 
     */
    update(centerX, centerY, scale) {
        this.centerX = centerX;
        this.centerY = centerY;
        this.scale = scale;
    }

    /**
     * Transform world coordinates to screen coordinates based on player role
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {number} z - World Z coordinate (height)
     * @param {string} role - Player role ('A' for normal, 'B' for inverted)
     * @returns {{x: number, y: number}} Screen coordinates
     */
    worldToScreen(x, y, z = 0, role) {
        const scaledX = x * this.scale;
        const scaledY = y * this.scale;
        const scaledZ = z * this.scale;

        let screenX, screenY;

        if (role === 'B') {
            screenX = this.centerX - scaledX;
            screenY = this.centerY - scaledY;
        } else {
            screenX = this.centerX + scaledX;
            screenY = this.centerY + scaledY;
        }

        // Apply Perfectly Symmetrical Z-parallax (2.5D depth effect)
        // To maintain 100% symmetry in the relative system, height moves objects
        // towards the net from both sides symmetrically.
        // Near edge (y = 240) -> Shift Upwards (-z)
        // Net (y = 0)       -> Shift Zero
        // Far edge (y = -240) -> Shift Downwards (+z)
        const TABLE_HALF_LENGTH = 240;
        const parallaxShift = scaledZ * (y / TABLE_HALF_LENGTH);
        screenY -= parallaxShift;

        return { x: screenX, y: screenY };
    }

    /**
     * Transform screen coordinates to world coordinates based on player role
     * @param {number} screenX - Screen X coordinate
     * @param {number} screenY - Screen Y coordinate
     * @param {string} role - Player role ('A' for normal, 'B' for inverted)
     * @returns {{x: number, y: number}} World coordinates
     */
    screenToWorld(screenX, screenY, role) {
        let scaledWorldX, scaledWorldY;

        if (role === 'B') {
            scaledWorldX = this.centerX - screenX;
            scaledWorldY = this.centerY - screenY;
        } else {
            scaledWorldX = screenX - this.centerX;
            scaledWorldY = screenY - this.centerY;
        }

        return {
            x: scaledWorldX / this.scale,
            y: scaledWorldY / this.scale
        };
    }

    /**
     * Calculate scale based on Z position for depth effect
     * @param {number} z - Z coordinate (height)
     * @param {number} baseScale - Base scale value
     * @param {number} scaleFactor - How much Z affects scale
     * @returns {number} Calculated scale
     */
    calculateDepthScale(z, baseScale, scaleFactor) {
        return (baseScale * this.scale) + ((z * this.scale) / scaleFactor);
    }

    /**
     * Transform local coordinates to network coordinates.
     * In the "Relative Symmetry" system, we both act as Player A locally.
     * If I am Role B, my local Bottom (+Y) must be flipped to Top (-Y) for the server.
     */
    toNetwork(state, role) {
        if (role === 'B') {
            return {
                x: -state.x,
                y: -state.y,
                vx: -state.vx,
                vy: -state.vy,
                z: state.z,
                vz: state.vz,
                spin: state.spin // Spin is absolute (topspin is topspin for both)
            };
        }
        return state;
    }

    fromNetwork(state, localRole) {
        if (localRole === 'B') {
            return {
                x: -(state.x || 0),
                y: -(state.y || 0),
                vx: -(state.vx || 0),
                vy: -(state.vy || 0),
                z: state.z || 0,
                vz: state.vz || 0,
                spin: state.spin || 0
            };
        }
        return state;
    }
}
