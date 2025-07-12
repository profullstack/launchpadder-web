<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  
  // State
  let email = '';
  let password = '';
  let loading = false;
  let error = null;
  let showPassword = false;
  
  // Get redirect URL from query params
  let redirectTo = '/';
  
  onMount(() => {
    redirectTo = $page.url.searchParams.get('redirect') || '/';
  });
  
  async function handleSubmit() {
    if (loading) return;
    
    error = null;
    loading = true;
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email.trim(),
          password
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        // Successful login - redirect to intended page
        goto(redirectTo);
      } else {
        error = result.error || 'Login failed';
      }
    } catch (err) {
      error = 'Network error. Please try again.';
      console.error('Login error:', err);
    } finally {
      loading = false;
    }
  }
  
  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }
  
  // Form validation
  $: isValidEmail = email.includes('@') && email.includes('.');
  $: isValidPassword = password.length >= 8;
  $: canSubmit = isValidEmail && isValidPassword && !loading;
</script>

<svelte:head>
  <title>Sign In | ADLP</title>
  <meta name="description" content="Sign in to your ADLP account to submit and manage your product launches." />
</svelte:head>

<div class="auth-page">
  <div class="auth-container">
    <!-- Header -->
    <div class="auth-header">
      <a href="/" class="logo-link">
        <h1 class="logo">ADLP</h1>
      </a>
      <h2>Welcome back</h2>
      <p>Sign in to your account to continue</p>
    </div>

    <!-- Login Form -->
    <form on:submit|preventDefault={handleSubmit} class="auth-form">
      {#if error}
        <div class="error-message">
          <span class="error-icon">⚠️</span>
          {error}
        </div>
      {/if}

      <!-- Email Field -->
      <div class="form-group">
        <label for="email" class="form-label">Email address</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="Enter your email"
          class="form-input"
          class:error={email && !isValidEmail}
          required
          autocomplete="email"
        />
        {#if email && !isValidEmail}
          <span class="field-error">Please enter a valid email address</span>
        {/if}
      </div>

      <!-- Password Field -->
      <div class="form-group">
        <label for="password" class="form-label">Password</label>
        <div class="password-input-wrapper">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            bind:value={password}
            placeholder="Enter your password"
            class="form-input"
            class:error={password && !isValidPassword}
            required
            autocomplete="current-password"
          />
          <button
            type="button"
            on:click={togglePasswordVisibility}
            class="password-toggle"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? '👁️' : '👁️‍🗨️'}
          </button>
        </div>
        {#if password && !isValidPassword}
          <span class="field-error">Password must be at least 8 characters</span>
        {/if}
      </div>

      <!-- Forgot Password Link -->
      <div class="form-actions">
        <a href="/auth/forgot-password" class="forgot-password-link">
          Forgot your password?
        </a>
      </div>

      <!-- Submit Button -->
      <button
        type="submit"
        class="submit-btn"
        class:loading
        disabled={!canSubmit}
      >
        {#if loading}
          <span class="loading-spinner"></span>
          Signing in...
        {:else}
          Sign In
        {/if}
      </button>
    </form>

    <!-- Sign Up Link -->
    <div class="auth-footer">
      <p>
        Don't have an account?
        <a href="/auth/signup{redirectTo !== '/' ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}" class="auth-link">
          Sign up
        </a>
      </p>
    </div>

    <!-- Social Login (Future Enhancement) -->
    <div class="social-login">
      <div class="divider">
        <span>or</span>
      </div>
      
      <div class="social-buttons">
        <button class="social-btn github" disabled>
          <span class="social-icon">🐙</span>
          Continue with GitHub
        </button>
        <button class="social-btn google" disabled>
          <span class="social-icon">🔍</span>
          Continue with Google
        </button>
      </div>
      
      <p class="social-note">Social login coming soon</p>
    </div>
  </div>
</div>

<style>
  .auth-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 2rem;
  }

  .auth-container {
    background: white;
    border-radius: 1rem;
    padding: 3rem;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }

  /* Header */
  .auth-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .logo-link {
    text-decoration: none;
    color: inherit;
  }

  .logo {
    font-size: 2rem;
    font-weight: 800;
    color: #2563eb;
    margin: 0 0 1rem 0;
  }

  .auth-header h2 {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 0.5rem 0;
  }

  .auth-header p {
    color: #6b7280;
    margin: 0;
  }

  /* Form */
  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .error-message {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 0.75rem;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-label {
    font-weight: 500;
    color: #374151;
    font-size: 0.875rem;
  }

  .form-input {
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    font-size: 1rem;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .form-input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .form-input.error {
    border-color: #dc2626;
  }

  .password-input-wrapper {
    position: relative;
  }

  .password-toggle {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    transition: background-color 0.2s;
  }

  .password-toggle:hover {
    background: #f3f4f6;
  }

  .field-error {
    color: #dc2626;
    font-size: 0.75rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
  }

  .forgot-password-link {
    color: #2563eb;
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .forgot-password-link:hover {
    text-decoration: underline;
  }

  .submit-btn {
    background: #2563eb;
    color: white;
    border: none;
    padding: 0.75rem;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .submit-btn:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .submit-btn:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  /* Footer */
  .auth-footer {
    text-align: center;
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 1px solid #e5e7eb;
  }

  .auth-footer p {
    color: #6b7280;
    margin: 0;
  }

  .auth-link {
    color: #2563eb;
    text-decoration: none;
    font-weight: 500;
  }

  .auth-link:hover {
    text-decoration: underline;
  }

  /* Social Login */
  .social-login {
    margin-top: 2rem;
  }

  .divider {
    position: relative;
    text-align: center;
    margin: 1.5rem 0;
  }

  .divider::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1px;
    background: #e5e7eb;
  }

  .divider span {
    background: white;
    color: #6b7280;
    padding: 0 1rem;
    font-size: 0.875rem;
  }

  .social-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .social-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    background: white;
    color: #374151;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .social-btn:hover:not(:disabled) {
    background: #f9fafb;
    border-color: #9ca3af;
  }

  .social-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .social-note {
    text-align: center;
    color: #9ca3af;
    font-size: 0.75rem;
    margin-top: 1rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Responsive Design */
  @media (max-width: 480px) {
    .auth-page {
      padding: 1rem;
    }

    .auth-container {
      padding: 2rem;
    }

    .logo {
      font-size: 1.75rem;
    }

    .auth-header h2 {
      font-size: 1.25rem;
    }
  }
</style>