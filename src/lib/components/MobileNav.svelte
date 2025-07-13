<script>
  import { createEventDispatcher } from 'svelte';
  import { page } from '$app/stores';
  import { _ } from 'svelte-i18n';
  import ThemeToggle from './ThemeToggle.svelte';
  import LanguageSwitcher from './LanguageSwitcher.svelte';
  
  export let isOpen = false;
  export let user = null;
  export let loading = false;
  
  const dispatch = createEventDispatcher();
  
  function handleSignOut() {
    dispatch('signout');
  }
  
  function closeMenu() {
    isOpen = false;
    dispatch('close');
  }
  
  function handleLinkClick() {
    closeMenu();
  }
</script>

<!-- Mobile menu overlay -->
{#if isOpen}
  <div class="mobile-overlay" on:click={closeMenu} on:keydown={(e) => e.key === 'Escape' && closeMenu()}></div>
{/if}

<!-- Mobile menu -->
<nav class="mobile-nav" class:open={isOpen}>
  <div class="mobile-nav-header">
    <div class="mobile-brand">
      <h2>{$_('brand.name')}</h2>
      <span>{$_('brand.subtitle')}</span>
    </div>
    <button class="close-btn" on:click={closeMenu} aria-label={$_('navigation.closeMenu')}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>
  
  <div class="mobile-nav-content">
    <div class="mobile-nav-links">
      <a href="/" class:active={$page.url.pathname === '/'} on:click={handleLinkClick}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9,22 9,12 15,12 15,22"></polyline>
        </svg>
        {$_('navigation.home')}
      </a>
      
      <a href="/launches" class:active={$page.url.pathname === '/launches'} on:click={handleLinkClick}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polygon points="10,8 16,12 10,16 10,8"></polygon>
        </svg>
        {$_('navigation.launches')}
      </a>
      
      <a href="/submit" class:active={$page.url.pathname === '/submit'} on:click={handleLinkClick}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        {$_('navigation.submit')}
      </a>
      
      {#if loading}
        <div class="mobile-loading">
          <div class="loading-spinner"></div>
          <span>{$_('common.loading')}</span>
        </div>
      {:else if user}
        <a href="/dashboard" class:active={$page.url.pathname === '/dashboard'} on:click={handleLinkClick}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="9" y1="9" x2="15" y2="9"></line>
            <line x1="9" y1="15" x2="15" y2="15"></line>
          </svg>
          {$_('navigation.dashboard')}
        </a>
        
        <a href="/moderation" class:active={$page.url.pathname === '/moderation'} on:click={handleLinkClick}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 12l2 2 4-4"></path>
            <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"></path>
            <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"></path>
            <path d="M12 3c0 1-1 3-3 3s-3-2-3-3 1-3 3-3 3 2 3 3"></path>
            <path d="M12 21c0-1 1-3 3-3s3 2 3 3-1 3-3 3-3-2-3-3"></path>
          </svg>
          {$_('navigation.moderation')}
        </a>
      {/if}
    </div>
    
    <div class="mobile-nav-settings">
      <div class="settings-section">
        <h4>{$_('language.title')}</h4>
        <LanguageSwitcher variant="select" size="medium" showFlags={true} showLabels={true} />
      </div>
      
      <div class="settings-section">
        <h4>{$_('theme.title')}</h4>
        <ThemeToggle variant="dropdown" size="medium" showLabel={true} />
      </div>
    </div>
    
    <div class="mobile-nav-actions">
      {#if !loading}
        {#if user}
          <div class="user-info">
            <div class="user-avatar">
              {user.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div class="user-details">
              <span class="user-email">{user.email}</span>
              <span class="user-role">{$_('common.active')}</span>
            </div>
          </div>
          
          <button class="mobile-btn mobile-btn-outline" on:click={handleSignOut}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16,17 21,12 16,7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            {$_('navigation.signOut')}
          </button>
        {:else}
          <a href="/auth/login" class="mobile-btn mobile-btn-primary" on:click={handleLinkClick}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
              <polyline points="10,17 15,12 10,7"></polyline>
              <line x1="15" y1="12" x2="3" y2="12"></line>
            </svg>
            {$_('navigation.signIn')}
          </a>
          
          <a href="/auth/signup" class="mobile-btn mobile-btn-outline" on:click={handleLinkClick}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line>
              <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
            {$_('navigation.signUp')}
          </a>
        {/if}
      {/if}
    </div>
  </div>
</nav>

<style>
  .mobile-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 998;
    backdrop-filter: blur(4px);
  }
  
  .mobile-nav {
    position: fixed;
    top: 0;
    right: -100%;
    width: 320px;
    max-width: 85vw;
    height: 100vh;
    background: var(--color-surface);
    z-index: 999;
    transition: right 0.3s ease-in-out;
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
  }
  
  .mobile-nav.open {
    right: 0;
  }
  
  .mobile-nav-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-secondary);
  }
  
  .mobile-brand h2 {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-primary);
    margin: 0;
  }
  
  .mobile-brand span {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    display: block;
    margin-top: -2px;
  }
  
  .close-btn {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 0.375rem;
    transition: all 0.2s;
  }
  
  .close-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }
  
  .mobile-nav-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  
  .mobile-nav-links {
    flex: 1;
    padding: 1rem 0;
  }
  
  .mobile-nav-links a {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1.5rem;
    text-decoration: none;
    color: var(--color-text);
    font-weight: 500;
    transition: all 0.2s;
    border-left: 3px solid transparent;
  }
  
  .mobile-nav-links a:hover {
    background: var(--color-surface-hover);
    color: var(--color-primary);
  }

  .mobile-nav-links a.active {
    background: var(--color-primary-light);
    color: var(--color-primary);
    border-left-color: var(--color-primary);
  }
  
  .mobile-nav-links a svg {
    flex-shrink: 0;
  }
  
  .mobile-loading {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1.5rem;
    color: var(--color-text-secondary);
  }
  
  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border);
    border-top: 2px solid var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .mobile-nav-settings {
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--color-border);
    background: var(--color-surface-secondary);
  }

  .settings-section h4 {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
    margin: 0 0 0.75rem 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .mobile-nav-actions {
    padding: 1.5rem;
    border-top: 1px solid var(--color-border);
    background: var(--color-surface-secondary);
  }
  
  .user-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: var(--color-surface);
    border-radius: 0.5rem;
    border: 1px solid var(--color-border);
  }
  
  .user-avatar {
    width: 40px;
    height: 40px;
    background: var(--color-primary);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.875rem;
  }
  
  .user-details {
    flex: 1;
    min-width: 0;
  }
  
  .user-email {
    display: block;
    font-weight: 500;
    color: var(--color-text);
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .user-role {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }
  
  .mobile-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-weight: 500;
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
  }
  
  .mobile-btn:last-child {
    margin-bottom: 0;
  }
  
  .mobile-btn-primary {
    background: var(--color-primary);
    color: white;
  }

  .mobile-btn-primary:hover {
    background: var(--color-primary-hover);
  }
  
  .mobile-btn-outline {
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }

  .mobile-btn-outline:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-border-hover);
  }
  
  /* Hide on desktop */
  @media (min-width: 769px) {
    .mobile-nav,
    .mobile-overlay {
      display: none;
    }
  }
</style>