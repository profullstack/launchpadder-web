import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
    // If your environment is not supported or you settled on a specific environment, switch out the adapter.
    // See https://kit.svelte.dev/docs/adapters for more information about adapters.
    adapter: adapter({
      // default options are shown
      out: 'build',
      precompress: false,
      envPrefix: '',
    }),
    
    // Configure API routes
    files: {
      routes: 'src/routes'
    },
    
    // Configure environment variables
    env: {
      publicPrefix: 'PUBLIC_'
    },
    
    // Configure CSP for security
    csp: {
      mode: 'auto',
      directives: {
        'script-src': ['self', 'unsafe-inline'],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:', 'https:'],
        'connect-src': ['self', 'https://api.openai.com', 'wss:']
      }
    }
  }
};

export default config;