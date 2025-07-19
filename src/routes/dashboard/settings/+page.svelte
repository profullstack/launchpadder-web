<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';
  import { isAuthenticated, userDisplayInfo, updateUserProfile } from '$lib/stores/auth.js';
  import { authApi, userApi } from '$lib/services/api-client.js';
  
  let loading = true;
  let saving = false;
  let error = null;
  let successMessage = null;
  
  // Use reactive authentication state
  $: authenticated = $isAuthenticated;
  $: displayInfo = $userDisplayInfo;
  
  // Form data
  let formData = {
    full_name: '',
    username: '',
    email: '',
    bio: '',
    website: '',
    location: '',
    avatar_url: ''
  };
  
  // Settings data
  let settings = {
    email_notifications: true,
    marketing_emails: false,
    security_alerts: true,
    theme: 'system'
  };

  onMount(async () => {
    try {
      // Check authentication using our auth store
      if (!$isAuthenticated) {
        goto('/auth/login?redirect=' + encodeURIComponent('/dashboard/settings'));
        return;
      }

      // Load user profile from the store
      if ($userDisplayInfo) {
        const profile = $userDisplayInfo.profile;
        formData = {
          full_name: profile?.full_name || '',
          username: profile?.username || '',
          email: $userDisplayInfo.email || '',
          bio: profile?.bio || '',
          website: profile?.website || '',
          location: profile?.location || '',
          avatar_url: profile?.avatar_url || ''
        };
        
        // Load user settings (if they exist)
        settings = {
          email_notifications: profile?.email_notifications ?? true,
          marketing_emails: profile?.marketing_emails ?? false,
          security_alerts: profile?.security_alerts ?? true,
          theme: profile?.theme || 'system'
        };
      }
      
    } catch (err) {
      console.error('Settings error:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  });

  async function handleSaveProfile() {
    if (saving) return;
    
    saving = true;
    error = null;
    successMessage = null;
    
    try {
      // Update user profile using our API client
      const updatedProfile = await userApi.updateUser($userDisplayInfo.id, {
        full_name: formData.full_name,
        username: formData.username,
        bio: formData.bio,
        website: formData.website,
        location: formData.location,
        avatar_url: formData.avatar_url,
        email_notifications: settings.email_notifications,
        marketing_emails: settings.marketing_emails,
        security_alerts: settings.security_alerts,
        theme: settings.theme
      });
      
      // Update the auth store with new profile data
      updateUserProfile(updatedProfile);
      
      // Update email if changed
      if (formData.email !== $userDisplayInfo.email) {
        await authApi.updateEmail(formData.email);
      }
      
      successMessage = 'Settings saved successfully!';
      
    } catch (err) {
      console.error('Error saving settings:', err);
      error = err.message || 'Failed to save settings';
    } finally {
      saving = false;
    }
  }

  async function handleChangePassword() {
    try {
      await authApi.requestPasswordReset($userDisplayInfo.email);
      successMessage = 'Password reset email sent! Check your inbox.';
    } catch (err) {
      error = err.message || 'Failed to send password reset email';
    }
  }
</script>

<svelte:head>
  <title>Settings - LaunchPadder</title>
</svelte:head>

<div class="settings-container">
  <header class="settings-header">
    <h1>Account Settings</h1>
    <p>Manage your account information and preferences</p>
  </header>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading settings...</p>
    </div>
  {:else if error}
    <div class="error">
      <h2>Error Loading Settings</h2>
      <p>{error}</p>
      <button on:click={() => window.location.reload()}>Retry</button>
    </div>
  {:else}
    {#if successMessage}
      <div class="success">
        <p>{successMessage}</p>
        <button on:click={() => successMessage = null}>×</button>
      </div>
    {/if}

    <div class="settings-content">
      <!-- Profile Information -->
      <section class="settings-section">
        <h2>Profile Information</h2>
        <div class="form-grid">
          <div class="form-group">
            <label for="full_name">Full Name</label>
            <input
              id="full_name"
              type="text"
              bind:value={formData.full_name}
              placeholder="Enter your full name"
            />
          </div>
          
          <div class="form-group">
            <label for="username">Username</label>
            <input
              id="username"
              type="text"
              bind:value={formData.username}
              placeholder="Enter your username"
            />
          </div>
          
          <div class="form-group">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              bind:value={formData.email}
              placeholder="Enter your email"
            />
          </div>
          
          <div class="form-group">
            <label for="location">Location</label>
            <input
              id="location"
              type="text"
              bind:value={formData.location}
              placeholder="Enter your location"
            />
          </div>
          
          <div class="form-group full-width">
            <label for="website">Website</label>
            <input
              id="website"
              type="url"
              bind:value={formData.website}
              placeholder="https://your-website.com"
            />
          </div>
          
          <div class="form-group full-width">
            <label for="bio">Bio</label>
            <textarea
              id="bio"
              bind:value={formData.bio}
              placeholder="Tell us about yourself..."
              rows="3"
            ></textarea>
          </div>
          
          <div class="form-group full-width">
            <label for="avatar_url">Avatar URL</label>
            <input
              id="avatar_url"
              type="url"
              bind:value={formData.avatar_url}
              placeholder="https://example.com/avatar.jpg"
            />
          </div>
        </div>
      </section>

      <!-- Notification Preferences -->
      <section class="settings-section">
        <h2>Notification Preferences</h2>
        <div class="checkbox-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={settings.email_notifications}
            />
            <span>Email notifications for important updates</span>
          </label>
          
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={settings.marketing_emails}
            />
            <span>Marketing emails and newsletters</span>
          </label>
          
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={settings.security_alerts}
            />
            <span>Security alerts and login notifications</span>
          </label>
        </div>
      </section>

      <!-- Appearance -->
      <section class="settings-section">
        <h2>Appearance</h2>
        <div class="form-group">
          <label for="theme">Theme</label>
          <select id="theme" bind:value={settings.theme}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </section>

      <!-- Security -->
      <section class="settings-section">
        <h2>Security</h2>
        <div class="security-actions">
          <button class="btn btn-outline" on:click={handleChangePassword}>
            Change Password
          </button>
          <p class="security-note">
            We'll send you an email with instructions to reset your password.
          </p>
        </div>
      </section>

      <!-- Save Actions -->
      <div class="save-actions">
        <button 
          class="btn btn-primary" 
          on:click={handleSaveProfile}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <a href="/dashboard" class="btn btn-outline">Back to Dashboard</a>
      </div>
    </div>
  {/if}
</div>

<style>
  .settings-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .settings-header {
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .settings-header h1 {
    margin: 0 0 0.5rem 0;
    color: #1f2937;
    font-size: 2rem;
    font-weight: 700;
  }

  .settings-header p {
    margin: 0;
    color: #6b7280;
    font-size: 1rem;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem;
    color: #6b7280;
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid #e5e7eb;
    border-top: 3px solid #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .error {
    text-align: center;
    padding: 2rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.5rem;
    color: #dc2626;
  }

  .error button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
  }

  .success {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 0.5rem;
    color: #166534;
    margin-bottom: 2rem;
  }

  .success button {
    background: none;
    border: none;
    color: #166534;
    cursor: pointer;
    font-size: 1.25rem;
    padding: 0;
    width: 1.5rem;
    height: 1.5rem;
  }

  .settings-content {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .settings-section {
    background: white;
    padding: 1.5rem;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
  }

  .settings-section h2 {
    margin: 0 0 1rem 0;
    color: #1f2937;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group.full-width {
    grid-column: 1 / -1;
  }

  .form-group label {
    font-weight: 500;
    color: #374151;
    font-size: 0.875rem;
  }

  .form-group input,
  .form-group textarea,
  .form-group select {
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    transition: border-color 0.2s;
  }

  .form-group input:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    font-size: 0.875rem;
    color: #374151;
  }

  .checkbox-label input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }

  .security-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .security-note {
    margin: 0;
    font-size: 0.875rem;
    color: #6b7280;
  }

  .save-actions {
    display: flex;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #e5e7eb;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 0.375rem;
    font-weight: 500;
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .btn-outline {
    background: transparent;
    color: #374151;
    border: 1px solid #d1d5db;
  }

  .btn-outline:hover {
    background: #f9fafb;
    border-color: #9ca3af;
  }

  @media (max-width: 768px) {
    .settings-container {
      padding: 1rem;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .save-actions {
      flex-direction: column;
    }
  }
</style>