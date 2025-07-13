<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { supabase } from '$lib/config/supabase.js';
  import { goto } from '$app/navigation';
  import MobileNav from '$lib/components/MobileNav.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
  import { themeStore } from '$lib/stores/theme.js';
  import { initI18n, setLocale, getTextDirection } from '$lib/i18n/index.js';
  import { locale, _ } from 'svelte-i18n';
  import '$lib/styles/themes.css';
  
  export let data;
  
  let user = null;
  let loading = true;
  let mobileMenuOpen = false;

  // Initialize i18n system
  $: if (browser && data?.locale) {
    initI18n(data.locale);
    setLocale(data.locale);
  }

  // Update document direction when locale changes
  $: if (browser && $locale) {
    const direction = getTextDirection();
    document.documentElement.dir = direction;
    document.documentElement.lang = $locale;
  }

  onMount(async () => {
    // Initialize theme system
    themeStore.init();
    
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
    mobileMenuOpen = false;
  }

  function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen;
    // Prevent body scroll when menu is open
    if (typeof document !== 'undefined') {
      if (mobileMenuOpen) {
        document.body.classList.add('mobile-menu-open');
      } else {
        document.body.classList.remove('mobile-menu-open');
      }
    }
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
    // Re-enable body scroll
    if (typeof document !== 'undefined') {
      document.body.classList.remove('mobile-menu-open');
    }
  }

  // Clean up on component destroy
  onMount(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('mobile-menu-open');
      }
    };
  });
</script>

<svelte:head>
  <title>
    {$page.data.title ? `${$page.data.title} | ${$_('brand.name')}` : $_('brand.fullName')}
  </title>
</svelte:head>

