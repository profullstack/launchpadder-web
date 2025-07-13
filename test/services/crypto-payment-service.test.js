import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import { CryptoPaymentService } from '../../src/lib/services/crypto-payment-service.js';

describe('CryptoPaymentService', () => {
  let cryptoService;
  let fetchStub;

  beforeEach(() => {
    // Create service with test wallet addresses
    cryptoService = new CryptoPaymentService({
      bitcoinAddress: 'bc1q254klmlgtanf8xez28gy7r0enpyhk88r2499pt',
      ethereumAddress: '0x402282c72a2f2b9f059C3b39Fa63932D6AA09f11',
      solanaAddress: 'CsTWZTbDryjcb229RQ9b7wny5qytH9jwoJy6Lu98xpeF',
      usdcAddress: '0x402282c72a2f2b9f059C3b39Fa63932D6AA09f11',
      skipValidation: false
    });
    
    // Stub fetch for API calls
    fetchStub = sinon.stub(global, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  describe('constructor', () => {
    it('should initialize with wallet addresses from environment', () => {
      expect(cryptoService.wallets.btc).to.equal('bc1q254klmlgtanf8xez28gy7r0enpyhk88r2499pt');
      expect(cryptoService.wallets.eth).to.equal('0x402282c72a2f2b9f059C3b39Fa63932D6AA09f11');
      expect(cryptoService.wallets.sol).to.equal('CsTWZTbDryjcb229RQ9b7wny5qytH9jwoJy6Lu98xpeF');
      expect(cryptoService.wallets.usdc).to.equal('0x402282c72a2f2b9f059C3b39Fa63932D6AA09f11');
    });

    it('should throw error if required wallet addresses are missing', () => {
      expect(() => new CryptoPaymentService({
        ethereumAddress: '0x402282c72a2f2b9f059C3b39Fa63932D6AA09f11',
        solanaAddress: 'CsTWZTbDryjcb229RQ9b7wny5qytH9jwoJy6Lu98xpeF',
        usdcAddress: '0x402282c72a2f2b9f059C3b39Fa63932D6AA09f11'
        // Missing bitcoinAddress
      })).to.throw('Missing required wallet address: BITCOIN_ADDRESS');
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should return list of supported cryptocurrencies', () => {
      const currencies = cryptoService.getSupportedCurrencies();
      
      expect(currencies).to.be.an('array');
      expect(currencies).to.include.members(['BTC', 'ETH', 'SOL', 'USDC']);
    });
  });

  describe('getExchangeRate', () => {
    it('should fetch exchange rate for Bitcoin', async () => {
      const mockResponse = {
        bitcoin: { usd: 45000 }
      };
      
      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const rate = await cryptoService.getExchangeRate('BTC', 'USD');
      
      expect(rate).to.equal(45000);
      expect(fetchStub.calledOnce).to.be.true;
    });

    it('should fetch exchange rate for Ethereum', async () => {
      const mockResponse = {
        ethereum: { usd: 3000 }
      };
      
      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const rate = await cryptoService.getExchangeRate('ETH', 'USD');
      
      expect(rate).to.equal(3000);
    });

    it('should fetch exchange rate for Solana', async () => {
      const mockResponse = {
        solana: { usd: 100 }
      };
      
      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const rate = await cryptoService.getExchangeRate('SOL', 'USD');
      
      expect(rate).to.equal(100);
    });

    it('should fetch exchange rate for USDC', async () => {
      const mockResponse = {
        'usd-coin': { usd: 1 }
      };
      
      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const rate = await cryptoService.getExchangeRate('USDC', 'USD');
      
      expect(rate).to.equal(1);
    });

    it('should throw error for unsupported currency', async () => {
      try {
        await cryptoService.getExchangeRate('INVALID', 'USD');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Unsupported cryptocurrency');
      }
    });

    it('should throw error when API request fails', async () => {
      fetchStub.resolves({
        ok: false,
        status: 500
      });

      try {
        await cryptoService.getExchangeRate('BTC', 'USD');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to fetch exchange rate');
      }
    });

    it('should throw error when rate data is missing', async () => {
      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve({})
      });

      try {
        await cryptoService.getExchangeRate('BTC', 'USD');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Exchange rate not found');
      }
    });
  });

  describe('calculateCryptoAmount', () => {
    beforeEach(() => {
      // Mock getExchangeRate for these tests
      sinon.stub(cryptoService, 'getExchangeRate').resolves(45000);
    });

    afterEach(() => {
      cryptoService.getExchangeRate.restore();
    });

    it('should calculate crypto amount from USD amount', async () => {
      const result = await cryptoService.calculateCryptoAmount(100, 'BTC');
      
      expect(result.cryptoAmount).to.be.closeTo(0.00222222, 0.000001);
      expect(result.exchangeRate).to.equal(45000);
      expect(result.currency).to.equal('BTC');
      expect(result.usdAmount).to.equal(100);
    });

    it('should handle different cryptocurrencies', async () => {
      cryptoService.getExchangeRate.resolves(3000);
      
      const result = await cryptoService.calculateCryptoAmount(150, 'ETH');
      
      expect(result.cryptoAmount).to.equal(0.05);
      expect(result.exchangeRate).to.equal(3000);
      expect(result.currency).to.equal('ETH');
    });

    it('should throw error for invalid amount', async () => {
      try {
        await cryptoService.calculateCryptoAmount(-100, 'BTC');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Amount must be positive');
      }
    });
  });

  describe('createPaymentSession', () => {
    beforeEach(() => {
      sinon.stub(cryptoService, 'calculateCryptoAmount').resolves({
        cryptoAmount: 0.00222222,
        exchangeRate: 45000,
        currency: 'BTC',
        usdAmount: 100
      });
    });

    afterEach(() => {
      cryptoService.calculateCryptoAmount.restore();
    });

    it('should create payment session with valid data', async () => {
      const sessionData = {
        amount: 100,
        currency: 'BTC',
        customerEmail: 'test@example.com',
        productId: 'basic_submission',
        metadata: { test: 'data' }
      };

      const session = await cryptoService.createPaymentSession(sessionData);
      
      expect(session).to.have.property('id');
      expect(session.amount).to.equal(100);
      expect(session.currency).to.equal('BTC');
      expect(session.customerEmail).to.equal('test@example.com');
      expect(session.cryptoAmount).to.equal(0.00222222);
      expect(session.exchangeRate).to.equal(45000);
      expect(session.walletAddress).to.equal('bc1q254klmlgtanf8xez28gy7r0enpyhk88r2499pt');
      expect(session.status).to.equal('pending');
      expect(session.expiresAt).to.be.a('string');
      expect(session.metadata).to.deep.equal({ test: 'data' });
    });

    it('should generate unique session IDs', async () => {
      const sessionData = {
        amount: 100,
        currency: 'BTC',
        customerEmail: 'test@example.com',
        productId: 'basic_submission'
      };

      const session1 = await cryptoService.createPaymentSession(sessionData);
      const session2 = await cryptoService.createPaymentSession(sessionData);
      
      expect(session1.id).to.not.equal(session2.id);
    });

    it('should set expiration time 24 hours in future', async () => {
      const sessionData = {
        amount: 100,
        currency: 'BTC',
        customerEmail: 'test@example.com',
        productId: 'basic_submission'
      };

      const session = await cryptoService.createPaymentSession(sessionData);
      const expiresAt = new Date(session.expiresAt);
      const now = new Date();
      const expectedExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      expect(expiresAt.getTime()).to.be.closeTo(expectedExpiry.getTime(), 1000);
    });

    it('should throw error for missing required fields', async () => {
      try {
        await cryptoService.createPaymentSession({
          amount: 100,
          currency: 'BTC'
          // Missing customerEmail
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Customer email is required');
      }
    });
  });

  describe('getPaymentSession', () => {
    let sessionId;

    beforeEach(async () => {
      sinon.stub(cryptoService, 'calculateCryptoAmount').resolves({
        cryptoAmount: 0.00222222,
        exchangeRate: 45000,
        currency: 'BTC',
        usdAmount: 100
      });

      const session = await cryptoService.createPaymentSession({
        amount: 100,
        currency: 'BTC',
        customerEmail: 'test@example.com',
        productId: 'basic_submission'
      });
      
      sessionId = session.id;
    });

    afterEach(() => {
      cryptoService.calculateCryptoAmount.restore();
    });

    it('should retrieve existing payment session', async () => {
      const session = await cryptoService.getPaymentSession(sessionId);
      
      expect(session).to.not.be.null;
      expect(session.id).to.equal(sessionId);
      expect(session.amount).to.equal(100);
      expect(session.currency).to.equal('BTC');
    });

    it('should return null for non-existent session', async () => {
      const session = await cryptoService.getPaymentSession('non-existent-id');
      
      expect(session).to.be.null;
    });
  });

  describe('verifyPayment', () => {
    let sessionId;

    beforeEach(async () => {
      sinon.stub(cryptoService, 'calculateCryptoAmount').resolves({
        cryptoAmount: 0.00222222,
        exchangeRate: 45000,
        currency: 'BTC',
        usdAmount: 100
      });

      const session = await cryptoService.createPaymentSession({
        amount: 100,
        currency: 'BTC',
        customerEmail: 'test@example.com',
        productId: 'basic_submission'
      });
      
      sessionId = session.id;
    });

    afterEach(() => {
      cryptoService.calculateCryptoAmount.restore();
    });

    it('should verify payment and update session status', async () => {
      const verificationData = {
        sessionId,
        transactionId: 'tx123456',
        amount: 0.00222222,
        currency: 'BTC'
      };

      const result = await cryptoService.verifyPayment(verificationData);
      
      expect(result.success).to.be.true;
      expect(result.sessionId).to.equal(sessionId);
      expect(result.transactionId).to.equal('tx123456');
      
      // Check that session was updated
      const session = await cryptoService.getPaymentSession(sessionId);
      expect(session.status).to.equal('completed');
      expect(session.transactionId).to.equal('tx123456');
    });

    it('should throw error for non-existent session', async () => {
      try {
        await cryptoService.verifyPayment({
          sessionId: 'non-existent',
          transactionId: 'tx123456',
          amount: 0.00222222,
          currency: 'BTC'
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Payment session not found');
      }
    });

    it('should throw error for amount mismatch', async () => {
      try {
        await cryptoService.verifyPayment({
          sessionId,
          transactionId: 'tx123456',
          amount: 0.001, // Wrong amount
          currency: 'BTC'
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Payment amount mismatch');
      }
    });

    it('should throw error for currency mismatch', async () => {
      try {
        await cryptoService.verifyPayment({
          sessionId,
          transactionId: 'tx123456',
          amount: 0.00222222,
          currency: 'ETH' // Wrong currency
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Payment currency mismatch');
      }
    });
  });

  describe('getWalletAddress', () => {
    it('should return correct wallet address for each currency', () => {
      expect(cryptoService.getWalletAddress('BTC')).to.equal('bc1q254klmlgtanf8xez28gy7r0enpyhk88r2499pt');
      expect(cryptoService.getWalletAddress('ETH')).to.equal('0x402282c72a2f2b9f059C3b39Fa63932D6AA09f11');
      expect(cryptoService.getWalletAddress('SOL')).to.equal('CsTWZTbDryjcb229RQ9b7wny5qytH9jwoJy6Lu98xpeF');
      expect(cryptoService.getWalletAddress('USDC')).to.equal('0x402282c72a2f2b9f059C3b39Fa63932D6AA09f11');
    });

    it('should throw error for unsupported currency', () => {
      expect(() => cryptoService.getWalletAddress('INVALID')).to.throw('Unsupported cryptocurrency: INVALID');
    });
  });
});