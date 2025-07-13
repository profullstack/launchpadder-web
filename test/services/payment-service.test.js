import { expect } from 'chai';
import nock from 'nock';
import { PaymentService } from '../../src/lib/services/payment-service.js';

describe('PaymentService', () => {
  let paymentService;
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    paymentService = new PaymentService({ 
      supabase: mockSupabase,
      stripeSecretKey: 'sk_test_mock_key'
    });
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('constructor', () => {
    it('should create an instance with required dependencies', () => {
      expect(paymentService).to.be.instanceOf(PaymentService);
      expect(paymentService.supabase).to.equal(mockSupabase);
    });

    it('should throw error if no Supabase client provided', () => {
      expect(() => new PaymentService()).to.throw('Supabase client is required');
    });

    it('should throw error if no Stripe secret key provided', () => {
      expect(() => new PaymentService({ supabase: mockSupabase }))
        .to.throw('Stripe secret key is required');
    });
  });

  describe('createPaymentIntent', () => {
    it('should create payment intent for basic submission', async () => {
      const paymentData = {
        amount: 500, // $5.00
        currency: 'usd',
        submissionType: 'basic',
        userId: 'user-123',
        metadata: {
          submissionUrl: 'https://example.com/product'
        }
      };

      const result = await paymentService.createPaymentIntent(paymentData);

      expect(result).to.have.property('clientSecret');
      expect(result).to.have.property('paymentIntentId');
      expect(result).to.have.property('amount', 500);
      expect(result).to.have.property('currency', 'usd');
    });

    it('should create payment intent for federated submission', async () => {
      const paymentData = {
        amount: 2500, // $25.00
        currency: 'usd',
        submissionType: 'federated',
        userId: 'user-123',
        metadata: {
          submissionUrl: 'https://example.com/product',
          directories: ['producthunt', 'betalist', 'indiehackers']
        }
      };

      const result = await paymentService.createPaymentIntent(paymentData);

      expect(result).to.have.property('clientSecret');
      expect(result).to.have.property('paymentIntentId');
      expect(result).to.have.property('amount', 2500);
      expect(result.metadata).to.have.property('directories');
    });

    it('should validate payment amount', async () => {
      const paymentData = {
        amount: 0,
        currency: 'usd',
        submissionType: 'basic',
        userId: 'user-123'
      };

      try {
        await paymentService.createPaymentIntent(paymentData);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Amount must be greater than 0');
      }
    });

    it('should validate currency', async () => {
      const paymentData = {
        amount: 500,
        currency: 'invalid',
        submissionType: 'basic',
        userId: 'user-123'
      };

      try {
        await paymentService.createPaymentIntent(paymentData);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid currency');
      }
    });

    it('should validate submission type', async () => {
      const paymentData = {
        amount: 500,
        currency: 'usd',
        submissionType: 'invalid',
        userId: 'user-123'
      };

      try {
        await paymentService.createPaymentIntent(paymentData);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid submission type');
      }
    });

    it('should require user ID', async () => {
      const paymentData = {
        amount: 500,
        currency: 'usd',
        submissionType: 'basic'
      };

      try {
        await paymentService.createPaymentIntent(paymentData);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('User ID is required');
      }
    });
  });

  describe('confirmPayment', () => {
    it('should confirm successful payment', async () => {
      const paymentIntentId = 'pi_test_123';
      
      const result = await paymentService.confirmPayment(paymentIntentId);

      expect(result).to.have.property('status', 'succeeded');
      expect(result).to.have.property('paymentIntentId', paymentIntentId);
      expect(result).to.have.property('amount');
      expect(result).to.have.property('currency');
    });

    it('should handle failed payments', async () => {
      const paymentIntentId = 'pi_test_failed';
      
      try {
        await paymentService.confirmPayment(paymentIntentId);
        expect.fail('Should have thrown payment failed error');
      } catch (error) {
        expect(error.message).to.include('Payment failed');
      }
    });

    it('should validate payment intent ID', async () => {
      try {
        await paymentService.confirmPayment('');
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Payment intent ID is required');
      }
    });
  });

  describe('createCustomer', () => {
    it('should create Stripe customer for user', async () => {
      const customerData = {
        email: 'test@example.com',
        name: 'Test User',
        userId: 'user-123'
      };

      const result = await paymentService.createCustomer(customerData);

      expect(result).to.have.property('customerId');
      expect(result).to.have.property('email', 'test@example.com');
      expect(result).to.have.property('name', 'Test User');
    });

    it('should validate email format', async () => {
      const customerData = {
        email: 'invalid-email',
        name: 'Test User',
        userId: 'user-123'
      };

      try {
        await paymentService.createCustomer(customerData);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid email format');
      }
    });

    it('should require user ID', async () => {
      const customerData = {
        email: 'test@example.com',
        name: 'Test User'
      };

      try {
        await paymentService.createCustomer(customerData);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('User ID is required');
      }
    });
  });

  describe('getPaymentHistory', () => {
    it('should return user payment history', async () => {
      const userId = 'user-123';
      
      const result = await paymentService.getPaymentHistory(userId);

      expect(result).to.be.an('array');
      expect(result).to.have.length.greaterThan(0);
      
      const payment = result[0];
      expect(payment).to.have.property('id');
      expect(payment).to.have.property('amount');
      expect(payment).to.have.property('currency');
      expect(payment).to.have.property('status');
      expect(payment).to.have.property('created_at');
    });

    it('should return empty array for user with no payments', async () => {
      const userId = 'user-no-payments';
      
      const result = await paymentService.getPaymentHistory(userId);

      expect(result).to.be.an('array');
      expect(result).to.have.length(0);
    });

    it('should validate user ID', async () => {
      try {
        await paymentService.getPaymentHistory('');
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('User ID is required');
      }
    });
  });

  describe('refundPayment', () => {
    it('should process full refund', async () => {
      const paymentIntentId = 'pi_test_123';
      
      const result = await paymentService.refundPayment(paymentIntentId);

      expect(result).to.have.property('refundId');
      expect(result).to.have.property('amount');
      expect(result).to.have.property('status', 'succeeded');
      expect(result).to.have.property('paymentIntentId', paymentIntentId);
    });

    it('should process partial refund', async () => {
      const paymentIntentId = 'pi_test_123';
      const refundAmount = 250; // Partial refund
      
      const result = await paymentService.refundPayment(paymentIntentId, refundAmount);

      expect(result).to.have.property('refundId');
      expect(result).to.have.property('amount', refundAmount);
      expect(result).to.have.property('status', 'succeeded');
    });

    it('should validate payment intent ID', async () => {
      try {
        await paymentService.refundPayment('');
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Payment intent ID is required');
      }
    });

    it('should validate refund amount', async () => {
      const paymentIntentId = 'pi_test_123';
      
      try {
        await paymentService.refundPayment(paymentIntentId, -100);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Refund amount must be positive');
      }
    });
  });

  describe('calculateSubmissionFee', () => {
    it('should calculate basic submission fee', () => {
      const fee = paymentService.calculateSubmissionFee('basic');
      
      expect(fee).to.have.property('amount', 500); // $5.00
      expect(fee).to.have.property('currency', 'usd');
      expect(fee).to.have.property('type', 'basic');
    });

    it('should calculate federated submission fee', () => {
      const directories = ['producthunt', 'betalist', 'indiehackers'];
      const fee = paymentService.calculateSubmissionFee('federated', directories);
      
      expect(fee).to.have.property('amount', 2500); // $25.00
      expect(fee).to.have.property('currency', 'usd');
      expect(fee).to.have.property('type', 'federated');
      expect(fee).to.have.property('directories', directories);
    });

    it('should calculate dynamic federated fee based on directory count', () => {
      const directories = ['producthunt', 'betalist'];
      const fee = paymentService.calculateSubmissionFee('federated', directories);
      
      // Base fee + per directory fee
      expect(fee.amount).to.be.greaterThan(500);
    });

    it('should throw error for invalid submission type', () => {
      expect(() => paymentService.calculateSubmissionFee('invalid'))
        .to.throw('Invalid submission type');
    });

    it('should require directories for federated submissions', () => {
      expect(() => paymentService.calculateSubmissionFee('federated'))
        .to.throw('Directories are required for federated submissions');
    });
  });

  describe('validatePaymentData', () => {
    it('should validate correct payment data', () => {
      const paymentData = {
        amount: 500,
        currency: 'usd',
        submissionType: 'basic',
        userId: 'user-123'
      };

      expect(() => paymentService.validatePaymentData(paymentData)).to.not.throw();
    });

    it('should reject negative amounts', () => {
      const paymentData = {
        amount: -100,
        currency: 'usd',
        submissionType: 'basic',
        userId: 'user-123'
      };

      expect(() => paymentService.validatePaymentData(paymentData))
        .to.throw('Amount must be greater than 0');
    });

    it('should reject zero amounts', () => {
      const paymentData = {
        amount: 0,
        currency: 'usd',
        submissionType: 'basic',
        userId: 'user-123'
      };

      expect(() => paymentService.validatePaymentData(paymentData))
        .to.throw('Amount must be greater than 0');
    });

    it('should validate supported currencies', () => {
      const supportedCurrencies = ['usd', 'eur', 'gbp'];
      
      supportedCurrencies.forEach(currency => {
        const paymentData = {
          amount: 500,
          currency,
          submissionType: 'basic',
          userId: 'user-123'
        };

        expect(() => paymentService.validatePaymentData(paymentData)).to.not.throw();
      });
    });

    it('should reject unsupported currencies', () => {
      const paymentData = {
        amount: 500,
        currency: 'xyz',
        submissionType: 'basic',
        userId: 'user-123'
      };

      expect(() => paymentService.validatePaymentData(paymentData))
        .to.throw('Invalid currency');
    });
  });

  describe('webhookHandler', () => {
    it('should handle payment succeeded webhook', async () => {
      const webhookEvent = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            amount: 500,
            currency: 'usd',
            status: 'succeeded',
            metadata: {
              userId: 'user-123',
              submissionType: 'basic'
            }
          }
        }
      };

      const result = await paymentService.handleWebhook(webhookEvent);

      expect(result).to.have.property('processed', true);
      expect(result).to.have.property('paymentIntentId', 'pi_test_123');
    });

    it('should handle payment failed webhook', async () => {
      const webhookEvent = {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test_failed',
            amount: 500,
            currency: 'usd',
            status: 'requires_payment_method',
            metadata: {
              userId: 'user-123',
              submissionType: 'basic'
            }
          }
        }
      };

      const result = await paymentService.handleWebhook(webhookEvent);

      expect(result).to.have.property('processed', true);
      expect(result).to.have.property('paymentIntentId', 'pi_test_failed');
    });

    it('should ignore unhandled webhook events', async () => {
      const webhookEvent = {
        type: 'customer.created',
        data: {
          object: {
            id: 'cus_test_123'
          }
        }
      };

      const result = await paymentService.handleWebhook(webhookEvent);

      expect(result).to.have.property('processed', false);
      expect(result).to.have.property('reason', 'Unhandled event type');
    });
  });
});

// Mock helper function
function createMockSupabase() {
  return {
    from: (table) => ({
      insert: (data) => ({
        select: () => ({
          single: async () => ({
            data: {
              id: 'payment-123',
              ...data,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            error: null
          })
        })
      }),

      select: (columns) => ({
        eq: (column, value) => ({
          order: () => ({
            then: async (resolve) => {
              if (value === 'user-no-payments') {
                resolve({ data: [], error: null });
              } else {
                resolve({
                  data: [
                    {
                      id: 'payment-123',
                      user_id: value,
                      amount: 500,
                      currency: 'usd',
                      status: 'succeeded',
                      payment_intent_id: 'pi_test_123',
                      created_at: new Date().toISOString()
                    }
                  ],
                  error: null
                });
              }
            }
          })
        })
      }),

      update: (data) => ({
        eq: () => ({
          select: () => ({
            single: async () => ({
              data: { id: 'payment-123', ...data },
              error: null
            })
          })
        })
      })
    })
  };
}