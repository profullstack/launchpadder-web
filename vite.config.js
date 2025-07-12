import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  
  // Development server configuration
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: ['..']
    }
  },
  
  // Build configuration
  build: {
    target: 'node20',
    sourcemap: true,
    rollupOptions: {
      external: ['sharp']
    }
  },
  
  // Define global constants
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version)
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: ['@supabase/supabase-js', 'openai']
  },
  
  // Test configuration
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom'
  }
});