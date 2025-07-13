/**
 * Crypto Payment Service
 * 
 * Handles cryptocurrency payments for Bitcoin, Ethereum, Solana, and USDC
 * with real-time exchange rate conversion and payment verification.
 */

import crypto from 'crypto';

/**
 * CryptoPaymentService class for handling cryptocurrency payments
 */
export class CryptoPaymentService {
  constructor(options = {}) {
    // Initialize wallet addresses from environment variables or options
    this.wallets = {
      btc: options.bitcoinAddress || process.env.BITCOIN_ADDRESS,
      eth: options.ethereumAddress || process.env.ETHEREUM_ADDRESS,
      sol: options.solanaAddress || process.env.SOLANA_ADDRESS,
      usdc: options.usdcAddress || process.env.USDC_ADDRESS
    };

    // Validate that all required wallet addresses are configured (skip in test mode)
    if (!options.skipValidation) {
      this._validateWalletAddresses();
    }

    // In-memory storage for payment sessions (in production, use database)
    this.paymentSessions = new Map();

    // CoinGecko API mapping for cryptocurrency IDs
    this.coinGeckoIds = {
      BTC: 'bitcoin',
      ETH: 'ethereum',
      SOL: 'solana',
      USDC: 'usd-coin'
    };

    // Supported currencies
    this.supportedCurrencies = ['BTC', 'ETH', 'SOL', 'USDC'];
  }

  /**
   * Validate that all required wallet addresses are configured
   * @private
   */
  _validateWalletAddresses() {
    const requiredWallets = [
      { key: 'btc', name: 'BITCOIN_ADDRESS' },
      { key: 'eth', name: 'ETHEREUM_ADDRESS' },
      { key: 'sol', name: 'SOLANA_ADDRESS' },
      { key: 'usdc', name: 'USDC_ADDRESS' }
    ];

    for (const wallet of requiredWallets) {
      if (!this.wallets[wallet.key]) {
        throw new Error(`Missing required wallet address: ${wallet.name}`);
      }
    }
  }

  /**
   * Get list of supported cryptocurrencies
   * @returns {string[]} Array of supported currency codes
   */
  getSupportedCurrencies() {
    return [...this.supportedCurrencies];
  }

  /**
   * Get wallet address for a specific cryptocurrency
   * @param {string} currency - Currency code (BTC, ETH, SOL, USDC)
   * @returns {string} Wallet address
   */
  getWalletAddress(currency) {
    const currencyKey = currency.toLowerCase();
    
    if (!this.wallets[currencyKey]) {
      throw new Error(`Unsupported cryptocurrency: ${currency}`);
    }
    
    return this.wallets[currencyKey];
  }

  /**
   * Fetch real-time exchange rate for a cryptocurrency
   * @param {string} fromCurrency - Cryptocurrency code (BTC, ETH, SOL, USDC)
   * @param {string} toCurrency - Target currency code (USD)
   * @returns {Promise<number>} Exchange rate
   */
  async getExchangeRate(fromCurrency, toCurrency = 'USD') {
    if (!this.supportedCurrencies.includes(fromCurrency)) {
      throw new Error(`Unsupported cryptocurrency: ${fromCurrency}`);
    }

    const coinId = this.coinGeckoIds[fromCurrency];
    const targetCurrency = toCurrency.toLowerCase();
    
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${targetCurrency}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch exchange rate: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data[coinId] || !data[coinId][targetCurrency]) {
        throw new Error(`Exchange rate not found for ${fromCurrency} to ${toCurrency}`);
      }

