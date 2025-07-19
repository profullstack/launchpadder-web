<script>
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';
  
  export let user = null;
  export let profile = null;
  
  const dispatch = createEventDispatcher();
  
  let dropdownOpen = false;
  let dropdownElement;
  
  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
  }
  
  function closeDropdown() {
    dropdownOpen = false;
  }
  
  function handleSignOut() {
    dispatch('signout');
    closeDropdown();
  }
  
  function handleSettings() {
    dispatch('settings');
    closeDropdown();
  }
  
  // Close dropdown when clicking outside
  function handleClickOutside(event) {
    if (dropdownElement && !dropdownElement.contains(event.target)) {
      closeDropdown();
    }
  }
  
  // Generate user initials for avatar
  function getUserInitials(user, profile) {
    if (profile?.full_name) {
      return profile.full_name
        .split(' ')
        .map(name => name.charAt(0))
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (profile?.username) {
      return profile.username.charAt(0).toUpperCase();
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return 'U';
  }
  
  // Get display name
  function getDisplayName(user, profile) {
    if (profile?.full_name) {
      return profile.full_name;
    }
    if (profile?.username) {
      return profile.username;
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return 'User';
  }
  
  $: initials = getUserInitials(user, profile);
  $: displayName = getDisplayName(user, profile);
</script>

<svelte:window on:click={handleClickOutside} />

<div class="user-dropdown" bind:this={dropdownElement}>
  <button 
    class="user-button" 
    on:click={toggleDropdown}
    aria-label={$_('navigation.userMenu')}
    aria-expanded={dropdownOpen}
  >
    <div class="user-avatar">
      {#if profile?.avatar_url}
        <img src={profile.avatar_url} alt={displayName} class="avatar-image" />
      {:else}
        <span class="avatar-initials">{initials}</span>
      {/if}
    </div>
    <span class="user-name">{displayName}</span>
    <svg 
      class="dropdown-arrow" 
      class:rotated={dropdownOpen}
      width="16" 
      height="16" 
      viewBox="0 0 16 16" 
      fill="none"
    >
      <path 
        d="M4 6L8 10L12 6" 
        stroke="currentColor" 
        stroke-width="2" 
        stroke-linecap="round" 
        stroke-linejoin="round"
      />
    </svg>
  </button>
  
  {#if dropdownOpen}
    <div class="dropdown-menu">
      <div class="dropdown-header">
        <div class="user-info">
          <div class="user-name-large">{displayName}</div>
          <div class="user-email">{user?.email || ''}</div>
        </div>
      </div>
      
      <div class="dropdown-divider"></div>
      
      <button class="dropdown-item" on:click={handleSettings}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path 
            d="M8 10C9.10457 10 10 9.10457 10 8C10 6.89543 9.10457 6 8 6C6.89543 6 6 6.89543 6 8C6 9.10457 6.89543 10 8 10Z" 
            stroke="currentColor" 
            stroke-width="1.5" 
            stroke-linecap="round" 
            stroke-linejoin="round"
          />
          <path 
            d="M12.93 8.93C12.8427 9.18 12.8427 9.45 12.93 9.7L13.68 11.18C13.7455 11.3083 13.7764 11.4519 13.7696 11.5959C13.7627 11.7399 13.7183 11.8796 13.64 12C13.4 12.39 12.39 13.4 12 13.64C11.8796 13.7183 11.7399 13.7627 11.5959 13.7696C11.4519 13.7764 11.3083 13.7455 11.18 13.68L9.7 12.93C9.45 12.8427 9.18 12.8427 8.93 12.93L8.18 13.68C8.0517 13.7455 7.9081 13.7764 7.7641 13.7696C7.6201 13.7627 7.4804 13.7183 7.36 13.64C6.97 13.4 5.96 12.39 5.72 12C5.6417 11.8796 5.5973 11.7399 5.5904 11.5959C5.5836 11.4519 5.6145 11.3083 5.68 11.18L6.43 9.7C6.5173 9.45 6.5173 9.18 6.43 8.93L5.68 7.45C5.6145 7.3217 5.5836 7.1781 5.5904 7.0341C5.5973 6.8901 5.6417 6.7504 5.72 6.63C5.96 6.24 6.97 5.23 7.36 4.99C7.4804 4.9117 7.6201 4.8673 7.7641 4.8604C7.9081 4.8536 8.0517 4.8845 8.18 4.95L9.66 5.7C9.91 5.7873 10.18 5.7873 10.43 5.7L11.91 4.95C12.0383 4.8845 12.1819 4.8536 12.3259 4.8604C12.4699 4.8673 12.6096 4.9117 12.73 4.99C13.12 5.23 14.13 6.24 14.37 6.63C14.4483 6.7504 14.4927 6.8901 14.4996 7.0341C14.5064 7.1781 14.4755 7.3217 14.41 7.45L13.66 8.93H12.93Z" 
            stroke="currentColor" 
            stroke-width="1.5" 
            stroke-linecap="round" 
            stroke-linejoin="round"
          />
        </svg>
        {$_('navigation.settings')}
      </button>
      
      <div class="dropdown-divider"></div>
      
      <button class="dropdown-item danger" on:click={handleSignOut}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path 
            d="M6 14H3C2.73478 14 2.48043 13.8946 2.29289 13.7071C2.10536 13.5196 2 13.2652 2 13V3C2 2.73478 2.10536 2.48043 2.29289 2.29289C2.48043 2.10536 2.73478 2 3 2H6" 
            stroke="currentColor" 
            stroke-width="1.5" 
            stroke-linecap="round" 
            stroke-linejoin="round"
          />
          <path 
            d="M11 11L14 8L11 5" 
            stroke="currentColor" 
            stroke-width="1.5" 
            stroke-linecap="round" 
            stroke-linejoin="round"
          />
          <path 
            d="M14 8H6" 
            stroke="currentColor" 
            stroke-width="1.5" 
            stroke-linecap="round" 
            stroke-linejoin="round"
          />
        </svg>
        {$_('navigation.signOut')}
      </button>
    </div>
  {/if}
</div>

<style>
  .user-dropdown {
    position: relative;
    display: inline-block;
  }
  
  .user-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: transparent;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
    color: var(--color-text);
  }
  
  .user-button:hover {
    background: var(--color-surface-hover);
  }
  
  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary);
    color: white;
    font-weight: 600;
    font-size: 0.875rem;
  }
  
  .avatar-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  .avatar-initials {
    font-size: 0.875rem;
    font-weight: 600;
  }
  
  .user-name {
    font-weight: 500;
    color: var(--color-text);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .dropdown-arrow {
    transition: transform 0.2s ease;
    color: var(--color-text-secondary);
  }
  
  .dropdown-arrow.rotated {
    transform: rotate(180deg);
  }
  
  .dropdown-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.5rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    min-width: 200px;
    z-index: 1000;
    overflow: hidden;
  }
  
  .dropdown-header {
    padding: 1rem;
    background: var(--color-surface-hover);
  }
  
  .user-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .user-name-large {
    font-weight: 600;
    color: var(--color-text);
    font-size: 0.875rem;
  }
  
  .user-email {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .dropdown-divider {
    height: 1px;
    background: var(--color-border);
  }
  
  .dropdown-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s ease;
    color: var(--color-text);
    font-size: 0.875rem;
  }
  
  .dropdown-item:hover {
    background: var(--color-surface-hover);
  }
  
  .dropdown-item.danger {
    color: var(--color-error);
  }
  
  .dropdown-item.danger:hover {
    background: var(--color-error-light);
  }
  
  /* Mobile responsive */
  @media (max-width: 768px) {
    .user-name {
      display: none;
    }
    
    .user-button {
      padding: 0.375rem;
    }
    
    .dropdown-menu {
      right: -1rem;
      min-width: 180px;
    }
  }
</style>