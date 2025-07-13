<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import CheckoutForm from '$lib/components/CheckoutForm.svelte';
  import CryptoCheckoutForm from '$lib/components/CryptoCheckoutForm.svelte';
  import { AuthService } from '$lib/services/auth-service.js';
  
  let user = null;
  let loading = true;
  let submissionType = 'basic';
  let directories = [];
  let submissionId = null;
  let paymentMethod = 'stripe'; // 'stripe' or 'crypto'
  
  onMount(async () => {
    // Check authentication
    const authService = new AuthService();
    user = await authService.getCurrentUser();
    if (!user) {
      goto('/auth/login?redirect=/checkout');
      return;
    }
    
    // Get checkout parameters from URL
    const urlParams = $page.url.searchParams;
    submissionType = urlParams.get('type') || 'basic';
    submissionId = urlParams.get('submission');
    
    const directoriesParam = urlParams.get('directories');
    if (directoriesParam) {
      directories = directoriesParam.split(',').filter(Boolean);
    }
    
    loading = false;
  });
  
  // Calculate payment amount based on submission type and directories
  function calculateAmount() {
    const baseAmount = submissionType === 'basic' ? 5 : 10; // $5 for basic, $10 base for federated
    const directoryAmount = submissionType === 'federated' ? directories.length * 5 : 0; // $5 per directory
    return baseAmount + directoryAmount;
  }

  function handlePaymentSuccess(result) {
    console.log('Payment successful:', result);
    goto('/submit/success?payment=success&submission=' + (result.submissionId || ''));
  }
  
  function handlePaymentError(error) {
    console.error('Payment error:', error);
    // Error is handled by the CheckoutForm component
  }

  function handleCryptoPaymentSuccess(result) {
    console.log('Crypto payment successful:', result);
    goto('/submit/success?payment=crypto&session=' + result.sessionId);
  }

  function handleCryptoPaymentError(error) {
    console.error('Crypto payment error:', error);
    // Error is handled by the CryptoCheckoutForm component
  }
</script>

<svelte:head>
  <title>Checkout - LaunchPadder</title>
  <meta name="description" content="Complete your submission payment" />
  <script src="https://js.stripe.com/v3/"></script>
</svelte:head>

