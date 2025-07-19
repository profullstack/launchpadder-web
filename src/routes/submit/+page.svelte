<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, userDisplayInfo } from '$lib/stores/auth.js';
  import { api } from '$lib/services/api-client.js';
  
  // Form state
  let url = '';
  let submissionType = 'free'; // 'free', 'basic' or 'federated'
  let loading = false;
  let error = null;
  let success = false;
  
  // Preview state
  let previewLoading = false;
  let previewData = null;
  let previewError = null;
  
  // Free tier state
  let dailySubmissionsUsed = 0;
  let canUseFree = false;
  let isAdmin = false;
  
  // Reactive authentication state
  $: authenticated = $isAuthenticated;
  $: displayInfo = $userDisplayInfo;
  
  // Pricing
  const pricing = {
    free: { price: 0, description: 'One free submission per day' },
    basic: { price: 29, description: 'Submit to this directory only' },
    federated: { price: 99, description: 'Submit to multiple federated directories' }
  };
  
  onMount(async () => {
    // Check if user is authenticated and load their daily submission count
    if ($isAuthenticated) {
      await checkDailySubmissions();
    }
  });

  async function checkDailySubmissions() {
    try {
      // Check user's daily submission count and admin status
      const response = await api.get('/api/submissions/daily-status');
      if (response.success) {
        dailySubmissionsUsed = response.daily_count || 0;
        isAdmin = response.is_admin || false;
        canUseFree = isAdmin || dailySubmissionsUsed < 1; // Admins can always use free, others get 1 per day
      }
    } catch (err) {
      console.error('Error checking daily submissions:', err);
      // Default to allowing free tier if we can't check
      canUseFree = true;
    }
  }
  
  // Debounced URL preview
  let previewTimeout;
  $: if (url && isValidUrl(url)) {
    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(() => {
      fetchPreview(url);
    }, 1000);
  } else {
    previewData = null;
    previewError = null;
  }
  
  function isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }
  
  async function fetchPreview(urlToPreview) {
    if (!urlToPreview || !isValidUrl(urlToPreview)) return;
    
    previewLoading = true;
    previewError = null;
    
    try {
      const response = await fetch('/api/submissions/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: urlToPreview })
      });
      
      if (response.ok) {
        previewData = await response.json();
      } else {
        const errorData = await response.json();
        previewError = errorData.error || 'Failed to fetch preview';
      }
    } catch (err) {
      previewError = 'Network error while fetching preview';
      console.error('Preview error:', err);
    } finally {
      previewLoading = false;
    }
  }
  
  async function handleSubmit() {
    if (!$isAuthenticated) {
      goto('/auth/login?redirect=/submit');
      return;
    }
    
    if (!url || !isValidUrl(url)) {
      error = 'Please enter a valid URL';
      return;
    }

    // Check free tier limits
    if (submissionType === 'free' && !canUseFree) {
      error = 'You have reached your daily free submission limit. Please choose a paid option or try again tomorrow.';
      return;
    }
    
    loading = true;
    error = null;
    
    try {
      const response = await api.post('/api/submissions', {
        url,
        submission_type: submissionType,
        payment_intent: pricing[submissionType].price
      });
      
      if (response.success) {
        success = true;
        
        // Redirect based on submission type
        if (submissionType === 'free') {
          goto(`/submit/success?id=${response.data.id}&type=free`);
        } else if (submissionType === 'basic') {
          goto(`/submit/success?id=${response.data.id}&type=basic`);
        } else {
          goto(`/payment?submission=${response.data.id}&type=federated`);
        }
      } else {
        error = response.error || 'Failed to submit URL';
      }
    } catch (err) {
      error = 'Network error. Please try again.';
      console.error('Submission error:', err);
    } finally {
      loading = false;
    }
  }
  
  function handleUrlInput(event) {
    url = event.target.value.trim();
  }
</script>

<svelte:head>
  <title>Submit Your Product | ADLP</title>
  <meta name="description" content="Submit your product to ADLP - the federated launch platform. Simple URL submission with AI-powered content generation." />
</svelte:head>

