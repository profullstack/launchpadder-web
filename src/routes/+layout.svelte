<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { supabase } from '$lib/config/supabase.js';
  import { goto } from '$app/navigation';
  
  let user = null;
  let loading = true;

  onMount(async () => {
    // Get initial session
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user ?? null;
    loading = false;

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        user = session?.user ?? null;
        
        if (event === 'SIGNED_IN') {
          goto('/dashboard');
        } else if (event === 'SIGNED_OUT') {
          goto('/');
        }
      }
    );

    return () => subscription.unsubscribe();
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
  }
</script>

<svelte:head>
  <title>
    {$page.data.title ? `${$page.data.title} | ADLP` : 'API-Driven Launch Platform'}
  </title>
</svelte:head>

<div class="app">
  <header class="header">
    <nav class="nav">
      <div class="nav-brand">
        <a href="/" class="brand-link">
          <h1>ADLP</h1>
          <span class="brand-subtitle">Launch Platform</span>
        </a>
      </div>
      
      <div class="nav-links">
        <a href="/" class:active={$page.url.pathname === '/'}>Home</a>
        <a href="/launches" class:active={$page.url.pathname === '/launches'}>Launches</a>
        <a href="/submit" class:active={$page.url.pathname === '/submit'}>Submit</a>
        
        {#if loading}
          <div class="loading-spinner"></div>
        {:else if user}
          <a href="/dashboard" class:active={$page.url.pathname === '/dashboard'}>Dashboard</a>
          <button on:click={handleSignOut} class="btn btn-outline">Sign Out</button>
        {:else}
          <a href="/auth/signin" class="btn btn-primary">Sign In</a>
        {/if}
      </div>
    </nav>
  </header>

  <main class="main">
    <slot />
  </main>

  <footer class="footer">
    <div class="footer-content">
      <div class="footer-section">
        <h3>ADLP</h3>
        <p>An open-source, federated platform for launching digital products.</p>
      </div>
      
      <div class="footer-section">
        <h4>Platform</h4>
        <ul>
          <li><a href="/launches">Browse Launches</a></li>
          <li><a href="/submit">Submit Product</a></li>
          <li><a href="/api/docs">API Documentation</a></li>
        </ul>
      </div>
      
      <div class="footer-section">
        <h4>Federation</h4>
        <ul>
          <li><a href="/federation">Join Network</a></li>
          <li><a href="/federation/instances">Instances</a></li>
          <li><a href="/federation/docs">Federation Docs</a></li>
        </ul>
      </div>
      
      <div class="footer-section">
        <h4>Community</h4>
        <ul>
          <li><a href="https://github.com/your-org/adlp" target="_blank">GitHub</a></li>
          <li><a href="/docs">Documentation</a></li>
          <li><a href="/support">Support</a></li>
        </ul>
      </div>
    </div>
    
    <div class="footer-bottom">
      <p>&copy; 2024 ADLP. Open source under MIT License.</p>
    </div>
  </footer>
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #fafafa;
  }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .header {
    background: white;
    border-bottom: 1px solid #e1e5e9;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .nav {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
  }

  .nav-brand .brand-link {
    text-decoration: none;
    color: inherit;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .nav-brand h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: #2563eb;
  }

  .brand-subtitle {
    font-size: 0.875rem;
    color: #6b7280;
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .nav-links a {
    text-decoration: none;
    color: #6b7280;
    font-weight: 500;
    transition: color 0.2s;
  }

  .nav-links a:hover,
  .nav-links a.active {
    color: #2563eb;
  }

  .btn {
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    font-weight: 500;
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover {
    background: #1d4ed8;
  }

  .btn-outline {
    background: transparent;
    color: #6b7280;
    border: 1px solid #d1d5db;
  }

  .btn-outline:hover {
    background: #f9fafb;
    color: #374151;
  }

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #e5e7eb;
    border-top: 2px solid #2563eb;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .main {
    flex: 1;
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1rem;
    width: 100%;
  }

  .footer {
    background: #1f2937;
    color: white;
    margin-top: auto;
  }

  .footer-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 3rem 1rem 2rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
  }

  .footer-section h3,
  .footer-section h4 {
    margin-bottom: 1rem;
    color: white;
  }

  .footer-section p {
    color: #9ca3af;
    margin-bottom: 1rem;
  }

  .footer-section ul {
    list-style: none;
  }

  .footer-section ul li {
    margin-bottom: 0.5rem;
  }

  .footer-section ul li a {
    color: #9ca3af;
    text-decoration: none;
    transition: color 0.2s;
  }

  .footer-section ul li a:hover {
    color: white;
  }

  .footer-bottom {
    border-top: 1px solid #374151;
    padding: 1rem;
    text-align: center;
    color: #9ca3af;
    max-width: 1200px;
    margin: 0 auto;
  }

  @media (max-width: 768px) {
    .nav {
      flex-direction: column;
      height: auto;
      padding: 1rem;
      gap: 1rem;
    }

    .nav-links {
      flex-wrap: wrap;
      justify-content: center;
    }

    .main {
      padding: 1rem;
    }

    .footer-content {
      grid-template-columns: 1fr;
      text-align: center;
    }
  }
</style>