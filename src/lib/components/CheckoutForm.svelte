<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  
  export let submissionType = 'basic';
  export let directories = [];
  export let submissionId = null;
  export let onSuccess = null;
  export let onError = null;
  
  let stripe = null;
  let elements = null;
  let cardElement = null;
  let paymentIntent = null;
  let loading = false;
  let error = null;
  let processing = false;
  let feeCalculation = null;
  
  // Form state
  let email = '';
  let name = '';
  let saveCard = false;
  
  onMount(async () => {
    // Load Stripe.js
    if (typeof window !== 'undefined') {
      const stripeModule = await import('@stripe/stripe-js');
      stripe = await stripeModule.loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
      
      if (stripe) {
        elements = stripe.elements();
        setupCardElement();
      }
    }
    
    // Create payment intent
    await createPaymentIntent();
  });
  
  function setupCardElement() {
    const style = {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
        fontFamily: 'system-ui, -apple-system, sans-serif',
      },
      invalid: {
        color: '#9e2146',
      },
    };
    
    cardElement = elements.create('card', { style });
    cardElement.mount('#card-element');
    
    cardElement.on('change', ({ error }) => {
      const displayError = document.getElementById('card-errors');
      if (error) {
        displayError.textContent = error.message;
      } else {
        displayError.textContent = '';
      }
    });
  }
  
  async function createPaymentIntent() {
    loading = true;
    error = null;
    
    try {
      const response = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          submissionType,
          directories,
          metadata: {
            submissionId
          }
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create payment intent');
      }
      
      paymentIntent = data.paymentIntent;
      feeCalculation = data.feeCalculation;
      
    } catch (err) {
      error = err.message;
      if (onError) onError(err);
    } finally {
      loading = false;
    }
  }
  
  async function handleSubmit(event) {
    event.preventDefault();
    
    if (!stripe || !cardElement || !paymentIntent) {
      return;
    }
    
    processing = true;
    error = null;
    
    try {
      // Confirm payment with Stripe
      const { error: stripeError, paymentIntent: confirmedPayment } = await stripe.confirmCardPayment(
        paymentIntent.clientSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: {
              name,
              email,
            },
          },
        }
      );
      
      if (stripeError) {
        throw new Error(stripeError.message);
      }
      
      if (confirmedPayment.status === 'succeeded') {
        // Confirm payment on our backend
        const confirmResponse = await fetch('/api/payments/confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentIntentId: confirmedPayment.id,
            submissionId
          }),
        });
        
        const confirmData = await confirmResponse.json();
        
        if (!confirmResponse.ok) {
          throw new Error(confirmData.error || 'Payment confirmation failed');
        }
        
        // Success!
        if (onSuccess) {
          onSuccess(confirmData);
        } else {
          goto('/submit/success?payment=success');
        }
      }
      
    } catch (err) {
      error = err.message;
      if (onError) onError(err);
    } finally {
      processing = false;
    }
  }
  
  function formatAmount(amount, currency = 'usd') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount / 100);
  }
</script>

