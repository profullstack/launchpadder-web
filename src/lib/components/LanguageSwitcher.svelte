<script>
  import { createEventDispatcher } from 'svelte';
  import { locale } from 'svelte-i18n';
  import { _ } from 'svelte-i18n';
  import { SUPPORTED_LOCALES, LOCALE_METADATA, setLocale } from '$lib/i18n/index.js';
  
  export let variant = 'dropdown'; // 'dropdown', 'buttons', 'select'
  export let showFlags = true;
  export let showLabels = true;
  export let size = 'medium'; // 'small', 'medium', 'large'
  export let position = 'bottom-right'; // 'bottom-left', 'bottom-right', 'top-left', 'top-right'
  
  const dispatch = createEventDispatcher();
  
  let isOpen = false;
  let currentLocale = $locale || 'en';
  
  // Update current locale when store changes
  $: currentLocale = $locale || 'en';
  
  async function handleLanguageChange(newLocale) {
    if (newLocale === currentLocale) return;
    
    try {
      await setLocale(newLocale);
      dispatch('languageChanged', { locale: newLocale });
      isOpen = false;
    } catch (error) {
      console.error('Failed to change language:', error);
      dispatch('error', { error });
    }
  }
  
  function toggleDropdown() {
    isOpen = !isOpen;
  }
  
  function closeDropdown() {
    isOpen = false;
  }
  
  // Close dropdown when clicking outside
  function handleClickOutside(event) {
    if (!event.target.closest('.language-switcher')) {
      closeDropdown();
    }
  }
  
  function handleKeydown(event) {
    if (event.key === 'Escape') {
      closeDropdown();
    }
  }
  
  function getCurrentLanguageData() {
    return LOCALE_METADATA[currentLocale] || LOCALE_METADATA.en;
  }
  
  function getLanguageData(localeCode) {
    return LOCALE_METADATA[localeCode] || LOCALE_METADATA.en;
  }
</script>

<svelte:window on:click={handleClickOutside} on:keydown={handleKeydown} />

