import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import { FederationDiscoveryService } from '../../src/lib/services/federation-discovery-service.js';

describe('FederationDiscoveryService', () => {
  let discoveryService;
  let fetchStub;
  let supabaseStub;

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
      // Add a default promise resolution
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

    discoveryService = new FederationDiscoveryService(supabaseStub);
    
    // Stub fetch for external API calls
    fetchStub = sinon.stub(global, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
    sinon.restore();
  });

  describe('constructor', () => {
    it('should initialize with Supabase client', () => {
      expect(discoveryService.supabase).to.equal(supabaseStub);
    });

    it('should throw error if no Supabase client provided', () => {
      expect(() => new FederationDiscoveryService()).to.throw('Supabase client is required');
    });
  });

  describe('discoverDirectories', () => {
    it('should discover directories from known federation instances', async () => {
      // Mock federation instances
      const mockInstances = [
        {
          id: '1',
          name: 'ProductHunt Clone',
          base_url: 'https://ph-clone.example.com',
          status: 'active',
          last_seen: new Date().toISOString()
        },
        {
          id: '2', 
          name: 'Indie Hackers Directory',
          base_url: 'https://ih-directory.example.com',
          status: 'active',
          last_seen: new Date().toISOString()
        }
      ];

      // Mock the Supabase query chain to return instances
      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: mockInstances, error: null });
        return Promise.resolve({ data: mockInstances, error: null });
      });

      // Mock API responses from federation instances
      fetchStub.onFirstCall().resolves({
        ok: true,
        json: () => Promise.resolve({
          directories: [
            {
              id: 'ph-main',
              name: 'Product Hunt Main',
              description: 'Main product directory',
              category: 'products',
              submission_count: 1500,
              last_updated: new Date().toISOString()
            }
          ]
        })
      });

      fetchStub.onSecondCall().resolves({
        ok: true,
        json: () => Promise.resolve({
          directories: [
            {
              id: 'ih-showcase',
              name: 'Indie Hackers Showcase',
              description: 'Showcase of indie projects',
              category: 'startups',
              submission_count: 800,
              last_updated: new Date().toISOString()
            }
          ]
        })
      });

      const directories = await discoveryService.discoverDirectories();

      expect(directories).to.be.an('array');
      expect(directories).to.have.length(2);
      expect(directories[0]).to.have.property('id', 'ph-main');
      expect(directories[0]).to.have.property('instance_url', 'https://ph-clone.example.com');
      expect(directories[1]).to.have.property('id', 'ih-showcase');
      expect(directories[1]).to.have.property('instance_url', 'https://ih-directory.example.com');
    });

    it('should handle federation instances that are offline', async () => {
      const mockInstances = [
        {
          id: '1',
          name: 'Active Instance',
          base_url: 'https://active.example.com',
          status: 'active',
          last_seen: new Date().toISOString()
        },
        {
          id: '2',
          name: 'Offline Instance', 
          base_url: 'https://offline.example.com',
          status: 'active',
          last_seen: new Date().toISOString()
        }
      ];

      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: mockInstances, error: null });
        return Promise.resolve({ data: mockInstances, error: null });
      });

      // First instance responds successfully
      fetchStub.onFirstCall().resolves({
        ok: true,
        json: () => Promise.resolve({
          directories: [
            {
              id: 'active-dir',
              name: 'Active Directory',
              description: 'Working directory',
              category: 'products',
              submission_count: 100,
              last_updated: new Date().toISOString()
            }
          ]
        })
      });

      // Second instance fails
      fetchStub.onSecondCall().rejects(new Error('Network error'));

      const directories = await discoveryService.discoverDirectories();

      expect(directories).to.have.length(1);
      expect(directories[0]).to.have.property('id', 'active-dir');
    });

    it('should filter directories by category when specified', async () => {
      const mockInstances = [
        {
          id: '1',
          name: 'Test Instance',
          base_url: 'https://test.example.com',
          status: 'active',
          last_seen: new Date().toISOString()
        }
      ];

      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: mockInstances, error: null });
        return Promise.resolve({ data: mockInstances, error: null });
      });

      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve({
          directories: [
            {
              id: 'products-dir',
              name: 'Products Directory',
              description: 'Product listings',
              category: 'products',
              submission_count: 100,
              last_updated: new Date().toISOString()
            },
            {
              id: 'startups-dir',
              name: 'Startups Directory',
              description: 'Startup listings',
              category: 'startups',
              submission_count: 50,
              last_updated: new Date().toISOString()
            }
          ]
        })
      });

      const directories = await discoveryService.discoverDirectories({ category: 'products' });

      expect(directories).to.have.length(1);
      expect(directories[0]).to.have.property('category', 'products');
    });

    it('should limit results when specified', async () => {
      const mockInstances = [
        {
          id: '1',
          name: 'Test Instance',
          base_url: 'https://test.example.com',
          status: 'active',
          last_seen: new Date().toISOString()
        }
      ];

      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: mockInstances, error: null });
        return Promise.resolve({ data: mockInstances, error: null });
      });

      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve({
          directories: Array.from({ length: 10 }, (_, i) => ({
            id: `dir-${i}`,
            name: `Directory ${i}`,
            description: `Test directory ${i}`,
            category: 'products',
            submission_count: 100,
            last_updated: new Date().toISOString()
          }))
        })
      });

      const directories = await discoveryService.discoverDirectories({ limit: 5 });

      expect(directories).to.have.length(5);
    });
  });

  describe('registerInstance', () => {
    it('should register a new federation instance', async () => {
      const instanceData = {
        name: 'New Instance',
        base_url: 'https://new.example.com',
        description: 'A new federation instance',
        admin_email: 'admin@new.example.com'
      };

      const mockResult = { 
        id: 'new-instance-id',
        ...instanceData,
        status: 'pending',
        created_at: new Date().toISOString()
      };

      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: [mockResult], error: null });
        return Promise.resolve({ data: [mockResult], error: null });
      });

      const result = await discoveryService.registerInstance(instanceData);

      expect(result.success).to.be.true;
      expect(result.instance).to.have.property('id', 'new-instance-id');
      expect(result.instance).to.have.property('status', 'pending');
    });

    it('should validate required fields', async () => {
      try {
        await discoveryService.registerInstance({
          name: 'Test Instance'
          // Missing base_url
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('base_url is required');
      }
    });

    it('should validate URL format', async () => {
      try {
        await discoveryService.registerInstance({
          name: 'Test Instance',
          base_url: 'invalid-url',
          admin_email: 'admin@test.com'
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid URL format');
      }
    });

    it('should validate email format', async () => {
      try {
        await discoveryService.registerInstance({
          name: 'Test Instance',
          base_url: 'https://test.example.com',
          admin_email: 'invalid-email'
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid email format');
      }
    });
  });

  describe('verifyInstance', () => {
    it('should verify instance health and API compatibility', async () => {
      const instanceUrl = 'https://test.example.com';

      // Mock successful health check
      fetchStub.onFirstCall().resolves({
        ok: true,
        json: () => Promise.resolve({
          status: 'healthy',
          version: '1.0.0',
          api_version: '1.0',
          instance_name: 'Test Instance'
        })
      });

      // Mock successful API info
      fetchStub.onSecondCall().resolves({
        ok: true,
        json: () => Promise.resolve({
          federation_enabled: true,
          supported_features: ['submissions', 'directories'],
          api_endpoints: ['/api/federation/directories', '/api/federation/submit']
        })
      });

      const result = await discoveryService.verifyInstance(instanceUrl);

      expect(result.healthy).to.be.true;
      expect(result.compatible).to.be.true;
      expect(result.version).to.equal('1.0.0');
      expect(result.federation_enabled).to.be.true;
    });

    it('should handle unhealthy instances', async () => {
      const instanceUrl = 'https://unhealthy.example.com';

      fetchStub.rejects(new Error('Connection refused'));

      const result = await discoveryService.verifyInstance(instanceUrl);

      expect(result.healthy).to.be.false;
      expect(result.compatible).to.be.false;
      expect(result.error).to.include('Connection refused');
    });

    it('should detect incompatible API versions', async () => {
      const instanceUrl = 'https://old.example.com';

      fetchStub.onFirstCall().resolves({
        ok: true,
        json: () => Promise.resolve({
          status: 'healthy',
          version: '0.5.0',
          api_version: '0.5',
          instance_name: 'Old Instance'
        })
      });

      fetchStub.onSecondCall().resolves({
        ok: true,
        json: () => Promise.resolve({
          federation_enabled: false,
          supported_features: [],
          api_endpoints: []
        })
      });

      const result = await discoveryService.verifyInstance(instanceUrl);

      expect(result.healthy).to.be.true;
      expect(result.compatible).to.be.false;
      expect(result.federation_enabled).to.be.false;
    });
  });

  describe('updateInstanceStatus', () => {
    it('should update instance status and last seen timestamp', async () => {
      const instanceId = 'test-instance-id';
      const status = 'active';

      const mockResult = { 
        id: instanceId,
        status,
        last_seen: new Date().toISOString()
      };

      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: [mockResult], error: null });
        return Promise.resolve({ data: [mockResult], error: null });
      });

      const result = await discoveryService.updateInstanceStatus(instanceId, status);

      expect(result.success).to.be.true;
      expect(result.instance).to.have.property('id', instanceId);
      expect(result.instance).to.have.property('status', status);
    });

    it('should handle database errors', async () => {
      const instanceId = 'test-instance-id';
      const status = 'inactive';

      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: null, error: { message: 'Database error' } });
        return Promise.resolve({ data: null, error: { message: 'Database error' } });
      });

      try {
        await discoveryService.updateInstanceStatus(instanceId, status);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Database error');
      }
    });
  });

  describe('getKnownInstances', () => {
    it('should return list of known federation instances', async () => {
      const mockInstances = [
        {
          id: '1',
          name: 'Instance 1',
          base_url: 'https://instance1.example.com',
          status: 'active',
          last_seen: new Date().toISOString()
        },
        {
          id: '2',
          name: 'Instance 2',
          base_url: 'https://instance2.example.com',
          status: 'inactive',
          last_seen: new Date(Date.now() - 86400000).toISOString() // 1 day ago
        }
      ];

      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: mockInstances, error: null });
        return Promise.resolve({ data: mockInstances, error: null });
      });

      const instances = await discoveryService.getKnownInstances();

      expect(instances).to.deep.equal(mockInstances);
    });

    it('should filter by status when specified', async () => {
      const mockInstances = [
        {
          id: '1',
          name: 'Active Instance',
          base_url: 'https://active.example.com',
          status: 'active',
          last_seen: new Date().toISOString()
        }
      ];

      supabaseStub.then.callsFake((resolve) => {
        resolve({ data: mockInstances, error: null });
        return Promise.resolve({ data: mockInstances, error: null });
      });

      const instances = await discoveryService.getKnownInstances({ status: 'active' });

      expect(instances).to.have.length(1);
      expect(instances[0]).to.have.property('status', 'active');
    });
  });

  describe('pingInstances', () => {
    it('should ping all known instances and update their status', async () => {
      const mockInstances = [
        {
          id: '1',
          name: 'Instance 1',
          base_url: 'https://instance1.example.com',
          status: 'active'
        },
        {
          id: '2',
          name: 'Instance 2',
          base_url: 'https://instance2.example.com',
          status: 'active'
        }
      ];

      // Mock getKnownInstances call
      supabaseStub.then.onFirstCall().callsFake((resolve) => {
        resolve({ data: mockInstances, error: null });
        return Promise.resolve({ data: mockInstances, error: null });
      });

      // Mock updateInstanceStatus calls
      supabaseStub.then.onSecondCall().callsFake((resolve) => {
        resolve({ data: [{}], error: null });
        return Promise.resolve({ data: [{}], error: null });
      });

      supabaseStub.then.onThirdCall().callsFake((resolve) => {
        resolve({ data: [{}], error: null });
        return Promise.resolve({ data: [{}], error: null });
      });

      // First instance responds
      fetchStub.onFirstCall().resolves({
        ok: true,
        json: () => Promise.resolve({ status: 'healthy' })
      });

      // Second instance fails
      fetchStub.onSecondCall().rejects(new Error('Timeout'));

      const results = await discoveryService.pingInstances();

      expect(results).to.have.length(2);
      expect(results[0].healthy).to.be.true;
      expect(results[1].healthy).to.be.false;
    });
  });
});