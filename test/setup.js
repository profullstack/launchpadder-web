/**
 * Test setup file for Mocha
 * This file is loaded before all tests run
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables for testing
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

config({ path: join(rootDir, '.env.test') });

// Global test configuration
global.TEST_TIMEOUT = 5000;
global.TEST_BASE_URL = 'http://localhost:3000';

// Mock fetch if not available in test environment
if (!globalThis.fetch) {
  const { default: fetch, Request, Response, Headers } = await import('node-fetch');
  globalThis.fetch = fetch;
  globalThis.Request = Request;
  globalThis.Response = Response;
  globalThis.Headers = Headers;
}

// Setup test database connection
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-key';

// Suppress console.log during tests unless explicitly needed
const originalConsoleLog = console.log;
console.log = (...args) => {
  if (process.env.VERBOSE_TESTS === 'true') {
    originalConsoleLog(...args);
  }
};

// Global test helpers
global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

global.createMockSubmission = () => ({
  url: 'https://example.com',
  original_meta: {
    title: 'Example Product',
    description: 'An example product description',
    image: 'https://example.com/image.jpg'
  },
  rewritten_meta: {
    title: 'Revolutionary Example Product',
    description: 'A groundbreaking product that changes everything',
    image: 'https://example.com/image.jpg'
  },
  images: {
    logo: 'https://storage.example.com/logo.jpg',
    banner: 'https://storage.example.com/banner.jpg'
  },
  submitted_by: 'test-user-id'
});

// Cleanup function for tests
global.cleanup = async () => {
  // Add any cleanup logic here
  console.log('Test cleanup completed');
};

// Handle uncaught exceptions in tests
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in tests:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in tests:', reason);
  process.exit(1);
});