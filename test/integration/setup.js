/**
 * Integration Test Setup
 * Comprehensive setup for end-to-end integration testing
 * Using Mocha + Chai + Supertest for API testing
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';
import request from 'supertest';

// Load test environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');

config({ path: join(rootDir, '.env.test') });

// Test database configuration
const TEST_DB_CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || 'http://localhost:54321',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || 'test-anon-key',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || 'test-service-key',
  testDatabaseUrl: process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres'
};

// Global test configuration
global.TEST_CONFIG = {
  timeout: 10000,
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
  dbConfig: TEST_DB_CONFIG,
  verbose: process.env.VERBOSE_TESTS === 'true'
};

// Initialize test database client
global.testSupabase = createClient(
  TEST_DB_CONFIG.supabaseUrl,
  TEST_DB_CONFIG.supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Test utilities
global.testUtils = {
  // Generate unique test identifiers
  generateTestId: () => `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  
  // Wait for async operations
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Retry mechanism for flaky operations
  retry: async (fn, maxAttempts = 3, delay = 1000) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        await global.testUtils.sleep(delay);
      }
    }
  },
  
  // Clean test data
  cleanupTestData: async (patterns = []) => {
    const defaultPatterns = ['test_%', 'integration_%', 'e2e_%'];
    const allPatterns = [...defaultPatterns, ...patterns];
    
    for (const pattern of allPatterns) {
      try {
        // Clean submissions
        await global.testSupabase
          .from('submissions')
          .delete()
          .like('url', `%${pattern}%`);
        
        // Clean profiles
        await global.testSupabase
          .from('profiles')
          .delete()
          .like('username', pattern);
        
        // Clean federation instances
        await global.testSupabase
          .from('federation_instances')
          .delete()
          .like('name', pattern);
      } catch (error) {
        if (global.TEST_CONFIG.verbose) {
          console.warn(`Cleanup warning for pattern ${pattern}:`, error.message);
        }
      }
    }
  }
};

// Test data factories
global.testFactories = {
  // Create test user
  createTestUser: async (overrides = {}) => {
    const testId = global.testUtils.generateTestId();
    const userData = {
      email: `${testId}@test.com`,
      password: 'TestPassword123!',
      username: `user_${testId}`,
      full_name: `Test User ${testId}`,
      ...overrides
    };
    
    // Create auth user
    const { data: authUser, error: authError } = await global.testSupabase.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      email_confirm: true
    });
    
    if (authError) throw new Error(`Failed to create auth user: ${authError.message}`);
    
    // Create profile
    const { data: profile, error: profileError } = await global.testSupabase
      .from('profiles')
      .insert({
        id: authUser.user.id,
        username: userData.username,
        full_name: userData.full_name,
        bio: userData.bio || null,
        website: userData.website || null
      })
      .select()
      .single();
    
    if (profileError) throw new Error(`Failed to create profile: ${profileError.message}`);
    
    return {
      auth: authUser.user,
      profile,
      credentials: { email: userData.email, password: userData.password }
    };
  },
  
  // Create test submission
  createTestSubmission: async (userId, overrides = {}) => {
    const testId = global.testUtils.generateTestId();
    const submissionData = {
      url: `https://example-${testId}.com`,
      original_meta: {
        title: `Test Product ${testId}`,
        description: `A test product for integration testing ${testId}`,
        image: `https://example-${testId}.com/image.jpg`
      },
      rewritten_meta: {
        title: `Revolutionary Test Product ${testId}`,
        description: `An amazing test product that will change everything ${testId}`,
        image: `https://example-${testId}.com/image.jpg`
      },
      images: {
        logo: `https://storage.example.com/logo-${testId}.jpg`,
        banner: `https://storage.example.com/banner-${testId}.jpg`
      },
      submitted_by: userId,
      status: 'pending',
      tags: ['test', 'integration'],
      ...overrides
    };
    
    const { data, error } = await global.testSupabase
      .from('submissions')
      .insert(submissionData)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create test submission: ${error.message}`);
    return data;
  },
  
  // Create test federation instance
  createTestFederationInstance: async (overrides = {}) => {
    const testId = global.testUtils.generateTestId();
    const instanceData = {
      name: `test_instance_${testId}`,
      url: `https://test-${testId}.federation.com`,
      description: `Test federation instance ${testId}`,
      admin_email: `admin-${testId}@test.com`,
      public_key: `test_public_key_${testId}`,
      status: 'active',
      version: '1.0.0',
      ...overrides
    };
    
    const { data, error } = await global.testSupabase
      .from('federation_instances')
      .insert(instanceData)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create test federation instance: ${error.message}`);
    return data;
  },
  
  // Create test API key
  createTestApiKey: async (userId, overrides = {}) => {
    const testId = global.testUtils.generateTestId();
    const keyData = {
      user_id: userId,
      name: `test_key_${testId}`,
      key_hash: `test_hash_${testId}`,
      permissions: ['read', 'write'],
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      ...overrides
    };
    
    const { data, error } = await global.testSupabase
      .from('api_keys')
      .insert(keyData)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create test API key: ${error.message}`);
    return data;
  }
};

// Test authentication helpers
global.testAuth = {
  // Sign in user and get session
  signInUser: async (email, password) => {
    const { data, error } = await global.testSupabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw new Error(`Failed to sign in user: ${error.message}`);
    return data;
  },
  
  // Get auth headers for API requests
  getAuthHeaders: (session) => ({
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  }),
  
  // Create admin session
  createAdminSession: async () => {
    // Create admin user if not exists
    const adminEmail = 'admin@test.com';
    const adminPassword = 'AdminPassword123!';
    
    try {
      const { data: existingUser } = await global.testSupabase.auth.admin.getUserByEmail(adminEmail);
      if (!existingUser.user) {
        await global.testSupabase.auth.admin.createUser({
          email: adminEmail,
          password: adminPassword,
          email_confirm: true,
          user_metadata: { role: 'admin' }
        });
      }
    } catch (error) {
      // User might not exist, create it
      await global.testSupabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { role: 'admin' }
      });
    }
    
    return await global.testAuth.signInUser(adminEmail, adminPassword);
  }
};

// HTTP client for API testing
global.testClient = {
  // Make authenticated request
  request: (app) => request(app),
  
  // Common request helpers
  get: (app, path, headers = {}) => request(app).get(path).set(headers),
  post: (app, path, data = {}, headers = {}) => request(app).post(path).send(data).set(headers),
  put: (app, path, data = {}, headers = {}) => request(app).put(path).send(data).set(headers),
  patch: (app, path, data = {}, headers = {}) => request(app).patch(path).send(data).set(headers),
  delete: (app, path, headers = {}) => request(app).delete(path).set(headers)
};

// Test environment validation
const validateTestEnvironment = () => {
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY'
  ];
  
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.warn(`Warning: Missing test environment variables: ${missing.join(', ')}`);
    console.warn('Some integration tests may fail. Please check your .env.test file.');
  }
};

// Global setup
before(async function() {
  this.timeout(30000); // Allow time for setup
  
  if (global.TEST_CONFIG.verbose) {
    console.log('Setting up integration test environment...');
  }
  
  validateTestEnvironment();
  
  // Clean up any existing test data
  await global.testUtils.cleanupTestData();
  
  if (global.TEST_CONFIG.verbose) {
    console.log('Integration test environment ready');
  }
});

// Global cleanup
after(async function() {
  this.timeout(30000); // Allow time for cleanup
  
  if (global.TEST_CONFIG.verbose) {
    console.log('Cleaning up integration test environment...');
  }
  
  // Clean up test data
  await global.testUtils.cleanupTestData();
  
  if (global.TEST_CONFIG.verbose) {
    console.log('Integration test cleanup completed');
  }
});

// Handle uncaught exceptions in integration tests
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in integration tests:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in integration tests:', reason);
  process.exit(1);
});

export {
  TEST_DB_CONFIG,
  testSupabase,
  testUtils,
  testFactories,
  testAuth,
  testClient
};