<div class="submit-page">
  <!-- Header Section -->
  <section class="submit-header">
    <div class="header-content">
      <h1>Submit Your Product</h1>
      <p>Launch your product on the federated web with just a URL. Our AI will handle the rest.</p>
    </div>
  </section>

  <!-- Main Form -->
  <section class="submit-form-section">
    <div class="form-container">
      <form on:submit|preventDefault={handleSubmit} class="submit-form">
        <!-- URL Input -->
        <div class="form-group">
          <label for="url" class="form-label">
            Product URL
            <span class="required">*</span>
          </label>
          <input
            id="url"
            type="url"
            bind:value={url}
            on:input={handleUrlInput}
            placeholder="https://your-product.com"
            class="form-input"
            class:error={error && !isValidUrl(url)}
            required
          />
          <p class="form-help">
            Enter the URL of your product. We'll automatically fetch metadata, images, and generate optimized descriptions.
          </p>
        </div>

        <!-- URL Preview -->
        {#if url && isValidUrl(url)}
          <div class="preview-section">
            <h3>Preview</h3>
            
            {#if previewLoading}
              <div class="preview-loading">
                <div class="loading-spinner"></div>
                <p>Fetching metadata...</p>
              </div>
            {:else if previewError}
              <div class="preview-error">
                <p>⚠️ {previewError}</p>
                <p class="error-help">Don't worry, you can still submit. We'll try again during processing.</p>
              </div>
            {:else if previewData}
              <div class="preview-card">
                <div class="preview-image">
                  {#if previewData.images?.main}
                    <img src={previewData.images.main} alt={previewData.title} />
                  {:else}
                    <div class="placeholder-image">
                      {(previewData.title || 'Product').charAt(0)}
                    </div>
                  {/if}
                </div>
                <div class="preview-content">
                  <h4>{previewData.title || 'Untitled Product'}</h4>
                  <p>{previewData.description || 'No description available'}</p>
                  <div class="preview-meta">
                    <span class="preview-url">{new URL(url).hostname}</span>
                    {#if previewData.aiEnhancements}
                      <span class="ai-badge">✨ AI Enhanced</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Submission Type -->
        <div class="form-group">
          <label class="form-label">Submission Type</label>
          <div class="submission-types">
            <!-- Free Tier -->
            <label class="submission-type" class:selected={submissionType === 'free'} class:disabled={!canUseFree}>
              <input
                type="radio"
                bind:group={submissionType}
                value="free"
                class="radio-input"
                disabled={!canUseFree}
              />
              <div class="type-content">
                <div class="type-header">
                  <h4>Free Submission</h4>
                  <span class="price">FREE</span>
                </div>
                <p>{pricing.free.description}</p>
                <ul class="features">
                  <li>✓ Submit to this directory</li>
                  <li>✓ Basic metadata extraction</li>
                  <li>✓ Standard processing</li>
                  {#if isAdmin}
                    <li>✓ Admin: Unlimited free submissions</li>
                  {:else}
                    <li>✓ 1 submission per day</li>
                  {/if}
                </ul>
                {#if !canUseFree}
                  <div class="limit-badge">Daily limit reached</div>
                {:else if dailySubmissionsUsed === 0}
                  <div class="available-badge">Available today</div>
                {/if}
              </div>
            </label>

            <!-- Basic Submission -->
            <label class="submission-type" class:selected={submissionType === 'basic'}>
              <input
                type="radio"
                bind:group={submissionType}
                value="basic"
                class="radio-input"
              />
              <div class="type-content">
                <div class="type-header">
                  <h4>Basic Submission</h4>
                  <span class="price">${pricing.basic.price}</span>
                </div>
                <p>{pricing.basic.description}</p>
                <ul class="features">
                  <li>✓ Submit to this directory</li>
                  <li>✓ AI-generated descriptions</li>
                  <li>✓ Automatic metadata extraction</li>
                  <li>✓ SEO optimization</li>
                  <li>✓ Priority processing</li>
                </ul>
              </div>
            </label>

            <!-- Federated Submission -->
            <label class="submission-type" class:selected={submissionType === 'federated'}>
              <input
                type="radio"
                bind:group={submissionType}
                value="federated"
                class="radio-input"
              />
              <div class="type-content">
                <div class="type-header">
                  <h4>Federated Submission</h4>
                  <span class="price">${pricing.federated.price}</span>
                </div>
                <p>{pricing.federated.description}</p>
                <ul class="features">
                  <li>✓ Everything in Basic</li>
                  <li>✓ Submit to multiple directories</li>
                  <li>✓ Targeted niche discovery</li>
                  <li>✓ Maximum exposure</li>
                </ul>
                <div class="popular-badge">Most Popular</div>
              </div>
            </label>
          </div>
        </div>

        <!-- Error Display -->
        {#if error}
          <div class="error-message">
            <p>❌ {error}</p>
          </div>
        {/if}

        <!-- Submit Button -->
        <div class="form-actions">
          {#if !$isAuthenticated}
            <p class="auth-notice">
              <a href="/auth/login?redirect=/submit" class="auth-link">Sign in</a> to submit your product
            </p>
          {:else}
            <button
              type="submit"
              class="submit-btn"
              class:loading
              disabled={loading || !url || !isValidUrl(url) || (submissionType === 'free' && !canUseFree)}
            >
              {#if loading}
                <div class="loading-spinner"></div>
                Processing...
              {:else if submissionType === 'free'}
                Submit Product - FREE
              {:else}
                Submit Product - ${pricing[submissionType].price}
              {/if}
            </button>
          {/if}
        </div>
      </form>

      <!-- Info Sidebar -->
      <aside class="info-sidebar">
        <div class="info-card">
          <h3>How it works</h3>
          <ol class="steps">
            <li>
              <strong>Enter your URL</strong>
              <p>Just paste your product's URL - that's all we need!</p>
            </li>
            <li>
              <strong>AI Enhancement</strong>
              <p>Our AI fetches metadata and creates unique, SEO-optimized descriptions.</p>
            </li>
            <li>
              <strong>Review & Launch</strong>
              <p>Review the generated content and launch across the federated network.</p>
            </li>
          </ol>
        </div>

        <div class="info-card">
          <h3>Why choose federated?</h3>
          <ul class="benefits">
            <li>🌐 Reach multiple audiences</li>
            <li>🎯 Targeted niche directories</li>
            <li>📈 Higher discovery potential</li>
            <li>🔄 Automatic syndication</li>
          </ul>
        </div>

        <div class="info-card">
          <h3>Need help?</h3>
          <p>Check our <a href="/docs/submission-guide">submission guide</a> or <a href="/support">contact support</a>.</p>
        </div>
      </aside>
    </div>
  </section>
</div>

<style>
  .submit-page {
    max-width: 1200px;
    margin: 0 auto;
  }

  /* Header */
  .submit-header {
    text-align: center;
    margin-bottom: 3rem;
  }

  .header-content h1 {
    font-size: 2.5rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 1rem;
  }

  .header-content p {
    font-size: 1.25rem;
    color: #6b7280;
    max-width: 600px;
    margin: 0 auto;
  }

  /* Form Layout */
  .form-container {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 3rem;
    align-items: start;
  }

  .submit-form {
    background: white;
    padding: 2rem;
    border-radius: 0.75rem;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  /* Form Elements */
  .form-group {
    margin-bottom: 2rem;
  }

  .form-label {
    display: block;
    font-weight: 600;
    color: #374151;
    margin-bottom: 0.5rem;
  }

  .required {
    color: #ef4444;
  }

  .form-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 1rem;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .form-input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .form-input.error {
    border-color: #ef4444;
  }

  .form-help {
    font-size: 0.875rem;
    color: #6b7280;
    margin-top: 0.5rem;
  }

  /* Preview Section */
  .preview-section {
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: #f9fafb;
    border-radius: 0.5rem;
    border: 1px solid #e5e7eb;
  }

  .preview-section h3 {
    font-size: 1.125rem;
    font-weight: 600;
    color: #374151;
    margin-bottom: 1rem;
  }

  .preview-loading,
  .preview-error {
    text-align: center;
    padding: 2rem;
  }

  .preview-error {
    color: #dc2626;
  }

  .error-help {
    font-size: 0.875rem;
    color: #6b7280;
    margin-top: 0.5rem;
  }

  .preview-card {
    display: flex;
    gap: 1rem;
    background: white;
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid #e5e7eb;
  }

  .preview-image {
    flex-shrink: 0;
    width: 80px;
    height: 80px;
    border-radius: 0.375rem;
    overflow: hidden;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder-image {
    font-size: 1.5rem;
    font-weight: 600;
    color: #9ca3af;
  }

  .preview-content h4 {
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.5rem;
  }

  .preview-content p {
    color: #6b7280;
    font-size: 0.875rem;
    line-height: 1.4;
    margin-bottom: 0.5rem;
  }

  .preview-meta {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .preview-url {
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .ai-badge {
    font-size: 0.75rem;
    background: #dbeafe;
    color: #1d4ed8;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-weight: 500;
  }

  /* Submission Types */
  .submission-types {
    display: grid;
    gap: 1rem;
  }

  .submission-type {
    position: relative;
    display: block;
    cursor: pointer;
    border: 2px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1.5rem;
    transition: all 0.2s;
  }

  .submission-type:hover {
    border-color: #d1d5db;
  }

  .submission-type.selected {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .radio-input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .type-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .type-header h4 {
    font-weight: 600;
    color: #1f2937;
  }

  .price {
    font-size: 1.25rem;
    font-weight: 700;
    color: #2563eb;
  }

  .type-content p {
    color: #6b7280;
    margin-bottom: 1rem;
  }

  .features {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .features li {
    color: #374151;
    font-size: 0.875rem;
    margin-bottom: 0.25rem;
  }

  .popular-badge {
    position: absolute;
    top: -0.5rem;
    right: 1rem;
    background: #f59e0b;
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
  }

  .limit-badge {
    position: absolute;
    top: -0.5rem;
    right: 1rem;
    background: #dc2626;
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
  }

  .available-badge {
    position: absolute;
    top: -0.5rem;
    right: 1rem;
    background: #059669;
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
  }

  .submission-type.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .submission-type.disabled:hover {
    border-color: #e5e7eb;
  }

  /* Actions */
  .form-actions {
    text-align: center;
  }

  .auth-notice {
    color: #6b7280;
  }

  .auth-link {
    color: #2563eb;
    text-decoration: none;
    font-weight: 500;
  }

  .submit-btn {
    background: #2563eb;
    color: white;
    border: none;
    padding: 0.875rem 2rem;
    border-radius: 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 auto;
  }

  .submit-btn:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .submit-btn:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .submit-btn.loading {
    background: #6b7280;
  }

  .error-message {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 1rem;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }

  /* Sidebar */
  .info-sidebar {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .info-card {
    background: white;
    padding: 1.5rem;
    border-radius: 0.5rem;
    border: 1px solid #e5e7eb;
  }

  .info-card h3 {
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 1rem;
  }

  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .steps li {
    margin-bottom: 1rem;
    padding-left: 1.5rem;
    position: relative;
    counter-increment: step;
  }

  .steps li::before {
    content: counter(step);
    position: absolute;
    left: 0;
    top: 0;
    background: #2563eb;
    color: white;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .steps {
    counter-reset: step;
  }

  .steps strong {
    color: #1f2937;
    display: block;
    margin-bottom: 0.25rem;
  }

  .steps p {
    color: #6b7280;
    font-size: 0.875rem;
  }

  .benefits {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .benefits li {
    color: #374151;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
  }

  .info-card a {
    color: #2563eb;
    text-decoration: none;
  }

  .info-card a:hover {
    text-decoration: underline;
  }

  /* Loading Spinner */
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

  /* Responsive Design */
  @media (max-width: 768px) {
    .header-content h1 {
      font-size: 2rem;
    }

    .header-content p {
      font-size: 1.125rem;
    }

    .form-container {
      grid-template-columns: 1fr;
      gap: 2rem;
    }

    .submit-form {
      padding: 1.5rem;
    }

    .preview-card {
      flex-direction: column;
      text-align: center;
    }

    .preview-image {
      align-self: center;
    }

    .submission-type {
      padding: 1rem;
    }

    .type-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .submit-btn {
      width: 100%;
      justify-content: center;
    }
  }
</style>