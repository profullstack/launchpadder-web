import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import { FederatedSubmissionService } from '../../src/lib/services/federated-submission-service.js';

describe('FederatedSubmissionService', () => {
  let federatedService;
  let fetchStub;
  let supabaseStub;
  let federationDiscoveryStub;
  let paymentServiceStub;

  beforeEach(() => {
    // Create a simple mock that returns promises
    supabaseStub = {
      from: sinon.stub().returnsThis(),
      select: sinon.stub().returnsThis(),
      insert: sinon.stub().returnsThis(),
      update: sinon.stub().returnsThis(),
      delete: sinon.stub().returnsThis(),
      eq: sinon.stub().returnsThis(),
      gte: sinon.stub().returnsThis(),
      order: sinon.stub().returnsThis(),
      limit: sinon.stub().returnsThis(),
      then: sinon.stub(),
      catch: sinon.stub()
    };

    // Make the chain return a promise
    Object.keys(supabaseStub).forEach(key => {
      if (typeof supabaseStub[key] === 'function' && key !== 'then' && key !== 'catch') {
        const originalMethod = supabaseStub[key];
        supabaseStub[key] = (...args) => {
          originalMethod(...args);
          return supabaseStub;
        };
      }
    });

    // Mock federation discovery service
    federationDiscoveryStub = {
      discoverDirectories: sinon.stub(),
      getKnownInstances: sinon.stub(),
      verifyInstance: sinon.stub()
    };

    // Mock payment service
    paymentServiceStub = {
      createPaymentSession: sinon.stub(),
      verifyPayment: sinon.stub(),
      calculateTotalCost: sinon.stub()
    };

    federatedService = new FederatedSubmissionService(
      supabaseStub,
      federationDiscoveryStub,
      paymentServiceStub
    );
    
    // Stub fetch for external API calls
    fetchStub = sinon.stub(global, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
    sinon.restore();
  });

  describe('constructor', () => {
    it('should initialize with required dependencies', () => {
      expect(federatedService.supabase).to.equal(supabaseStub);
      expect(federatedService.federationDiscovery).to.equal(federationDiscoveryStub);
      expect(federatedService.paymentService).to.equal(paymentServiceStub);
    });

    it('should throw error if no Supabase client provided', () => {
      expect(() => new FederatedSubmissionService()).to.throw('Supabase client is required');
    });

    it('should throw error if no federation discovery service provided', () => {
      expect(() => new FederatedSubmissionService(supabaseStub)).to.throw('Federation discovery service is required');
    });
  });

  describe('discoverAvailableDirectories', () => {
    it('should discover directories from federation network', async () => {
      const mockDirectories = [
        {
          id: 'ph-main',
          name: 'Product Hunt Main',
          instance_url: 'https://ph-clone.example.com',
          category: 'products',
          submission_fee: { usd: 5.00 },
          requirements: { url_required: true }
        },
        {
          id: 'ih-showcase',
          name: 'Indie Hackers Showcase',
          instance_url: 'https://ih-directory.example.com',
          category: 'startups',
          submission_fee: { usd: 10.00 },
          requirements: { url_required: true }
        }
      ];

      federationDiscoveryStub.discoverDirectories.resolves(mockDirectories);

      const directories = await federatedService.discoverAvailableDirectories();

      expect(directories).to.deep.equal(mockDirectories);
      expect(federationDiscoveryStub.discoverDirectories.calledOnce).to.be.true;
    });

    it('should filter directories by category', async () => {
      const mockDirectories = [
        {
          id: 'products-dir',
          category: 'products',
          submission_fee: { usd: 5.00 }
        }
      ];

      federationDiscoveryStub.discoverDirectories.resolves(mockDirectories);

      const directories = await federatedService.discoverAvailableDirectories({ category: 'products' });

      expect(directories).to.have.length(1);
      expect(federationDiscoveryStub.discoverDirectories.calledWith({ category: 'products' })).to.be.true;
    });

    it('should handle discovery errors gracefully', async () => {
      federationDiscoveryStub.discoverDirectories.rejects(new Error('Network error'));

      try {
        await federatedService.discoverAvailableDirectories();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to discover directories');
      }
    });
  });

  describe('calculateSubmissionCost', () => {
    it('should calculate total cost for multiple directories', async () => {
      const selectedDirectories = [
        { id: 'dir1', submission_fee: { usd: 5.00 } },
        { id: 'dir2', submission_fee: { usd: 10.00 } },
        { id: 'dir3', submission_fee: { usd: 3.00 } }
      ];

      const cost = await federatedService.calculateSubmissionCost(selectedDirectories);

      expect(cost).to.deep.equal({
        total_usd: 18.00,
        breakdown: [
          { directory_id: 'dir1', cost_usd: 5.00 },
          { directory_id: 'dir2', cost_usd: 10.00 },
          { directory_id: 'dir3', cost_usd: 3.00 }
        ],
        currency: 'USD'
      });
    });

    it('should handle free directories', async () => {
      const selectedDirectories = [
        { id: 'dir1', submission_fee: { usd: 0 } },
        { id: 'dir2', submission_fee: { usd: 5.00 } }
      ];

      const cost = await federatedService.calculateSubmissionCost(selectedDirectories);

      expect(cost.total_usd).to.equal(5.00);
      expect(cost.breakdown).to.have.length(2);
    });

    it('should throw error for empty directory list', async () => {
      try {
        await federatedService.calculateSubmissionCost([]);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('At least one directory must be selected');
      }
    });
  });

  describe('createFederatedSubmission', () => {
    it('should create federated submission with payment', async () => {
      const submissionData = {
        url: 'https://example.com',
        title: 'Test Product',
        description: 'A test product',
        user_id: 'user123'
      };

      const selectedDirectories = [
        { id: 'dir1', instance_url: 'https://instance1.com', submission_fee: { usd: 5.00 } }
      ];

      const mockSubmission = {
        id: 'sub123',
        ...submissionData,
        status: 'pending_payment'
      };

      // Mock database insertion
      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: [mockSubmission], error: null });
        return Promise.resolve({ data: [mockSubmission], error: null });
      });

      // Mock payment session creation
      paymentServiceStub.createPaymentSession.resolves({
        session_id: 'pay123',
        amount_usd: 5.00,
        expires_at: new Date(Date.now() + 86400000).toISOString()
      });

      const result = await federatedService.createFederatedSubmission(
        submissionData,
        selectedDirectories
      );

      expect(result.success).to.be.true;
      expect(result.submission).to.have.property('id', 'sub123');
      expect(result.payment_session).to.have.property('session_id', 'pay123');
      expect(paymentServiceStub.createPaymentSession.calledOnce).to.be.true;
    });

    it('should handle free submissions without payment', async () => {
      const submissionData = {
        url: 'https://example.com',
        title: 'Test Product',
        description: 'A test product',
        user_id: 'user123'
      };

      const selectedDirectories = [
        { id: 'dir1', instance_url: 'https://instance1.com', submission_fee: { usd: 0 } }
      ];

      const mockSubmission = {
        id: 'sub123',
        ...submissionData,
        status: 'pending_submission'
      };

      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: [mockSubmission], error: null });
        return Promise.resolve({ data: [mockSubmission], error: null });
      });

      const result = await federatedService.createFederatedSubmission(
        submissionData,
        selectedDirectories
      );

      expect(result.success).to.be.true;
      expect(result.submission.status).to.equal('pending_submission');
      expect(result.payment_session).to.be.null;
      expect(paymentServiceStub.createPaymentSession.called).to.be.false;
    });

    it('should validate required submission fields', async () => {
      const invalidData = {
        title: 'Test Product'
        // Missing url and user_id
      };

      try {
        await federatedService.createFederatedSubmission(invalidData, []);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('URL is required');
      }
    });
  });

  describe('submitToFederatedDirectories', () => {
    it('should submit to multiple federation instances', async () => {
      const submissionId = 'sub123';
      const submissionData = {
        url: 'https://example.com',
        title: 'Test Product',
        description: 'A test product'
      };

      const directories = [
        { id: 'dir1', instance_url: 'https://instance1.com' },
        { id: 'dir2', instance_url: 'https://instance2.com' }
      ];

      // Mock successful submissions
      fetchStub.onFirstCall().resolves({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          submission_id: 'remote123',
          status: 'pending_review'
        })
      });

      fetchStub.onSecondCall().resolves({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          submission_id: 'remote456',
          status: 'approved'
        })
      });

      // Mock database updates
      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: [], error: null });
        return Promise.resolve({ data: [], error: null });
      });

      const results = await federatedService.submitToFederatedDirectories(
        submissionId,
        submissionData,
        directories
      );

      expect(results).to.have.length(2);
      expect(results[0].success).to.be.true;
      expect(results[0].remote_submission_id).to.equal('remote123');
      expect(results[1].success).to.be.true;
      expect(results[1].remote_submission_id).to.equal('remote456');
      expect(fetchStub.calledTwice).to.be.true;
    });

    it('should handle partial failures gracefully', async () => {
      const submissionId = 'sub123';
      const submissionData = {
        url: 'https://example.com',
        title: 'Test Product',
        description: 'A test product'
      };

      const directories = [
        { id: 'dir1', instance_url: 'https://instance1.com' },
        { id: 'dir2', instance_url: 'https://instance2.com' }
      ];

      // First submission succeeds, second fails
      fetchStub.onFirstCall().resolves({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          submission_id: 'remote123'
        })
      });

      fetchStub.onSecondCall().resolves({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: [], error: null });
        return Promise.resolve({ data: [], error: null });
      });

      const results = await federatedService.submitToFederatedDirectories(
        submissionId,
        submissionData,
        directories
      );

      expect(results).to.have.length(2);
      expect(results[0].success).to.be.true;
      expect(results[1].success).to.be.false;
      expect(results[1].error).to.include('HTTP 500');
    });
  });

  describe('getFederatedSubmissionStatus', () => {
    it('should return submission status with federation results', async () => {
      const submissionId = 'sub123';
      const mockSubmission = {
        id: submissionId,
        url: 'https://example.com',
        title: 'Test Product',
        status: 'submitted'
      };

      const mockFederationResults = [
        {
          directory_id: 'dir1',
          instance_url: 'https://instance1.com',
          status: 'approved',
          remote_submission_id: 'remote123'
        },
        {
          directory_id: 'dir2',
          instance_url: 'https://instance2.com',
          status: 'pending_review',
          remote_submission_id: 'remote456'
        }
      ];

      // Mock submission query
      supabaseStub.then.onFirstCall().callsFake((resolve) => {
        resolve({ data: [mockSubmission], error: null });
        return Promise.resolve({ data: [mockSubmission], error: null });
      });

      // Mock federation results query
      supabaseStub.then.onSecondCall().callsFake((resolve) => {
        resolve({ data: mockFederationResults, error: null });
        return Promise.resolve({ data: mockFederationResults, error: null });
      });

      const status = await federatedService.getFederatedSubmissionStatus(submissionId);

      expect(status.submission).to.deep.equal(mockSubmission);
      expect(status.federation_results).to.deep.equal(mockFederationResults);
      expect(status.summary.total_directories).to.equal(2);
      expect(status.summary.approved_count).to.equal(1);
      expect(status.summary.pending_count).to.equal(1);
    });

    it('should return null for non-existent submission', async () => {
      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: [], error: null });
        return Promise.resolve({ data: [], error: null });
      });

      const status = await federatedService.getFederatedSubmissionStatus('nonexistent');

      expect(status).to.be.null;
    });
  });

  describe('retryFailedSubmissions', () => {
    it('should retry failed federation submissions', async () => {
      const submissionId = 'sub123';
      const mockFailedResults = [
        {
          id: 'result1',
          directory_id: 'dir1',
          instance_url: 'https://instance1.com',
          status: 'failed',
          error_message: 'Network timeout'
        }
      ];

      // Mock failed results query
      supabaseStub.then.onFirstCall().callsFake((resolve) => {
        resolve({ data: mockFailedResults, error: null });
        return Promise.resolve({ data: mockFailedResults, error: null });
      });

      // Mock submission data query
      supabaseStub.then.onSecondCall().callsFake((resolve) => {
        resolve({ 
          data: [{
            url: 'https://example.com',
            title: 'Test Product',
            description: 'A test product'
          }], 
          error: null 
        });
        return Promise.resolve({ 
          data: [{
            url: 'https://example.com',
            title: 'Test Product',
            description: 'A test product'
          }], 
          error: null 
        });
      });

      // Mock successful retry
      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          submission_id: 'remote789'
        })
      });

      // Mock status update
      supabaseStub.then.onThirdCall().callsFake((resolve) => {
        resolve({ data: [], error: null });
        return Promise.resolve({ data: [], error: null });
      });

      const results = await federatedService.retryFailedSubmissions(submissionId);

      expect(results).to.have.length(1);
      expect(results[0].success).to.be.true;
      expect(results[0].remote_submission_id).to.equal('remote789');
    });

    it('should handle no failed submissions', async () => {
      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: [], error: null });
        return Promise.resolve({ data: [], error: null });
      });

      const results = await federatedService.retryFailedSubmissions('sub123');

      expect(results).to.have.length(0);
    });
  });

  describe('validateSubmissionData', () => {
    it('should validate required fields', () => {
      const validData = {
        url: 'https://example.com',
        title: 'Test Product',
        description: 'A test product',
        user_id: 'user123'
      };

      expect(() => federatedService.validateSubmissionData(validData)).to.not.throw();
    });

    it('should throw error for missing URL', () => {
      const invalidData = {
        title: 'Test Product',
        user_id: 'user123'
      };

      expect(() => federatedService.validateSubmissionData(invalidData))
        .to.throw('URL is required');
    });

    it('should throw error for invalid URL format', () => {
      const invalidData = {
        url: 'not-a-url',
        title: 'Test Product',
        user_id: 'user123'
      };

      expect(() => federatedService.validateSubmissionData(invalidData))
        .to.throw('Invalid URL format');
    });

    it('should throw error for missing user_id', () => {
      const invalidData = {
        url: 'https://example.com',
        title: 'Test Product'
      };

      expect(() => federatedService.validateSubmissionData(invalidData))
        .to.throw('User ID is required');
    });
  });
});