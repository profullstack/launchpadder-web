/**
 * Supabase configuration and client initialization
 */
import { createClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';

// Get environment variables - use different sources for client vs server
let SUPABASE_URL, SUPABASE_ANON_KEY;

if (browser) {
  // Client-side: use SvelteKit's public env vars
  try {
    const { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } = await import('$env/static/public');
    SUPABASE_URL = PUBLIC_SUPABASE_URL;
    SUPABASE_ANON_KEY = PUBLIC_SUPABASE_ANON_KEY;
  } catch (error) {
    console.error('Failed to import public environment variables:', error);
    // Fallback to process.env even on client side
    SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
    SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;
  }
} else {
  // Server-side: use process.env directly with Docker environment variables
  SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;
}

console.log('Supabase config:', {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY ? 'present' : 'missing',
  environment: browser ? 'client' : 'server'
});

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables:', {
    SUPABASE_URL,
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? 'present' : 'missing',
    environment: browser ? 'client' : 'server'
  });
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

export default supabase;