      return data[coinId][targetCurrency];
    } catch (error) {
      throw new Error(`Failed to fetch exchange rate: ${error.message}`);
    }
  }

  /**
   * Calculate cryptocurrency amount from USD amount
   * @param {number} usdAmount - Amount in USD
   * @param {string} currency - Cryptocurrency code
   * @returns {Promise<Object>} Calculation result with crypto amount and exchange rate
   */
  async calculateCryptoAmount(usdAmount, currency) {
    if (usdAmount <= 0) {
      throw new Error('Amount must be positive');
    }

    const exchangeRate = await this.getExchangeRate(currency, 'USD');
    const cryptoAmount = usdAmount / exchangeRate;

    return {
      usdAmount,
      cryptoAmount,
      exchangeRate,
      currency
    };
  }

  /**
   * Create a new payment session
   * @param {Object} sessionData - Payment session data
   * @param {number} sessionData.amount - Amount in USD
   * @param {string} sessionData.currency - Cryptocurrency code
   * @param {string} sessionData.customerEmail - Customer email
   * @param {string} sessionData.productId - Product ID
   * @param {Object} sessionData.metadata - Additional metadata
   * @returns {Promise<Object>} Payment session
   */
  async createPaymentSession(sessionData) {
    const { amount, currency, customerEmail, productId, metadata = {} } = sessionData;

    // Validate required fields
    if (!customerEmail) {
      throw new Error('Customer email is required');
    }

    if (!amount || amount <= 0) {
      throw new Error('Valid amount is required');
    }

    if (!currency) {
      throw new Error('Currency is required');
    }

    if (!productId) {
      throw new Error('Product ID is required');
    }

    // Calculate crypto amount
    const calculation = await this.calculateCryptoAmount(amount, currency);
    
    // Get wallet address
    const walletAddress = this.getWalletAddress(currency);

    // Generate unique session ID
    const sessionId = `crypto_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    // Create session object
    const session = {
      id: sessionId,
      amount,
      currency,
      cryptoAmount: calculation.cryptoAmount,
      exchangeRate: calculation.exchangeRate,
      customerEmail,
      productId,
      walletAddress,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      metadata,
      transactionId: null
    };

    // Store session
    this.paymentSessions.set(sessionId, session);

    return session;
  }

  /**
   * Get a payment session by ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Payment session or null if not found
   */
  async getPaymentSession(sessionId) {
    return this.paymentSessions.get(sessionId) || null;
  }

  /**
   * Verify a payment and update session status
   * @param {Object} verificationData - Payment verification data
   * @param {string} verificationData.sessionId - Session ID
   * @param {string} verificationData.transactionId - Transaction ID
   * @param {number} verificationData.amount - Amount received
   * @param {string} verificationData.currency - Currency received
   * @returns {Promise<Object>} Verification result
   */
  async verifyPayment(verificationData) {
    const { sessionId, transactionId, amount, currency } = verificationData;

    // Get payment session
    const session = await this.getPaymentSession(sessionId);
    
    if (!session) {
      throw new Error('Payment session not found');
    }

    // Verify amount matches (with small tolerance for floating point precision)
    const tolerance = 0.000001;
    if (Math.abs(session.cryptoAmount - amount) > tolerance) {
      throw new Error(`Payment amount mismatch. Expected: ${session.cryptoAmount}, Received: ${amount}`);
    }

    // Verify currency matches
    if (session.currency !== currency) {
      throw new Error(`Payment currency mismatch. Expected: ${session.currency}, Received: ${currency}`);
    }

    // Update session
    session.status = 'completed';
    session.transactionId = transactionId;
    session.verifiedAt = new Date().toISOString();

    // Store updated session
    this.paymentSessions.set(sessionId, session);

    return {
      success: true,
      sessionId,
      transactionId,
      amount,
      currency,
      status: 'completed'
    };
  }

  /**
   * Get payment sessions for a customer
   * @param {string} customerEmail - Customer email
   * @returns {Promise<Object[]>} Array of payment sessions
   */
  async getCustomerPaymentSessions(customerEmail) {
    const sessions = Array.from(this.paymentSessions.values())
      .filter(session => session.customerEmail === customerEmail)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return sessions;
  }

  /**
   * Check if a payment session has expired
   * @param {Object} session - Payment session
   * @returns {boolean} True if expired
   */
  isSessionExpired(session) {
    return new Date() > new Date(session.expiresAt);
  }

  /**
   * Clean up expired payment sessions
   * @returns {Promise<number>} Number of sessions cleaned up
   */
  async cleanupExpiredSessions() {
    let cleanedCount = 0;
    
    for (const [sessionId, session] of this.paymentSessions.entries()) {
      if (this.isSessionExpired(session) && session.status === 'pending') {
        this.paymentSessions.delete(sessionId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Generate payment QR code data
   * @param {Object} session - Payment session
   * @returns {Object} QR code data
   */
  generatePaymentQRData(session) {
    const { currency, walletAddress, cryptoAmount, id } = session;
    
    // Generate payment URI based on cryptocurrency
    let paymentUri;
    
    switch (currency) {
      case 'BTC':
        paymentUri = `bitcoin:${walletAddress}?amount=${cryptoAmount}&label=LaunchPadder Payment&message=Payment for ${id}`;
        break;
      case 'ETH':
      case 'USDC':
        paymentUri = `ethereum:${walletAddress}?value=${cryptoAmount}&gas=21000`;
        break;
      case 'SOL':
        paymentUri = `solana:${walletAddress}?amount=${cryptoAmount}&label=LaunchPadder Payment`;
        break;
      default:
        paymentUri = `${currency.toLowerCase()}:${walletAddress}?amount=${cryptoAmount}`;
    }

    return {
      uri: paymentUri,
      address: walletAddress,
      amount: cryptoAmount,
      currency,
      sessionId: id
    };
  }
}

// Export singleton instance (only create if environment variables are available)
let cryptoPaymentService;
try {
  cryptoPaymentService = new CryptoPaymentService();
} catch (error) {
  // In test or development environment, singleton may not be available
  cryptoPaymentService = null;
}

export { cryptoPaymentService };

// Default export
export default cryptoPaymentService;