<div class="checkout-page">
  <div class="container">
    <div class="checkout-header">
      <h1>Complete Your Submission</h1>
      <p>Choose your preferred payment method</p>
    </div>
    
    {#if loading}
      <div class="loading-container">
        <div class="spinner"></div>
        <p>Loading checkout...</p>
      </div>
    {:else if user}
      <div class="checkout-container">
        <div class="checkout-sidebar">
          <div class="submission-summary">
            <h3>Submission Summary</h3>
            
            <div class="summary-item">
              <span class="label">Type:</span>
              <span class="value type-{submissionType}">{submissionType}</span>
            </div>
            
            {#if submissionType === 'federated' && directories.length > 0}
              <div class="summary-item">
                <span class="label">Directories:</span>
                <span class="value">{directories.length} selected</span>
              </div>
              
              <div class="directory-list">
                {#each directories as directory}
                  <div class="directory-item">
                    <span class="directory-icon">📁</span>
                    {directory}
                  </div>
                {/each}
              </div>
            {/if}
            
            {#if submissionId}
              <div class="summary-item">
                <span class="label">Submission ID:</span>
                <span class="value submission-id">{submissionId.slice(0, 8)}...</span>
              </div>
            {/if}
          </div>
          
          <div class="security-badges">
            <div class="badge">
              <span class="badge-icon">🔒</span>
              <div class="badge-content">
                <strong>Secure Payment</strong>
                <span>256-bit SSL encryption</span>
              </div>
            </div>
            
            <div class="badge">
              <span class="badge-icon">💳</span>
              <div class="badge-content">
                <strong>Stripe Powered</strong>
                <span>Industry-leading security</span>
              </div>
            </div>
            
            <div class="badge">
              <span class="badge-icon">🛡️</span>
              <div class="badge-content">
                <strong>PCI Compliant</strong>
                <span>Your data is protected</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="checkout-main">
          <!-- Payment Method Selection -->
          <div class="payment-method-selection">
            <h3>Choose Payment Method</h3>
            <div class="payment-methods">
              <button
                class="payment-method-btn {paymentMethod === 'stripe' ? 'active' : ''}"
                on:click={() => paymentMethod = 'stripe'}
              >
                <div class="payment-method-icon">💳</div>
                <div class="payment-method-content">
                  <strong>Credit/Debit Card</strong>
                  <span>Powered by Stripe</span>
                </div>
              </button>
              
              <button
                class="payment-method-btn {paymentMethod === 'crypto' ? 'active' : ''}"
                on:click={() => paymentMethod = 'crypto'}
              >
                <div class="payment-method-icon">₿</div>
                <div class="payment-method-content">
                  <strong>Cryptocurrency</strong>
                  <span>Bitcoin, Ethereum, Solana, USDC</span>
                </div>
              </button>
            </div>
          </div>

          <!-- Payment Forms -->
          <div class="payment-form-container">
            {#if paymentMethod === 'stripe'}
              <CheckoutForm
                {submissionType}
                {directories}
                {submissionId}
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
              />
            {:else if paymentMethod === 'crypto'}
              <CryptoCheckoutForm
                amount={calculateAmount()}
                productId={submissionType}
                customerEmail={user?.email || ''}
                metadata={{
                  submissionType,
                  directories: directories.join(','),
                  submissionId
                }}
                onSuccess={handleCryptoPaymentSuccess}
                onError={handleCryptoPaymentError}
              />
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <div class="auth-required">
        <div class="auth-icon">🔐</div>
        <h2>Authentication Required</h2>
        <p>Please log in to complete your submission payment.</p>
        <a href="/auth/login?redirect=/checkout" class="login-button">
          Log In
        </a>
      </div>
    {/if}
  </div>
</div>

<style>
  .checkout-page {
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 2rem 0;
  }
  
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
  }
  
  .checkout-header {
    text-align: center;
    margin-bottom: 3rem;
    color: white;
  }
  
  .checkout-header h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
  }
  
  .checkout-header p {
    font-size: 1.125rem;
    opacity: 0.9;
    margin: 0;
  }
  
  .loading-container {
    text-align: center;
    padding: 4rem 2rem;
    color: white;
  }
  
  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top: 3px solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem auto;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .checkout-container {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 3rem;
    align-items: start;
  }
  
  .checkout-sidebar {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }
  
  .submission-summary {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
  
  .submission-summary h3 {
    margin: 0 0 1rem 0;
    color: #1f2937;
    font-size: 1.25rem;
    font-weight: 600;
  }
  
  .summary-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid #f3f4f6;
  }
  
  .summary-item:last-child {
    border-bottom: none;
  }
  
  .label {
    color: #6b7280;
    font-weight: 500;
  }
  
  .value {
    font-weight: 600;
    color: #1f2937;
  }
  
  .type-basic {
    color: #1e40af;
  }
  
  .type-federated {
    color: #065f46;
  }
  
  .submission-id {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.875rem;
  }
  
  .directory-list {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #f3f4f6;
  }
  
  .directory-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0;
    color: #4b5563;
    font-size: 0.875rem;
  }
  
  .directory-icon {
    font-size: 1rem;
  }
  
  .security-badges {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .badge {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    padding: 1rem;
    color: white;
  }
  
  .badge-icon {
    font-size: 1.5rem;
  }
  
  .badge-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .badge-content strong {
    font-weight: 600;
    font-size: 0.875rem;
  }
  
  .badge-content span {
    font-size: 0.75rem;
    opacity: 0.8;
  }
  
  .checkout-main {
    background: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
  }
  
  .auth-required {
    text-align: center;
    padding: 4rem 2rem;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    max-width: 500px;
    margin: 0 auto;
  }
  
  .auth-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }
  
  .auth-required h2 {
    margin: 0 0 1rem 0;
    color: #1f2937;
    font-size: 1.5rem;
    font-weight: 600;
  }
  
  .auth-required p {
    color: #6b7280;
    margin: 0 0 2rem 0;
  }
  
  .login-button {
    display: inline-block;
    background: #3b82f6;
    color: white;
    text-decoration: none;
    padding: 0.75rem 2rem;
    border-radius: 8px;
    font-weight: 600;
    transition: background-color 0.2s;
  }
  
  .login-button:hover {
    background: #2563eb;
  }
  
  @media (max-width: 768px) {
    .checkout-page {
      padding: 1rem 0;
    }
    
    .checkout-header h1 {
      font-size: 2rem;
    }
    
    .checkout-container {
      grid-template-columns: 1fr;
      gap: 2rem;
    }
    
    .checkout-sidebar {
      order: 2;
    }
    
    .checkout-main {
      order: 1;
    }
    
    .security-badges {
      flex-direction: row;
      overflow-x: auto;
      gap: 0.75rem;
      padding-bottom: 0.5rem;
    }
    
    .badge {
      flex-shrink: 0;
      min-width: 200px;
    }
  }
  
  @media (max-width: 480px) {
    .container {
      padding: 0 0.5rem;
    }
    
    .checkout-header h1 {
      font-size: 1.75rem;
    }
    
    .submission-summary,
    .auth-required {
      padding: 1rem;
    }
  }

  .payment-method-selection {
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .payment-method-selection h3 {
    margin: 0 0 1rem 0;
    color: #1f2937;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .payment-methods {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .payment-method-btn {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #f9fafb;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .payment-method-btn:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  .payment-method-btn.active {
    background: #eff6ff;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .payment-method-icon {
    font-size: 1.5rem;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .payment-method-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .payment-method-content strong {
    color: #1f2937;
    font-weight: 600;
    font-size: 0.875rem;
  }

  .payment-method-content span {
    color: #6b7280;
    font-size: 0.75rem;
  }

  .payment-form-container {
    padding: 0;
  }

  @media (max-width: 640px) {
    .payment-methods {
      grid-template-columns: 1fr;
    }

    .payment-method-btn {
      padding: 0.75rem;
    }
  }
</style>