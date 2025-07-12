<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  
  // State
  let email = '';
  let password = '';
  let confirmPassword = '';
  let username = '';
  let fullName = '';
  let loading = false;
  let error = null;
  let success = false;
  let showPassword = false;
  let showConfirmPassword = false;
  
  // Get redirect URL from query params
  let redirectTo = '/';
  
  onMount(() => {
    redirectTo = $page.url.searchParams.get('redirect') || '/';
  });
  
  async function handleSubmit() {
    if (loading) return;
    
    error = null;
    loading = true;
    
    // Client-side validation
    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      loading = false;
      return;
    }
    
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          username: username.trim(),
          full_name: fullName.trim() || null
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        success = true;
        // Don't redirect immediately - show success message first
      } else {
        error = result.error || 'Registration failed';
      }
    } catch (err) {
      error = 'Network error. Please try again.';
      console.error('Signup error:', err);
    } finally {
      loading = false;
    }
  }
  
  function togglePasswordVisibility(field) {
    if (field === 'password') {
      showPassword = !showPassword;
    } else {
      showConfirmPassword = !showConfirmPassword;
    }
  }
  
  // Form validation
  $: isValidEmail = email.includes('@') && email.includes('.');
  $: isValidPassword = password.length >= 8 && /\d/.test(password) && /[a-zA-Z]/.test(password) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  $: isValidUsername = username.length >= 3 && username.length <= 30 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(username);
  $: passwordsMatch = password === confirmPassword;
  $: canSubmit = isValidEmail && isValidPassword && isValidUsername && passwordsMatch && !loading;
</script>

<svelte:head>
  <title>Sign Up | ADLP</title>
  <meta name="description" content="Create your ADLP account to submit and manage your product launches." />
</svelte:head>

<div class="auth-page">
  <div class="auth-container">
    {#if success}
      <!-- Success State -->
      <div class="success-state">
        <div class="success-icon">✅</div>
        <h2>Account Created!</h2>
        <p>We've sent a confirmation email to <strong>{email}</strong></p>
        <p>Please check your email and click the confirmation link to activate your account.</p>
        
        <div class="success-actions">
          <a href="/auth/login{redirectTo !== '/' ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}" class="btn btn-primary">
            Continue to Sign In
          </a>
          <button on:click={() => success = false} class="btn btn-outline">
            Back to Form
          </button>
        </div>
      </div>
    {:else}
      <!-- Registration Form -->
      <div class="auth-header">
        <a href="/" class="logo-link">
          <h1 class="logo">ADLP</h1>
        </a>
        <h2>Create your account</h2>
        <p>Join the federated launch platform</p>
      </div>

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

        <!-- Username Field -->
        <div class="form-group">
          <label for="username" class="form-label">Username</label>
          <input
            id="username"
            type="text"
            bind:value={username}
            placeholder="Choose a username"
            class="form-input"
            class:error={username && !isValidUsername}
            required
            autocomplete="username"
          />
          {#if username && !isValidUsername}
            <span class="field-error">Username must be 3-30 characters, start with a letter, and contain only letters, numbers, underscores, and hyphens</span>
          {/if}
        </div>

        <!-- Full Name Field -->
        <div class="form-group">
          <label for="fullName" class="form-label">Full name (optional)</label>
          <input
            id="fullName"
            type="text"
            bind:value={fullName}
            placeholder="Enter your full name"
            class="form-input"
            autocomplete="name"
          />
        </div>

        <!-- Password Field -->
        <div class="form-group">
          <label for="password" class="form-label">Password</label>
          <div class="password-input-wrapper">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              bind:value={password}
              placeholder="Create a password"
              class="form-input"
              class:error={password && !isValidPassword}
              required
              autocomplete="new-password"
            />
            <button
              type="button"
              on:click={() => togglePasswordVisibility('password')}
              class="password-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          {#if password && !isValidPassword}
            <span class="field-error">Password must be at least 8 characters with letters, numbers, and special characters</span>
          {/if}
        </div>

        <!-- Confirm Password Field -->
        <div class="form-group">
          <label for="confirmPassword" class="form-label">Confirm password</label>
          <div class="password-input-wrapper">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              bind:value={confirmPassword}
              placeholder="Confirm your password"
              class="form-input"
              class:error={confirmPassword && !passwordsMatch}
              required
              autocomplete="new-password"
            />
            <button
              type="button"
              on:click={() => togglePasswordVisibility('confirm')}
              class="password-toggle"
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          {#if confirmPassword && !passwordsMatch}
            <span class="field-error">Passwords do not match</span>
          {/if}
        </div>

        <!-- Terms and Privacy -->
        <div class="terms-notice">
          <p>
            By creating an account, you agree to our 
            <a href="/terms" target="_blank">Terms of Service</a> and 
            <a href="/privacy" target="_blank">Privacy Policy</a>.
          </p>
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
            Creating account...
          {:else}
            Create Account
          {/if}
        </button>
      </form>

      <!-- Sign In Link -->
      <div class="auth-footer">
        <p>
          Already have an account?
          <a href="/auth/login{redirectTo !== '/' ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}" class="auth-link">
            Sign in
          </a>
        </p>
      </div>
    {/if}
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
    max-width: 450px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }

  /* Success State */
  .success-state {
    text-align: center;
  }

  .success-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .success-state h2 {
    font-size: 1.75rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 1rem 0;
  }

  .success-state p {
    color: #6b7280;
    margin-bottom: 1rem;
    line-height: 1.5;
  }

  .success-actions {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 2rem;
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
    line-height: 1.4;
  }

  .terms-notice {
    background: #f9fafb;
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid #e5e7eb;
  }

  .terms-notice p {
    margin: 0;
    font-size: 0.875rem;
    color: #6b7280;
    line-height: 1.5;
  }

  .terms-notice a {
    color: #2563eb;
    text-decoration: none;
  }

  .terms-notice a:hover {
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

  /* Buttons */
  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-weight: 500;
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
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

    .success-actions {
      flex-direction: column;
    }
  }
</style>