<div class="checkout-form">
  <div class="checkout-header">
    <h2>Complete Your Submission</h2>
    {#if feeCalculation}
      <div class="pricing-summary">
        <div class="submission-type">
          <span class="type-badge type-{submissionType}">{submissionType}</span>
          {#if submissionType === 'federated' && directories.length > 0}
            <span class="directory-count">{directories.length} directories</span>
          {/if}
        </div>
        
        {#if feeCalculation.breakdown}
          <div class="fee-breakdown">
            <div class="fee-item">
              <span>Base fee</span>
              <span>{formatAmount(feeCalculation.breakdown.baseAmount)}</span>
            </div>
            {#if feeCalculation.breakdown.directoryAmount > 0}
              <div class="fee-item">
                <span>Directory fees ({feeCalculation.breakdown.directoryCount}×)</span>
                <span>{formatAmount(feeCalculation.breakdown.directoryAmount)}</span>
              </div>
            {/if}
          </div>
        {/if}
        
        <div class="total-amount">
          <span>Total</span>
          <span class="amount">{formatAmount(feeCalculation.amount, feeCalculation.currency)}</span>
        </div>
      </div>
    {/if}
  </div>
  
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Setting up payment...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <h3>Payment Setup Failed</h3>
      <p>{error}</p>
      <button type="button" on:click={createPaymentIntent} class="retry-button">
        Try Again
      </button>
    </div>
  {:else if paymentIntent}
    <form on:submit={handleSubmit} class="payment-form">
      <div class="form-section">
        <h3>Billing Information</h3>
        
        <div class="form-group">
          <label for="email">Email Address</label>
          <input
            type="email"
            id="email"
            bind:value={email}
            required
            placeholder="your@email.com"
            disabled={processing}
          />
        </div>
        
        <div class="form-group">
          <label for="name">Full Name</label>
          <input
            type="text"
            id="name"
            bind:value={name}
            required
            placeholder="John Doe"
            disabled={processing}
          />
        </div>
      </div>
      
      <div class="form-section">
        <h3>Payment Method</h3>
        
        <div class="form-group">
          <label for="card-element">Card Information</label>
          <div id="card-element" class="card-element"></div>
          <div id="card-errors" class="card-errors" role="alert"></div>
        </div>
        
        <div class="form-group checkbox-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={saveCard}
              disabled={processing}
            />
            <span class="checkmark"></span>
            Save card for future submissions
          </label>
        </div>
      </div>
      
      {#if error}
        <div class="form-error">
          <span class="error-icon">⚠️</span>
          {error}
        </div>
      {/if}
      
      <div class="form-actions">
        <button
          type="submit"
          class="submit-button"
          disabled={processing || !stripe}
        >
          {#if processing}
            <div class="button-spinner"></div>
            Processing...
          {:else}
            Pay {feeCalculation ? formatAmount(feeCalculation.amount, feeCalculation.currency) : ''}
          {/if}
        </button>
        
        <div class="security-notice">
          <span class="lock-icon">🔒</span>
          Your payment information is secure and encrypted
        </div>
      </div>
    </form>
  {/if}
</div>

<style>
  .checkout-form {
    max-width: 500px;
    margin: 0 auto;
    padding: 2rem;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
  
  .checkout-header {
    margin-bottom: 2rem;
    text-align: center;
  }
  
  .checkout-header h2 {
    margin: 0 0 1rem 0;
    color: #1f2937;
    font-size: 1.5rem;
    font-weight: 600;
  }
  
  .pricing-summary {
    background: #f9fafb;
    border-radius: 8px;
    padding: 1rem;
    border: 1px solid #e5e7eb;
  }
  
  .submission-type {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    justify-content: center;
  }
  
  .type-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.875rem;
    font-weight: 500;
    text-transform: capitalize;
  }
  
  .type-basic {
    background: #dbeafe;
    color: #1e40af;
  }
  
  .type-federated {
    background: #d1fae5;
    color: #065f46;
  }
  
  .directory-count {
    color: #6b7280;
    font-size: 0.875rem;
  }
  
  .fee-breakdown {
    margin-bottom: 1rem;
  }
  
  .fee-item {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    color: #6b7280;
    font-size: 0.875rem;
  }
  
  .total-amount {
    display: flex;
    justify-content: space-between;
    padding: 0.75rem 0;
    border-top: 1px solid #e5e7eb;
    font-weight: 600;
    color: #1f2937;
  }
  
  .amount {
    font-size: 1.125rem;
    color: #059669;
  }
  
  .loading-state,
  .error-state {
    text-align: center;
    padding: 2rem;
  }
  
  .spinner,
  .button-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #e5e7eb;
    border-top: 2px solid #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem auto;
  }
  
  .button-spinner {
    width: 16px;
    height: 16px;
    margin: 0 0.5rem 0 0;
    display: inline-block;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .error-state {
    color: #dc2626;
  }
  
  .error-icon {
    font-size: 2rem;
    margin-bottom: 1rem;
  }
  
  .retry-button {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    margin-top: 1rem;
  }
  
  .retry-button:hover {
    background: #2563eb;
  }
  
  .payment-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .form-section h3 {
    margin: 0 0 1rem 0;
    color: #1f2937;
    font-size: 1.125rem;
    font-weight: 600;
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .form-group label {
    font-weight: 500;
    color: #374151;
    font-size: 0.875rem;
  }
  
  .form-group input {
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
    transition: border-color 0.2s;
  }
  
  .form-group input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .form-group input:disabled {
    background: #f9fafb;
    color: #6b7280;
  }
  
  .card-element {
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: white;
  }
  
  .card-errors {
    color: #dc2626;
    font-size: 0.875rem;
    margin-top: 0.25rem;
    min-height: 1.25rem;
  }
  
  .checkbox-group {
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;
  }
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-weight: normal;
  }
  
  .checkbox-label input[type="checkbox"] {
    margin: 0;
    width: auto;
  }
  
  .form-error {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #dc2626;
    font-size: 0.875rem;
  }
  
  .form-actions {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1rem;
  }
  
  .submit-button {
    background: #059669;
    color: white;
    border: none;
    padding: 1rem 2rem;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .submit-button:hover:not(:disabled) {
    background: #047857;
  }
  
  .submit-button:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }
  
  .security-notice {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: #6b7280;
    font-size: 0.875rem;
  }
  
  .lock-icon {
    font-size: 1rem;
  }
  
  @media (max-width: 640px) {
    .checkout-form {
      padding: 1rem;
      margin: 1rem;
    }
    
    .checkout-header h2 {
      font-size: 1.25rem;
    }
  }
</style>