<div class="language-switcher language-switcher--{variant} language-switcher--{size}" class:is-open={isOpen}>
  {#if variant === 'dropdown'}
    <button
      class="language-trigger"
      on:click={toggleDropdown}
      aria-label={$_('language.select')}
      aria-expanded={isOpen}
      aria-haspopup="true"
    >
      {#if showFlags}
        <span class="language-flag" aria-hidden="true">
          {getCurrentLanguageData().flag}
        </span>
      {/if}
      {#if showLabels}
        <span class="language-label">
          {getCurrentLanguageData().nativeName}
        </span>
      {/if}
      <svg class="language-chevron" class:rotated={isOpen} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6,9 12,15 18,9"></polyline>
      </svg>
    </button>
    
    {#if isOpen}
      <div class="language-dropdown language-dropdown--{position}">
        <div class="language-dropdown-header">
          <span class="language-dropdown-title">{$_('language.select')}</span>
        </div>
        <ul class="language-list" role="menu">
          {#each SUPPORTED_LOCALES as localeCode}
            {@const languageData = getLanguageData(localeCode)}
            <li role="none">
              <button
                class="language-option"
                class:active={localeCode === currentLocale}
                on:click={() => handleLanguageChange(localeCode)}
                role="menuitem"
                aria-label={$_('language.switch', { values: { language: languageData.name } })}
              >
                {#if showFlags}
                  <span class="language-flag" aria-hidden="true">
                    {languageData.flag}
                  </span>
                {/if}
                <div class="language-info">
                  <span class="language-name">{languageData.name}</span>
                  <span class="language-native">{languageData.nativeName}</span>
                </div>
                {#if localeCode === currentLocale}
                  <svg class="language-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20,6 9,17 4,12"></polyline>
                  </svg>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  
  {:else if variant === 'buttons'}
    <div class="language-buttons">
      {#each SUPPORTED_LOCALES as localeCode}
        {@const languageData = getLanguageData(localeCode)}
        <button
          class="language-button"
          class:active={localeCode === currentLocale}
          on:click={() => handleLanguageChange(localeCode)}
          aria-label={$_('language.switch', { values: { language: languageData.name } })}
          title={languageData.name}
        >
          {#if showFlags}
            <span class="language-flag" aria-hidden="true">
              {languageData.flag}
            </span>
          {/if}
          {#if showLabels}
            <span class="language-label">
              {localeCode.toUpperCase()}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  
  {:else if variant === 'select'}
    <div class="language-select-wrapper">
      <select
        class="language-select"
        value={currentLocale}
        on:change={(e) => handleLanguageChange(e.target.value)}
        aria-label={$_('language.select')}
      >
        {#each SUPPORTED_LOCALES as localeCode}
          {@const languageData = getLanguageData(localeCode)}
          <option value={localeCode}>
            {showFlags ? `${languageData.flag} ` : ''}{languageData.name}
          </option>
        {/each}
      </select>
      <svg class="language-select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6,9 12,15 18,9"></polyline>
      </svg>
    </div>
  {/if}
</div>

<style>
  .language-switcher {
    position: relative;
    display: inline-block;
  }
  
  /* Trigger Button */
  .language-trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    color: var(--color-text);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 0;
  }
  
  .language-trigger:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-border-hover);
  }
  
  .language-trigger:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  
  .language-flag {
    font-size: 1.125rem;
    line-height: 1;
    flex-shrink: 0;
  }
  
  .language-label {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .language-chevron {
    flex-shrink: 0;
    transition: transform 0.2s ease;
    color: var(--color-text-secondary);
  }
  
  .language-chevron.rotated {
    transform: rotate(180deg);
  }
  
  /* Dropdown */
  .language-dropdown {
    position: absolute;
    z-index: 1000;
    min-width: 200px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    animation: fadeIn 0.15s ease-out;
  }
  
  .language-dropdown--bottom-left {
    top: 100%;
    left: 0;
    margin-top: 0.25rem;
  }
  
  .language-dropdown--bottom-right {
    top: 100%;
    right: 0;
    margin-top: 0.25rem;
  }
  
  .language-dropdown--top-left {
    bottom: 100%;
    left: 0;
    margin-bottom: 0.25rem;
  }
  
  .language-dropdown--top-right {
    bottom: 100%;
    right: 0;
    margin-bottom: 0.25rem;
  }
  
  .language-dropdown-header {
    padding: 0.75rem 1rem 0.5rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-secondary);
  }
  
  .language-dropdown-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .language-list {
    list-style: none;
    margin: 0;
    padding: 0.5rem 0;
    max-height: 300px;
    overflow-y: auto;
  }
  
  .language-option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    color: var(--color-text);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.15s ease;
    text-align: left;
  }
  
  .language-option:hover {
    background: var(--color-surface-hover);
  }
  
  .language-option:focus {
    background: var(--color-surface-hover);
    outline: none;
  }
  
  .language-option.active {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }
  
  .language-info {
    flex: 1;
    min-width: 0;
  }
  
  .language-name {
    display: block;
    font-weight: 500;
    line-height: 1.2;
  }
  
  .language-native {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    line-height: 1.2;
  }
  
  .language-check {
    flex-shrink: 0;
    color: var(--color-primary);
  }
  
  /* Button Variant */
  .language-buttons {
    display: flex;
    gap: 0.25rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    padding: 0.25rem;
  }
  
  .language-button {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.5rem;
    background: none;
    border: none;
    border-radius: 0.25rem;
    color: var(--color-text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    min-width: 0;
  }
  
  .language-button:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }
  
  .language-button:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }
  
  .language-button.active {
    background: var(--color-primary);
    color: white;
  }
  
  /* Select Variant */
  .language-select-wrapper {
    position: relative;
    display: inline-block;
  }
  
  .language-select {
    appearance: none;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    color: var(--color-text);
    font-size: 0.875rem;
    padding: 0.5rem 2rem 0.5rem 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 120px;
  }
  
  .language-select:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-border-hover);
  }
  
  .language-select:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  
  .language-select-chevron {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--color-text-secondary);
  }
  
  /* Size Variants */
  .language-switcher--small .language-trigger,
  .language-switcher--small .language-button,
  .language-switcher--small .language-select {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }
  
  .language-switcher--small .language-flag {
    font-size: 1rem;
  }
  
  .language-switcher--large .language-trigger,
  .language-switcher--large .language-button,
  .language-switcher--large .language-select {
    padding: 0.75rem 1rem;
    font-size: 1rem;
  }
  
  .language-switcher--large .language-flag {
    font-size: 1.25rem;
  }
  
  /* Animations */
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-0.5rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  /* Responsive */
  @media (max-width: 768px) {
    .language-dropdown {
      min-width: 180px;
    }
    
    .language-dropdown--bottom-right,
    .language-dropdown--top-right {
      right: 0;
      left: auto;
    }
    
    .language-buttons {
      flex-wrap: wrap;
    }
  }
  
  /* RTL Support */
  :global([dir="rtl"]) .language-dropdown--bottom-left {
    right: 0;
    left: auto;
  }
  
  :global([dir="rtl"]) .language-dropdown--bottom-right {
    left: 0;
    right: auto;
  }
  
  :global([dir="rtl"]) .language-select-chevron {
    right: auto;
    left: 0.5rem;
  }
  
  :global([dir="rtl"]) .language-select {
    padding: 0.5rem 0.75rem 0.5rem 2rem;
  }
</style>