/**
 * Payment Service
 * Handles payment processing, Stripe integration, and monetization features
 */

import Stripe from 'stripe';

export class PaymentService {
  constructor(options = {}) {
    if (!options.supabase) {
      throw new Error('Supabase client is required');
    }
    
    if (!options.stripeSecretKey) {
      throw new Error('Stripe secret key is required');
    }
    
    this.supabase = options.supabase;
    this.stripe = new Stripe(options.stripeSecretKey);
    
    // Pricing configuration
    this.pricing = {
      basic: {
        amount: 500, // $5.00 in cents
        currency: 'usd'
      },
      federated: {
        baseAmount: 1000, // $10.00 base fee
        perDirectoryAmount: 500, // $5.00 per directory
        currency: 'usd'
      }
    };
    
    // Supported currencies
    this.supportedCurrencies = ['usd', 'eur', 'gbp'];
    
    // Valid submission types
    this.validSubmissionTypes = ['basic', 'federated'];
  }

  /**
   * Create a payment intent for submission
   * @param {Object} paymentData - Payment data
   * @param {number} paymentData.amount - Amount in cents
   * @param {string} paymentData.currency - Currency code
   * @param {string} paymentData.submissionType - Type of submission
   * @param {string} paymentData.userId - User ID
   * @param {Object} [paymentData.metadata] - Additional metadata
   * @returns {Promise<Object>} Payment intent result
   */
  async createPaymentIntent(paymentData) {
    this.validatePaymentData(paymentData);
    
    try {
      const { amount, currency, submissionType, userId, metadata = {} } = paymentData;
      
      // Create payment intent with Stripe
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount,
        currency,
        metadata: {
          userId,
          submissionType,
          ...metadata
        },
        automatic_payment_methods: {
          enabled: true
        }
      });
      
      // Store payment record in database
      const { data: paymentRecord, error } = await this.supabase
        .from('payments')
        .insert({
          user_id: userId,
          payment_intent_id: paymentIntent.id,
          amount,
          currency,
          status: paymentIntent.status,
          submission_type: submissionType,
          metadata
        })
        .select()
        .single();
      
