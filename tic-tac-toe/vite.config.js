import { defineConfig } from 'vite';

export default defineConfig({
    base: '/games/tic-tac-toe/', // Served from /games/ subdirectory in Next.js app
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: 'index.html'
            },
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        }
    },
    css: {
        postcss: {}
    },
    server: {
        port: 3000
    }
});
