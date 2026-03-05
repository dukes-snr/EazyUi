import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    resolve: {
        preserveSymlinks: true,
        alias: {
            '@': path.resolve(__dirname, './src'),
            three: path.resolve(__dirname, './node_modules/three'),
            '@react-three/fiber': path.resolve(__dirname, './node_modules/@react-three/fiber'),
            '@react-three/drei': path.resolve(__dirname, './node_modules/@react-three/drei'),
        },
        dedupe: ['react', 'react-dom', 'three'],
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            },
        },
    },
    optimizeDeps: {
        esbuildOptions: {
            target: 'esnext'
        }
    },
    build: {
        target: 'esnext',
    }
});
