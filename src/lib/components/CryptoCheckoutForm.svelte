<script>
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  // Props
  export let amount = 0;
  export let productId = '';
  export let customerEmail = '';
  export let metadata = {};
  export let onSuccess = () => {};
  export let onError = () => {};

  // State
  let selectedCurrency = 'BTC';
  let paymentSession = null;
  let loading = false;
  let error = null;
  let exchangeRates = {};
  let cryptoAmount = 0;
  let walletAddress = '';
  let qrCodeData = '';
  let paymentStatus = 'pending';
  let checkingPayment = false;
  let paymentCheckInterval = null;

  // Supported cryptocurrencies
  const supportedCurrencies = [
    { code: 'BTC', name: 'Bitcoin', icon: '₿' },
    { code: 'ETH', name: 'Ethereum', icon: 'Ξ' },
    { code: 'SOL', name: 'Solana', icon: '◎' },
    { code: 'USDC', name: 'USD Coin', icon: '$' }
  ];

  // Create payment session
  async function createPaymentSession() {
    if (!amount || !productId || !customerEmail) {
      error = 'Missing required payment information';
      return;
    }

    loading = true;
    error = null;

    try {
      const response = await fetch('/api/crypto-payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount,
          currency: selectedCurrency,
          customerEmail,
          productId,
          metadata
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create payment session');
      }

      paymentSession = data.session;
      cryptoAmount = data.session.cryptoAmount;
      walletAddress = data.session.walletAddress;
      qrCodeData = data.payment.qrCode.uri;

      // Start checking for payment
      startPaymentCheck();

    } catch (err) {
      error = err.message;
      onError(err);
    } finally {
      loading = false;
    }
  }

  // Start checking for payment completion
  function startPaymentCheck() {
    if (paymentCheckInterval) {
      clearInterval(paymentCheckInterval);
    }

    paymentCheckInterval = setInterval(async () => {
      await checkPaymentStatus();
    }, 10000); // Check every 10 seconds
  }

  // Check payment status
  async function checkPaymentStatus() {
    if (!paymentSession || checkingPayment) return;

    checkingPayment = true;

    try {
      const response = await fetch(`/api/crypto-payments/verify?sessionId=${paymentSession.id}`);
      const data = await response.json();

      if (response.ok && data.session) {
        const session = data.session;
        paymentStatus = session.status;

        if (session.status === 'completed') {
          clearInterval(paymentCheckInterval);
          onSuccess({
            sessionId: session.id,
            transactionId: session.transactionId,
            amount: session.amount,
            cryptoAmount: session.cryptoAmount,
            currency: session.currency
          });
        } else if (session.isExpired) {
          clearInterval(paymentCheckInterval);
          error = 'Payment session has expired. Please create a new payment.';
        }
      }
    } catch (err) {
      console.error('Error checking payment status:', err);
    } finally {
      checkingPayment = false;
    }
  }

  // Copy wallet address to clipboard
  async function copyToClipboard(text) {
    if (browser && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        // Show success feedback (you could add a toast notification here)
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
      }
    }
  }

  // Format crypto amount for display
  function formatCryptoAmount(amount, currency) {
    if (!amount) return '0';
    
    const decimals = currency === 'BTC' ? 8 : currency === 'ETH' ? 6 : 4;
    return parseFloat(amount).toFixed(decimals);
  }

  // Format time remaining
  function formatTimeRemaining(expiresAt) {
    if (!expiresAt) return '';
    
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires - now;
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m remaining`;
  }

  // Handle currency change
  function handleCurrencyChange() {
    if (paymentSession) {
      // Reset session when currency changes
      paymentSession = null;
      paymentStatus = 'pending';
      if (paymentCheckInterval) {
        clearInterval(paymentCheckInterval);
      }
    }
  }

  // Cleanup on destroy
  onDestroy(() => {
    if (paymentCheckInterval) {
      clearInterval(paymentCheckInterval);
    }
  });
</script>

<div class="crypto-checkout">
  <div class="crypto-checkout__header">
    <h3>Pay with Cryptocurrency</h3>
    <p class="amount">Total: ${amount} USD</p>
  </div>

  {#if error}
    <div class="error-message">
      <span class="error-icon">⚠️</span>
      {error}
    </div>
  {/if}

  {#if !paymentSession}
    <!-- Currency Selection -->
    <div class="currency-selection">
      <label for="currency">Choose Cryptocurrency:</label>
      <select 
        id="currency" 
        bind:value={selectedCurrency} 
        on:change={handleCurrencyChange}
        disabled={loading}
      >
        {#each supportedCurrencies as currency}
          <option value={currency.code}>
            {currency.icon} {currency.name} ({currency.code})
          </option>
        {/each}
      </select>
    </div>

    <!-- Create Payment Button -->
    <button 
      class="create-payment-btn"
      on:click={createPaymentSession}
      disabled={loading || !amount || !customerEmail}
    >
      {#if loading}
        <span class="spinner"></span>
        Creating Payment...
      {:else}
        Create {selectedCurrency} Payment
      {/if}
    </button>
  {:else}
    <!-- Payment Details -->
    <div class="payment-details">
      <div class="payment-info">
        <h4>Payment Details</h4>
        <div class="info-row">
          <span class="label">Currency:</span>
          <span class="value">{paymentSession.currency}</span>
        </div>
        <div class="info-row">
          <span class="label">Amount:</span>
          <span class="value">{formatCryptoAmount(cryptoAmount, selectedCurrency)} {selectedCurrency}</span>
        </div>
        <div class="info-row">
          <span class="label">USD Value:</span>
          <span class="value">${amount}</span>
        </div>
        <div class="info-row">
          <span class="label">Exchange Rate:</span>
          <span class="value">1 {selectedCurrency} = ${paymentSession.exchangeRate?.toLocaleString()}</span>
        </div>
        <div class="info-row">
          <span class="label">Expires:</span>
          <span class="value">{formatTimeRemaining(paymentSession.expiresAt)}</span>
        </div>
      </div>

      <!-- Wallet Address -->
      <div class="wallet-section">
        <h4>Send Payment To:</h4>
        <div class="wallet-address">
          <input 
            type="text" 
            value={walletAddress} 
            readonly 
            class="address-input"
          />
          <button 
            class="copy-btn"
            on:click={() => copyToClipboard(walletAddress)}
            title="Copy address"
          >
            📋
          </button>
        </div>
      </div>

      <!-- QR Code -->
      {#if qrCodeData}
        <div class="qr-section">
          <h4>Or Scan QR Code:</h4>
          <div class="qr-placeholder">
            <p>QR Code: {qrCodeData}</p>
            <small>Use your crypto wallet to scan this payment request</small>
          </div>
        </div>
      {/if}

      <!-- Payment Status -->
      <div class="payment-status">
        <div class="status-indicator status-{paymentStatus}">
          {#if paymentStatus === 'pending'}
            <span class="spinner"></span>
            Waiting for payment...
          {:else if paymentStatus === 'completed'}
            ✅ Payment confirmed!
          {:else if paymentStatus === 'expired'}
            ⏰ Payment expired
          {/if}
        </div>
        
        {#if paymentStatus === 'pending'}
          <p class="status-help">
            Send exactly <strong>{formatCryptoAmount(cryptoAmount, selectedCurrency)} {selectedCurrency}</strong> 
            to the address above. Payment will be confirmed automatically.
          </p>
        {/if}
      </div>

      <!-- Manual Verification (for testing) -->
      {#if paymentStatus === 'pending'}
        <details class="manual-verification">
          <summary>Manual Verification (Testing)</summary>
          <p>For testing purposes, you can manually verify a payment:</p>
          <button 
            class="verify-btn"
            on:click={() => checkPaymentStatus()}
            disabled={checkingPayment}
          >
            {checkingPayment ? 'Checking...' : 'Check Payment Status'}
          </button>
        </details>
      {/if}
    </div>
  {/if}
</div>

<style>
  .crypto-checkout {
    max-width: 500px;
    margin: 0 auto;
    padding: 2rem;
    border: 1px solid #e1e5e9;
    border-radius: 8px;
    background: white;
  }

  .crypto-checkout__header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .crypto-checkout__header h3 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .amount {
    font-size: 1.25rem;
    font-weight: 600;
    color: #2563eb;
    margin: 0;
  }

  .error-message {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 1rem;
    border-radius: 6px;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .currency-selection {
    margin-bottom: 1.5rem;
  }

  .currency-selection label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #374151;
  }

  .currency-selection select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
    background: white;
  }

  .create-payment-btn {
    width: 100%;
    padding: 1rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    transition: background-color 0.2s;
  }

  .create-payment-btn:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .create-payment-btn:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .payment-details {
    space-y: 1.5rem;
  }

  .payment-info {
    background: #f9fafb;
    padding: 1rem;
    border-radius: 6px;
    margin-bottom: 1.5rem;
  }

  .payment-info h4 {
    margin: 0 0 1rem 0;
    color: #1a1a1a;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .info-row:last-child {
    margin-bottom: 0;
  }

  .label {
    color: #6b7280;
  }

  .value {
    font-weight: 500;
    color: #1a1a1a;
  }

  .wallet-section {
    margin-bottom: 1.5rem;
  }

  .wallet-section h4 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .wallet-address {
    display: flex;
    gap: 0.5rem;
  }

  .address-input {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-family: monospace;
    font-size: 0.875rem;
    background: #f9fafb;
  }

  .copy-btn {
    padding: 0.75rem;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .copy-btn:hover {
    background: #e5e7eb;
  }

  .qr-section {
    margin-bottom: 1.5rem;
  }

  .qr-section h4 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .qr-placeholder {
    background: #f9fafb;
    border: 2px dashed #d1d5db;
    padding: 2rem;
    text-align: center;
    border-radius: 6px;
  }

  .qr-placeholder p {
    margin: 0 0 0.5rem 0;
    font-family: monospace;
    font-size: 0.875rem;
    word-break: break-all;
  }

  .qr-placeholder small {
    color: #6b7280;
  }

  .payment-status {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
    border-radius: 6px;
    font-weight: 500;
    margin-bottom: 1rem;
  }

  .status-pending {
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fcd34d;
  }

  .status-completed {
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #6ee7b7;
  }

  .status-expired {
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
  }

  .status-help {
    color: #6b7280;
    font-size: 0.875rem;
    margin: 0;
  }

  .manual-verification {
    margin-top: 1rem;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 6px;
  }

  .manual-verification summary {
    cursor: pointer;
    font-weight: 500;
    color: #374151;
  }

  .verify-btn {
    margin-top: 0.5rem;
    padding: 0.5rem 1rem;
    background: #6b7280;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .verify-btn:hover:not(:disabled) {
    background: #4b5563;
  }

  .verify-btn:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 640px) {
    .crypto-checkout {
      padding: 1rem;
    }

    .wallet-address {
      flex-direction: column;
    }

    .copy-btn {
      align-self: flex-start;
    }
  }
</style>