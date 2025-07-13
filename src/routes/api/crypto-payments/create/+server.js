/**
 * Crypto Payment Creation API Endpoint
 * 
 * Creates a new crypto payment session with real-time exchange rates
 */

import { json } from '@sveltejs/kit';
import { CryptoPaymentService } from '../../../../lib/services/crypto-payment-service.js';

/**
 * Create a new crypto payment session
 * @param {Request} request
 * @returns {Response}
 */
export async function POST({ request }) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { amount, currency, customerEmail, productId, metadata } = body;
    
    if (!amount || !currency || !customerEmail || !productId) {
      return json(
        { 
          error: 'Missing required fields: amount, currency, customerEmail, productId' 
        },
        { status: 400 }
      );
    }

    // Validate amount
    if (typeof amount !== 'number' || amount <= 0) {
      return json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    // Validate currency
    const supportedCurrencies = ['BTC', 'ETH', 'SOL', 'USDC'];
    if (!supportedCurrencies.includes(currency.toUpperCase())) {
      return json(
        { 
          error: `Unsupported currency. Supported currencies: ${supportedCurrencies.join(', ')}` 
        },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      return json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Create crypto payment service instance
    const cryptoService = new CryptoPaymentService();

    // Create payment session
    const session = await cryptoService.createPaymentSession({
      amount,
      currency: currency.toUpperCase(),
      customerEmail,
      productId,
      metadata: metadata || {}
    });

    // Generate QR code data for easy payment
    const qrData = cryptoService.generatePaymentQRData(session);

    // Return session with payment details
    return json({
      success: true,
      session: {
        id: session.id,
        amount: session.amount,
        currency: session.currency,
        cryptoAmount: session.cryptoAmount,
        exchangeRate: session.exchangeRate,
        walletAddress: session.walletAddress,
        customerEmail: session.customerEmail,
        productId: session.productId,
        status: session.status,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        metadata: session.metadata
      },
      payment: {
        walletAddress: session.walletAddress,
        amount: session.cryptoAmount,
        currency: session.currency,
        qrCode: qrData
      }
    });

  } catch (error) {
    console.error('Error creating crypto payment session:', error);
    
    // Handle specific error types
    if (error.message.includes('exchange rate')) {
      return json(
        { error: 'Unable to fetch current exchange rates. Please try again.' },
        { status: 503 }
      );
    }

    if (error.message.includes('wallet address')) {
      return json(
        { error: 'Crypto payment service is temporarily unavailable' },
        { status: 503 }
      );
    }

    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}