import { defineConfig } from 'vite';

export default defineConfig({
    base: '/games/knife-throw/', // Served from /games/ subdirectory in Next.js app
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
        // Don't use parent PostCSS config (from Next.js)
        postcss: {}
    },
    server: {
        port: 3000
    }
});
