/**
 * Crypto Payment Verification API Endpoint
 * 
 * Verifies crypto payment transactions and updates payment status
 */

import { json } from '@sveltejs/kit';
import { CryptoPaymentService } from '../../../../lib/services/crypto-payment-service.js';

/**
 * Verify a crypto payment transaction
 * @param {Request} request
 * @returns {Response}
 */
export async function POST({ request }) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { sessionId, transactionId, amount, currency } = body;
    
    if (!sessionId || !transactionId || !amount || !currency) {
      return json(
        { 
          error: 'Missing required fields: sessionId, transactionId, amount, currency' 
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

    // Create crypto payment service instance
    const cryptoService = new CryptoPaymentService();

    // Verify the payment
    const verificationResult = await cryptoService.verifyPayment({
      sessionId,
      transactionId,
      amount,
      currency: currency.toUpperCase()
    });

    // Get updated session details
    const updatedSession = await cryptoService.getPaymentSession(sessionId);

    return json({
      success: true,
      verification: verificationResult,
      session: {
        id: updatedSession.id,
        status: updatedSession.status,
        transactionId: updatedSession.transactionId,
        verifiedAt: updatedSession.verifiedAt,
        amount: updatedSession.amount,
        cryptoAmount: updatedSession.cryptoAmount,
        currency: updatedSession.currency,
        customerEmail: updatedSession.customerEmail,
        productId: updatedSession.productId
      }
    });

  } catch (error) {
    console.error('Error verifying crypto payment:', error);
    
    // Handle specific error types
    if (error.message.includes('not found')) {
      return json(
        { error: 'Payment session not found' },
        { status: 404 }
      );
    }

    if (error.message.includes('mismatch')) {
      return json(
        { error: error.message },
        { status: 400 }
      );
    }

    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Get crypto payment session status
 * @param {Request} request
 * @returns {Response}
 */
export async function GET({ url }) {
  try {
    const sessionId = url.searchParams.get('sessionId');
    
    if (!sessionId) {
      return json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Create crypto payment service instance
    const cryptoService = new CryptoPaymentService();

    // Get payment session
    const session = await cryptoService.getPaymentSession(sessionId);

    if (!session) {
      return json(
        { error: 'Payment session not found' },
        { status: 404 }
      );
    }

    // Check if session has expired
    const isExpired = cryptoService.isSessionExpired(session);

    return json({
      success: true,
      session: {
        id: session.id,
        status: isExpired && session.status === 'pending' ? 'expired' : session.status,
        amount: session.amount,
        cryptoAmount: session.cryptoAmount,
        currency: session.currency,
        walletAddress: session.walletAddress,
        customerEmail: session.customerEmail,
        productId: session.productId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        transactionId: session.transactionId,
        verifiedAt: session.verifiedAt,
        metadata: session.metadata,
        isExpired
      }
    });

  } catch (error) {
    console.error('Error getting crypto payment session:', error);
    
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}