      if (error) {
        throw new Error(`Failed to store payment record: ${error.message}`);
      }
      
      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount,
        currency,
        status: paymentIntent.status,
        metadata
      };
      
    } catch (error) {
      throw new Error(`Failed to create payment intent: ${error.message}`);
    }
  }

  /**
   * Confirm payment and update status
   * @param {string} paymentIntentId - Payment intent ID
   * @returns {Promise<Object>} Payment confirmation result
   */
  async confirmPayment(paymentIntentId) {
    if (!paymentIntentId) {
      throw new Error('Payment intent ID is required');
    }
    
    try {
      // Retrieve payment intent from Stripe
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status === 'succeeded') {
        // Update payment record in database
        const { data: updatedPayment, error } = await this.supabase
          .from('payments')
          .update({
            status: 'succeeded',
            confirmed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('payment_intent_id', paymentIntentId)
          .select()
          .single();
        
        if (error) {
          console.error('Failed to update payment record:', error);
        }
        
        return {
          status: 'succeeded',
          paymentIntentId,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          metadata: paymentIntent.metadata
        };
      } else {
        throw new Error(`Payment failed with status: ${paymentIntent.status}`);
      }
      
    } catch (error) {
      throw new Error(`Payment confirmation failed: ${error.message}`);
    }
  }

  /**
   * Create Stripe customer
   * @param {Object} customerData - Customer data
   * @param {string} customerData.email - Customer email
   * @param {string} customerData.name - Customer name
   * @param {string} customerData.userId - User ID
   * @returns {Promise<Object>} Customer creation result
   */
  async createCustomer(customerData) {
    const { email, name, userId } = customerData;
    
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    if (!email || !this.isValidEmail(email)) {
      throw new Error('Invalid email format');
    }
    
    try {
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          userId
        }
      });
      
      // Store customer record in database
      const { data: customerRecord, error } = await this.supabase
        .from('stripe_customers')
        .insert({
          user_id: userId,
          stripe_customer_id: customer.id,
          email,
          name
        })
        .select()
        .single();
      
      if (error) {
        console.error('Failed to store customer record:', error);
      }
      
      return {
        customerId: customer.id,
        email,
        name
      };
      
    } catch (error) {
      throw new Error(`Failed to create customer: ${error.message}`);
    }
  }

  /**
   * Get payment history for user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Payment history
   */
  async getPaymentHistory(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    try {
      const { data: payments, error } = await this.supabase
        .from('payments')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) {
        throw new Error(`Failed to fetch payment history: ${error.message}`);
      }
      
      return payments || [];
      
    } catch (error) {
      throw new Error(`Failed to get payment history: ${error.message}`);
    }
  }

  /**
   * Process refund
   * @param {string} paymentIntentId - Payment intent ID
   * @param {number} [amount] - Refund amount (optional, defaults to full refund)
   * @returns {Promise<Object>} Refund result
   */
  async refundPayment(paymentIntentId, amount = null) {
    if (!paymentIntentId) {
      throw new Error('Payment intent ID is required');
    }
    
    if (amount !== null && amount <= 0) {
      throw new Error('Refund amount must be positive');
    }
    
    try {
      const refundData = {
        payment_intent: paymentIntentId
      };
      
      if (amount) {
        refundData.amount = amount;
      }
      
      const refund = await this.stripe.refunds.create(refundData);
      
      // Update payment record
      const { error } = await this.supabase
        .from('payments')
        .update({
          status: 'refunded',
          refunded_at: new Date().toISOString(),
          refund_amount: refund.amount,
          updated_at: new Date().toISOString()
        })
        .eq('payment_intent_id', paymentIntentId);
      
      if (error) {
        console.error('Failed to update payment record for refund:', error);
      }
      
      return {
        refundId: refund.id,
        amount: refund.amount,
        status: refund.status,
        paymentIntentId
      };
      
    } catch (error) {
      throw new Error(`Failed to process refund: ${error.message}`);
    }
  }

  /**
   * Calculate submission fee
   * @param {string} submissionType - Type of submission
   * @param {Array} [directories] - List of directories for federated submissions
   * @returns {Object} Fee calculation result
   */
  calculateSubmissionFee(submissionType, directories = []) {
    if (!this.validSubmissionTypes.includes(submissionType)) {
      throw new Error('Invalid submission type');
    }
    
    if (submissionType === 'basic') {
      return {
        amount: this.pricing.basic.amount,
        currency: this.pricing.basic.currency,
        type: 'basic'
      };
    }
    
    if (submissionType === 'federated') {
      if (!directories || directories.length === 0) {
        throw new Error('Directories are required for federated submissions');
      }
      
      const baseAmount = this.pricing.federated.baseAmount;
      const directoryAmount = directories.length * this.pricing.federated.perDirectoryAmount;
      const totalAmount = baseAmount + directoryAmount;
      
      return {
        amount: totalAmount,
        currency: this.pricing.federated.currency,
        type: 'federated',
        directories,
        breakdown: {
          baseAmount,
          directoryAmount,
          directoryCount: directories.length
        }
      };
    }
  }

  /**
   * Validate payment data
   * @param {Object} paymentData - Payment data to validate
   * @throws {Error} If validation fails
   */
  validatePaymentData(paymentData) {
    const { amount, currency, submissionType, userId } = paymentData;
    
    if (!amount || amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    
    if (!currency || !this.supportedCurrencies.includes(currency.toLowerCase())) {
      throw new Error('Invalid currency');
    }
    
    if (!submissionType || !this.validSubmissionTypes.includes(submissionType)) {
      throw new Error('Invalid submission type');
    }
    
    if (!userId) {
      throw new Error('User ID is required');
    }
  }

  /**
   * Handle Stripe webhook events
   * @param {Object} event - Stripe webhook event
   * @returns {Promise<Object>} Webhook processing result
   */
  async handleWebhook(event) {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          return await this.handlePaymentSucceeded(event.data.object);
          
        case 'payment_intent.payment_failed':
          return await this.handlePaymentFailed(event.data.object);
          
        case 'payment_intent.canceled':
          return await this.handlePaymentCanceled(event.data.object);
          
        default:
          return {
            processed: false,
            reason: 'Unhandled event type'
          };
      }
    } catch (error) {
      console.error('Webhook processing error:', error);
      throw new Error(`Webhook processing failed: ${error.message}`);
    }
  }

  /**
   * Handle successful payment webhook
   * @param {Object} paymentIntent - Payment intent object
   * @returns {Promise<Object>} Processing result
   */
  async handlePaymentSucceeded(paymentIntent) {
    const { error } = await this.supabase
      .from('payments')
      .update({
        status: 'succeeded',
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('payment_intent_id', paymentIntent.id);
    
    if (error) {
      console.error('Failed to update payment status:', error);
    }
    
    return {
      processed: true,
      paymentIntentId: paymentIntent.id,
      status: 'succeeded'
    };
  }

  /**
   * Handle failed payment webhook
   * @param {Object} paymentIntent - Payment intent object
   * @returns {Promise<Object>} Processing result
   */
  async handlePaymentFailed(paymentIntent) {
    const { error } = await this.supabase
      .from('payments')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('payment_intent_id', paymentIntent.id);
    
    if (error) {
      console.error('Failed to update payment status:', error);
    }
    
    return {
      processed: true,
      paymentIntentId: paymentIntent.id,
      status: 'failed'
    };
  }

  /**
   * Handle canceled payment webhook
   * @param {Object} paymentIntent - Payment intent object
   * @returns {Promise<Object>} Processing result
   */
  async handlePaymentCanceled(paymentIntent) {
    const { error } = await this.supabase
      .from('payments')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('payment_intent_id', paymentIntent.id);
    
    if (error) {
      console.error('Failed to update payment status:', error);
    }
    
    return {
      processed: true,
      paymentIntentId: paymentIntent.id,
      status: 'canceled'
    };
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Get pricing information
   * @returns {Object} Pricing configuration
   */
  getPricing() {
    return {
      basic: {
        amount: this.pricing.basic.amount,
        currency: this.pricing.basic.currency,
        displayAmount: `$${(this.pricing.basic.amount / 100).toFixed(2)}`
      },
      federated: {
        baseAmount: this.pricing.federated.baseAmount,
        perDirectoryAmount: this.pricing.federated.perDirectoryAmount,
        currency: this.pricing.federated.currency,
        displayBaseAmount: `$${(this.pricing.federated.baseAmount / 100).toFixed(2)}`,
        displayPerDirectoryAmount: `$${(this.pricing.federated.perDirectoryAmount / 100).toFixed(2)}`
      }
    };
  }

  /**
   * Format amount for display
   * @param {number} amount - Amount in cents
   * @param {string} currency - Currency code
   * @returns {string} Formatted amount
   */
  formatAmount(amount, currency = 'usd') {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    });
    
    return formatter.format(amount / 100);
  }
}