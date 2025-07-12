/**
 * Test suite for Puppeteer Metadata Fetching Service
 * Using Mocha + Chai for testing
 */

import { expect } from 'chai';
import { PuppeteerMetadataFetcher } from '../../src/lib/services/puppeteer-metadata-fetcher.js';

describe('PuppeteerMetadataFetcher', () => {
  let fetcher;

  beforeEach(() => {
    fetcher = new PuppeteerMetadataFetcher({
      timeout: 10000,
      waitForTimeout: 1000, // Shorter wait for tests
      enableImages: false // Disable images for faster tests
    });
  });

  afterEach(async () => {
    await fetcher.cleanup();
  });

  describe('constructor', () => {
    it('should create an instance with default options', () => {
      const defaultFetcher = new PuppeteerMetadataFetcher();
      
      expect(defaultFetcher.timeout).to.equal(30000);
      expect(defaultFetcher.waitForTimeout).to.equal(3000);
      expect(defaultFetcher.enableImages).to.be.false;
      expect(defaultFetcher.enableJavaScript).to.be.true;
    });

    it('should create an instance with custom options', () => {
      const customFetcher = new PuppeteerMetadataFetcher({
        timeout: 15000,
        waitForTimeout: 2000,
        enableImages: true,
        enableJavaScript: false,
        enableCaching: true,
        cacheMaxAge: 7200
      });
      
      expect(customFetcher.timeout).to.equal(15000);
      expect(customFetcher.waitForTimeout).to.equal(2000);
      expect(customFetcher.enableImages).to.be.true;
      expect(customFetcher.enableJavaScript).to.be.false;
      expect(customFetcher.enableCaching).to.be.true;
      expect(customFetcher.cacheMaxAge).to.equal(7200);
    });
  });

  describe('validateUrl', () => {
    it('should validate correct URLs', () => {
      expect(() => fetcher.validateUrl('https://example.com')).to.not.throw();
      expect(() => fetcher.validateUrl('http://example.com')).to.not.throw();
      expect(() => fetcher.validateUrl('https://subdomain.example.com/path')).to.not.throw();
    });

    it('should reject invalid URLs', () => {
      expect(() => fetcher.validateUrl('')).to.throw('URL is required');
      expect(() => fetcher.validateUrl(null)).to.throw('URL is required');
      expect(() => fetcher.validateUrl('not-a-url')).to.throw('Invalid URL format');
      expect(() => fetcher.validateUrl('ftp://example.com')).to.throw('Only HTTP and HTTPS URLs are supported');
    });

    it('should reject localhost URLs in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      try {
        expect(() => fetcher.validateUrl('http://localhost:3000')).to.throw('Localhost URLs are not allowed');
        expect(() => fetcher.validateUrl('http://127.0.0.1')).to.throw('Localhost URLs are not allowed');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('isPrivateIP', () => {
    it('should identify private IP addresses', () => {
      expect(fetcher.isPrivateIP('192.168.1.1')).to.be.true;
      expect(fetcher.isPrivateIP('10.0.0.1')).to.be.true;
      expect(fetcher.isPrivateIP('172.16.0.1')).to.be.true;
      expect(fetcher.isPrivateIP('169.254.1.1')).to.be.true;
    });

    it('should identify public IP addresses', () => {
      expect(fetcher.isPrivateIP('8.8.8.8')).to.be.false;
      expect(fetcher.isPrivateIP('1.1.1.1')).to.be.false;
      expect(fetcher.isPrivateIP('example.com')).to.be.false;
    });
  });

  describe('getBrowser', () => {
    it('should create and return a browser instance', async () => {
      const browser = await fetcher.getBrowser();
      
      expect(browser).to.exist;
      expect(browser.connected).to.be.true;
      
      await browser.close();
    });

    it('should reuse existing browser instance', async () => {
      const browser1 = await fetcher.getBrowser();
      const browser2 = await fetcher.getBrowser();
      
      expect(browser1).to.equal(browser2);
      
      await browser1.close();
    });
  });

  describe('fetchMetadata', () => {
    // Note: These tests require actual web pages to test against
    // In a real environment, you might want to set up a test server
    // or use mock pages for more reliable testing

    it('should fetch metadata from a simple HTML page', async function() {
      this.timeout(15000); // Increase timeout for browser operations
      
      // Using a reliable test page
      const metadata = await fetcher.fetchMetadata('https://httpbin.org/html');
      
      expect(metadata).to.be.an('object');
      expect(metadata.url).to.include('httpbin.org');
      expect(metadata.title).to.exist;
      expect(metadata.hasJavaScript).to.be.true;
      expect(metadata.loadTime).to.be.a('number');
    });

    it('should handle pages with Open Graph metadata', async function() {
      this.timeout(15000);
      
      // GitHub has good Open Graph metadata
      const metadata = await fetcher.fetchMetadata('https://github.com');
      
      expect(metadata).to.be.an('object');
      expect(metadata.openGraph).to.be.an('object');
      expect(metadata.title).to.exist;
      expect(metadata.description).to.exist;
    });

    it('should extract images with priority ranking', async function() {
      this.timeout(15000);
      
      const metadata = await fetcher.fetchMetadata('https://github.com');
      
      expect(metadata.images).to.be.an('object');
      expect(metadata.images.sources).to.be.an('array');
      
      if (metadata.images.sources.length > 0) {
        expect(metadata.images.primary).to.exist;
        expect(metadata.images.sources[0]).to.have.property('priority');
        expect(metadata.images.sources[0]).to.have.property('type');
      }
    });

    it('should extract favicons', async function() {
      this.timeout(15000);
      
      const metadata = await fetcher.fetchMetadata('https://github.com');
      
      expect(metadata.favicons).to.be.an('array');
      if (metadata.favicons.length > 0) {
        expect(metadata.favicons[0]).to.have.property('url');
        expect(metadata.favicons[0]).to.have.property('type');
      }
    });

    it('should handle JavaScript-rendered content', async function() {
      this.timeout(15000);
      
      // Test with a page that uses JavaScript to render content
      const metadata = await fetcher.fetchMetadata('https://httpbin.org/html');
      
      expect(metadata.hasJavaScript).to.be.true;
      expect(metadata.viewport).to.be.an('object');
      expect(metadata.viewport.width).to.be.a('number');
      expect(metadata.viewport.height).to.be.a('number');
    });

    it('should detect content types', async function() {
      this.timeout(15000);
      
      const metadata = await fetcher.fetchMetadata('https://github.com');
      
      expect(metadata.contentType).to.be.a('string');
      expect(['website', 'article', 'video', 'product']).to.include(metadata.contentType);
    });
  });

  describe('caching', () => {
    it('should implement request caching when enabled', async function() {
      this.timeout(20000);
      
      const cachedFetcher = new PuppeteerMetadataFetcher({
        enableCaching: true,
        cacheMaxAge: 3600,
        timeout: 10000,
        waitForTimeout: 1000
      });

      try {
        // First request
        const start1 = Date.now();
        const metadata1 = await cachedFetcher.fetchMetadata('https://httpbin.org/html');
        const time1 = Date.now() - start1;

        // Second request (should be cached)
        const start2 = Date.now();
        const metadata2 = await cachedFetcher.fetchMetadata('https://httpbin.org/html');
        const time2 = Date.now() - start2;

        expect(metadata1.title).to.equal(metadata2.title);
        expect(time2).to.be.lessThan(time1); // Cached request should be faster
      } finally {
        await cachedFetcher.cleanup();
      }
    });

    it('should handle concurrent requests efficiently', async function() {
      this.timeout(20000);
      
      const promises = Array(3).fill().map(() => 
        fetcher.fetchMetadata('https://httpbin.org/html')
      );

      const results = await Promise.all(promises);
      
      // All results should be identical (same page)
      results.forEach(result => {
        expect(result.url).to.include('httpbin.org');
      });
    });
  });

  describe('error handling', () => {
    it('should handle invalid URLs gracefully', async () => {
      try {
        await fetcher.fetchMetadata('https://this-domain-should-not-exist-12345.com');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to fetch metadata');
      }
    });

    it('should handle timeout errors', async function() {
      this.timeout(8000);
      
      const timeoutFetcher = new PuppeteerMetadataFetcher({
        timeout: 1000, // Very short timeout
        waitForTimeout: 500
      });

      try {
        await timeoutFetcher.fetchMetadata('https://httpbin.org/delay/5');
        expect.fail('Should have thrown timeout error');
      } catch (error) {
        expect(error.message).to.include('Failed to fetch metadata');
      } finally {
        await timeoutFetcher.cleanup();
      }
    });

    it('should handle HTTP error responses', async function() {
      this.timeout(10000);
      
      try {
        await fetcher.fetchMetadata('https://httpbin.org/status/404');
        expect.fail('Should have thrown an error for 404');
      } catch (error) {
        expect(error.message).to.include('Failed to fetch metadata');
      }
    });
  });

  describe('cleanup', () => {
    it('should cleanup browser resources', async () => {
      const browser = await fetcher.getBrowser();
      expect(browser.connected).to.be.true;
      
      await fetcher.cleanup();
      expect(browser.connected).to.be.false;
    });

    it('should clear cache on cleanup', async () => {
      const cachedFetcher = new PuppeteerMetadataFetcher({
        enableCaching: true
      });
      
      // Add something to cache
      cachedFetcher.setCachedMetadata('test-url', { title: 'test' });
      expect(cachedFetcher.cache.size).to.equal(1);
      
      await cachedFetcher.cleanup();
      expect(cachedFetcher.cache.size).to.equal(0);
    });
  });

  describe('cache management', () => {
    it('should store and retrieve cached metadata', () => {
      const testMetadata = { title: 'Test Page', url: 'https://test.com' };
      
      fetcher.setCachedMetadata('https://test.com', testMetadata);
      const cached = fetcher.getCachedMetadata('https://test.com');
      
      expect(cached).to.deep.equal(testMetadata);
    });

    it('should expire cached metadata after TTL', async () => {
      const shortTtlFetcher = new PuppeteerMetadataFetcher({
        cacheMaxAge: 1 // 1 second TTL
      });
      
      const testMetadata = { title: 'Test Page' };
      shortTtlFetcher.setCachedMetadata('https://test.com', testMetadata);
      
      // Should be cached immediately
      expect(shortTtlFetcher.getCachedMetadata('https://test.com')).to.exist;
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be expired
      expect(shortTtlFetcher.getCachedMetadata('https://test.com')).to.be.null;
      
      await shortTtlFetcher.cleanup();
    });

    it('should clear all cached data', () => {
      fetcher.setCachedMetadata('url1', { title: 'Page 1' });
      fetcher.setCachedMetadata('url2', { title: 'Page 2' });
      
      expect(fetcher.cache.size).to.equal(2);
      
      fetcher.clearCache();
      
      expect(fetcher.cache.size).to.equal(0);
    });
  });
});