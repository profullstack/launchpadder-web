<script>
  import { themeStore, THEMES, getThemeIcon, getThemeLabel } from '$lib/stores/theme.js';
  import { onMount } from 'svelte';
  
  export let variant = 'button'; // 'button' | 'dropdown' | 'icon'
  export let showLabel = true;
  export let size = 'medium'; // 'small' | 'medium' | 'large'
  
  let currentTheme = THEMES.SYSTEM;
  let isDropdownOpen = false;
  let mounted = false;
  
  // Subscribe to theme changes
  $: currentTheme = $themeStore;
  
  onMount(() => {
    mounted = true;
    themeStore.init();
    
    // Close dropdown when clicking outside
    const handleClickOutside = (event) => {
      if (isDropdownOpen && !event.target.closest('.theme-dropdown')) {
        isDropdownOpen = false;
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  });
  
  function toggleTheme() {
    if (variant === 'button') {
      themeStore.toggle();
    } else {
      isDropdownOpen = !isDropdownOpen;
    }
  }
  
  function selectTheme(theme) {
    themeStore.setTheme(theme);
    isDropdownOpen = false;
  }
  
  function getIcon(theme) {
    const iconName = getThemeIcon(theme);
    switch (iconName) {
      case 'sun':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>`;
      case 'moon':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>`;
      case 'monitor':
        return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>`;
      default:
        return '';
    }
  }
</script>

{#if mounted}
  {#if variant === 'button'}
    <!-- Simple toggle button -->
    <button 
      class="theme-toggle theme-toggle-{size}" 
      on:click={toggleTheme}
      aria-label="Toggle theme"
      title="Toggle between light and dark mode"
    >
      <span class="theme-icon" class:animate={true}>
        {@html getIcon(currentTheme)}
      </span>
      {#if showLabel}
        <span class="theme-label">{getThemeLabel(currentTheme)}</span>
      {/if}
    </button>
    
  {:else if variant === 'dropdown'}
    <!-- Dropdown with all theme options -->
    <div class="theme-dropdown">
      <button 
        class="theme-dropdown-trigger theme-toggle-{size}" 
        on:click={toggleTheme}
        aria-label="Select theme"
        aria-expanded={isDropdownOpen}
      >
        <span class="theme-icon">
          {@html getIcon(currentTheme)}
        </span>
        {#if showLabel}
          <span class="theme-label">{getThemeLabel(currentTheme)}</span>
        {/if}
        <svg class="dropdown-arrow" class:open={isDropdownOpen} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6,9 12,15 18,9"></polyline>
        </svg>
      </button>
      
      {#if isDropdownOpen}
        <div class="theme-dropdown-menu">
          {#each Object.values(THEMES) as theme}
            <button 
              class="theme-option" 
              class:active={theme === currentTheme}
              on:click={() => selectTheme(theme)}
            >
              <span class="theme-icon">
                {@html getIcon(theme)}
              </span>
              <span class="theme-label">{getThemeLabel(theme)}</span>
              {#if theme === currentTheme}
                <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20,6 9,17 4,12"></polyline>
                </svg>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    
  {:else if variant === 'icon'}
    <!-- Icon-only button -->
    <button 
      class="theme-icon-only theme-toggle-{size}" 
      on:click={toggleTheme}
      aria-label="Toggle theme"
      title="Toggle between light and dark mode"
    >
      <span class="theme-icon" class:animate={true}>
        {@html getIcon(currentTheme)}
      </span>
    </button>
  {/if}
{/if}

<style>
  /* Base theme toggle styles */
  .theme-toggle,
  .theme-dropdown-trigger,
  .theme-icon-only {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-color, #d1d5db);
    border-radius: 0.375rem;
    background: var(--bg-color, white);
    color: var(--text-color, #374151);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
    line-height: 1;
  }
  
  .theme-toggle:hover,
  .theme-dropdown-trigger:hover,
  .theme-icon-only:hover {
    background: var(--bg-hover-color, #f9fafb);
    border-color: var(--border-hover-color, #9ca3af);
  }
  
  .theme-toggle:focus,
  .theme-dropdown-trigger:focus,
  .theme-icon-only:focus {
    outline: 2px solid var(--focus-color, #2563eb);
    outline-offset: 2px;
  }
  
  /* Size variants */
  .theme-toggle-small,
  .theme-dropdown-trigger.theme-toggle-small,
  .theme-icon-only.theme-toggle-small {
    padding: 0.375rem 0.5rem;
    font-size: 0.75rem;
  }
  
  .theme-toggle-small .theme-icon {
    width: 16px;
    height: 16px;
  }
  
  .theme-toggle-large,
  .theme-dropdown-trigger.theme-toggle-large,
  .theme-icon-only.theme-toggle-large {
    padding: 0.75rem 1rem;
    font-size: 1rem;
  }
  
  .theme-toggle-large .theme-icon {
    width: 24px;
    height: 24px;
  }
  
  /* Icon styles */
  .theme-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    transition: transform 0.3s ease;
  }
  
  .theme-icon.animate {
    animation: themeChange 0.3s ease;
  }
  
  @keyframes themeChange {
    0% { transform: rotate(0deg) scale(1); }
    50% { transform: rotate(180deg) scale(0.8); }
    100% { transform: rotate(360deg) scale(1); }
  }
  
  /* Icon-only variant */
  .theme-icon-only {
    padding: 0.5rem;
    min-width: 40px;
    justify-content: center;
  }
  
  .theme-icon-only.theme-toggle-small {
    padding: 0.375rem;
    min-width: 32px;
  }
  
  .theme-icon-only.theme-toggle-large {
    padding: 0.75rem;
    min-width: 48px;
  }
  
  /* Dropdown styles */
  .theme-dropdown {
    position: relative;
    display: inline-block;
  }
  
  .dropdown-arrow {
    transition: transform 0.2s ease;
  }
  
  .dropdown-arrow.open {
    transform: rotate(180deg);
  }
  
  .theme-dropdown-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.25rem;
    min-width: 160px;
    background: var(--bg-color, white);
    border: 1px solid var(--border-color, #d1d5db);
    border-radius: 0.5rem;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    z-index: 50;
    overflow: hidden;
  }
  
  .theme-option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    border: none;
    background: transparent;
    color: var(--text-color, #374151);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }
  
  .theme-option:hover {
    background: var(--bg-hover-color, #f9fafb);
  }
  
  .theme-option.active {
    background: var(--bg-active-color, #eff6ff);
    color: var(--text-active-color, #2563eb);
  }
  
  .check-icon {
    margin-left: auto;
    color: var(--success-color, #16a34a);
  }
  
  /* Dark theme styles */
  :global(.theme-dark) .theme-toggle,
  :global(.theme-dark) .theme-dropdown-trigger,
  :global(.theme-dark) .theme-icon-only {
    --bg-color: #374151;
    --bg-hover-color: #4b5563;
    --bg-active-color: #1e3a8a;
    --text-color: #f9fafb;
    --text-active-color: #60a5fa;
    --border-color: #4b5563;
    --border-hover-color: #6b7280;
    --focus-color: #60a5fa;
    --success-color: #22c55e;
  }
  
  :global(.theme-dark) .theme-dropdown-menu {
    --bg-color: #374151;
    --bg-hover-color: #4b5563;
    --bg-active-color: #1e3a8a;
    --text-color: #f9fafb;
    --text-active-color: #60a5fa;
    --border-color: #4b5563;
  }
  
  /* Light theme styles (explicit for clarity) */
  :global(.theme-light) .theme-toggle,
  :global(.theme-light) .theme-dropdown-trigger,
  :global(.theme-light) .theme-icon-only {
    --bg-color: white;
    --bg-hover-color: #f9fafb;
    --bg-active-color: #eff6ff;
    --text-color: #374151;
    --text-active-color: #2563eb;
    --border-color: #d1d5db;
    --border-hover-color: #9ca3af;
    --focus-color: #2563eb;
    --success-color: #16a34a;
  }
  
  :global(.theme-light) .theme-dropdown-menu {
    --bg-color: white;
    --bg-hover-color: #f9fafb;
    --bg-active-color: #eff6ff;
    --text-color: #374151;
    --text-active-color: #2563eb;
    --border-color: #d1d5db;
  }
  
  /* Mobile responsiveness */
  @media (max-width: 640px) {
    .theme-dropdown-menu {
      right: auto;
      left: 0;
      min-width: 140px;
    }
    
    .theme-option {
      padding: 0.625rem 0.75rem;
      font-size: 0.8125rem;
    }
  }
</style>