<div class="app">
  <header class="header">
    <nav class="nav">
      <div class="nav-brand">
        <a href="/" class="brand-link">
          <h1>{$_('brand.name')}</h1>
          <span class="brand-subtitle">{$_('brand.subtitle')}</span>
        </a>
      </div>
      
      <!-- Desktop Navigation -->
      <div class="nav-links desktop-nav">
        <a href="/" class:active={$page.url.pathname === '/'}>{$_('navigation.home')}</a>
        <a href="/launches" class:active={$page.url.pathname === '/launches'}>{$_('navigation.launches')}</a>
        <a href="/submit" class:active={$page.url.pathname === '/submit'}>{$_('navigation.submit')}</a>
        
        {#if loading}
          <div class="loading-spinner"></div>
        {:else if user}
          <a href="/dashboard" class:active={$page.url.pathname === '/dashboard'}>{$_('navigation.dashboard')}</a>
          <LanguageSwitcher variant="dropdown" size="medium" showFlags={true} showLabels={false} />
          <ThemeToggle variant="icon" size="medium" showLabel={false} />
          <button on:click={handleSignOut} class="btn btn-outline">{$_('navigation.signOut')}</button>
        {:else}
          <LanguageSwitcher variant="dropdown" size="medium" showFlags={true} showLabels={false} />
          <ThemeToggle variant="icon" size="medium" showLabel={false} />
          <a href="/auth/login" class="btn btn-primary">{$_('navigation.signIn')}</a>
        {/if}
      </div>

      <!-- Mobile Hamburger Menu -->
      <button class="mobile-menu-btn" on:click={toggleMobileMenu} aria-label={$_('navigation.toggleMenu')}>
        <div class="hamburger" class:open={mobileMenuOpen}>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </button>
    </nav>
  </header>

  <!-- Mobile Navigation -->
  <MobileNav
    bind:isOpen={mobileMenuOpen}
    {user}
    {loading}
    on:signout={handleSignOut}
    on:close={closeMobileMenu}
  />

  <main class="main">
    <slot />
  </main>

  <footer class="footer">
    <div class="footer-content">
      <div class="footer-section">
        <h3>{$_('brand.name')}</h3>
        <p>{$_('footer.description')}</p>
      </div>
      
      <div class="footer-section">
        <h4>{$_('footer.platform.title')}</h4>
        <ul>
          <li><a href="/launches">{$_('footer.platform.browseLaunches')}</a></li>
          <li><a href="/submit">{$_('footer.platform.submitProduct')}</a></li>
          <li><a href="/api/docs">{$_('footer.platform.apiDocs')}</a></li>
        </ul>
      </div>
      
      <div class="footer-section">
        <h4>{$_('footer.federation.title')}</h4>
        <ul>
          <li><a href="/federation">{$_('footer.federation.joinNetwork')}</a></li>
          <li><a href="/federation/instances">{$_('footer.federation.instances')}</a></li>
          <li><a href="/federation/docs">{$_('footer.federation.docs')}</a></li>
        </ul>
      </div>
      
      <div class="footer-section">
        <h4>{$_('footer.community.title')}</h4>
        <ul>
          <li><a href="https://github.com/your-org/adlp" target="_blank">{$_('footer.community.github')}</a></li>
          <li><a href="/docs">{$_('footer.community.documentation')}</a></li>
          <li><a href="/support">{$_('footer.community.support')}</a></li>
        </ul>
      </div>
    </div>
    
    <div class="footer-bottom">
      <p>{$_('footer.copyright')}</p>
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
    color: var(--color-text);
    background-color: var(--color-background);
    transition: color 0.3s ease, background-color 0.3s ease;
  }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .header {
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    z-index: 100;
    transition: background-color 0.3s ease, border-color 0.3s ease;
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
    color: var(--color-primary);
  }

  .brand-subtitle {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .nav-links a {
    text-decoration: none;
    color: var(--color-text-secondary);
    font-weight: 500;
    transition: color 0.2s;
  }

  .nav-links a:hover,
  .nav-links a.active {
    color: var(--color-primary);
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
    background: var(--color-primary);
    color: white;
  }

  .btn-primary:hover {
    background: var(--color-primary-hover);
  }

  .btn-outline {
    background: transparent;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
  }

  .btn-outline:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--color-border);
    border-top: 2px solid var(--color-primary);
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
    background: var(--color-surface-dark);
    color: var(--color-text-inverse);
    margin-top: auto;
    transition: background-color 0.3s ease;
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
    color: var(--color-text-inverse);
  }

  .footer-section p {
    color: var(--color-text-muted);
    margin-bottom: 1rem;
  }

  .footer-section ul {
    list-style: none;
  }

  .footer-section ul li {
    margin-bottom: 0.5rem;
  }

  .footer-section ul li a {
    color: var(--color-text-muted);
    text-decoration: none;
    transition: color 0.2s;
  }

  .footer-section ul li a:hover {
    color: var(--color-text-inverse);
  }

  .footer-bottom {
    border-top: 1px solid var(--color-border-dark);
    padding: 1rem;
    text-align: center;
    color: var(--color-text-muted);
    max-width: 1200px;
    margin: 0 auto;
  }

  /* Mobile-first responsive design */
  .desktop-nav {
    display: none;
  }

  .mobile-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 0.375rem;
    transition: background-color 0.2s;
  }

  .mobile-menu-btn:hover {
    background: var(--color-surface-hover);
  }

  .hamburger {
    width: 24px;
    height: 18px;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .hamburger span {
    display: block;
    height: 2px;
    width: 100%;
    background: var(--color-text);
    border-radius: 1px;
    transition: all 0.3s ease-in-out;
    transform-origin: center;
  }

  .hamburger.open span:nth-child(1) {
    transform: rotate(45deg) translate(6px, 6px);
  }

  .hamburger.open span:nth-child(2) {
    opacity: 0;
  }

  .hamburger.open span:nth-child(3) {
    transform: rotate(-45deg) translate(6px, -6px);
  }

  /* Tablet and Desktop */
  @media (min-width: 769px) {
    .desktop-nav {
      display: flex;
    }

    .mobile-menu-btn {
      display: none;
    }

    .nav {
      height: 64px;
    }
  }

  /* Mobile styles */
  @media (max-width: 768px) {
    .nav {
      height: 60px;
      padding: 0 1rem;
    }

    .nav-brand h1 {
      font-size: 1.25rem;
    }

    .brand-subtitle {
      font-size: 0.75rem;
    }

    .main {
      padding: 1rem;
    }

    .footer-content {
      grid-template-columns: 1fr;
      text-align: center;
      padding: 2rem 1rem 1rem;
    }

    .footer-section {
      margin-bottom: 1.5rem;
    }

    .footer-section:last-child {
      margin-bottom: 0;
    }
  }

  /* Small mobile devices */
  @media (max-width: 480px) {
    .nav {
      padding: 0 0.75rem;
    }

    .nav-brand h1 {
      font-size: 1.125rem;
    }

    .main {
      padding: 0.75rem;
    }

    .footer-content {
      padding: 1.5rem 0.75rem 1rem;
    }
  }

  /* Prevent body scroll when mobile menu is open */
  :global(body.mobile-menu-open) {
    overflow: hidden;
  }
</style>