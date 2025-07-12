import { expect } from 'chai';
import nock from 'nock';
import { MetadataFetcher } from '../../src/lib/services/metadata-fetcher.js';

describe('Preview Service', () => {
  let metadataFetcher;

  beforeEach(() => {
    metadataFetcher = new MetadataFetcher();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('URL Validation', () => {
    it('should reject invalid URLs', async () => {
      try {
        await metadataFetcher.fetchMetadata('invalid-url');
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid URL');
      }
    });

    it('should reject non-HTTP/HTTPS URLs', async () => {
      try {
        await metadataFetcher.fetchMetadata('ftp://example.com');
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Only HTTP and HTTPS URLs are supported');
      }
    });

    it('should accept valid HTTP URLs', async () => {
      nock('http://example.com')
        .get('/')
        .reply(200, '<html><head><title>Test</title></head></html>');

      const result = await metadataFetcher.fetchMetadata('http://example.com');
      expect(result).to.have.property('title', 'Test');
    });

    it('should accept valid HTTPS URLs', async () => {
      nock('https://example.com')
        .get('/')
        .reply(200, '<html><head><title>Test HTTPS</title></head></html>');

      const result = await metadataFetcher.fetchMetadata('https://example.com');
      expect(result).to.have.property('title', 'Test HTTPS');
    });
  });

  describe('Metadata Extraction', () => {
    it('should extract basic metadata', async () => {
      nock('https://example.com')
        .get('/')
        .reply(200, `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Example Product</title>
              <meta name="description" content="This is an example product description">
              <meta name="keywords" content="example, product, test">
            </head>
            <body>
              <h1>Example Product</h1>
              <p>This is the main content of the example product page.</p>
            </body>
          </html>
        `);

      const result = await metadataFetcher.fetchMetadata('https://example.com');
      
      expect(result).to.have.property('url', 'https://example.com/');
      expect(result).to.have.property('title', 'Example Product');
      expect(result).to.have.property('description', 'This is an example product description');
      expect(result).to.have.property('keywords');
      expect(result.keywords).to.include('example');
      expect(result.keywords).to.include('product');
      expect(result.keywords).to.include('test');
    });

    it('should extract Open Graph metadata', async () => {
      nock('https://og-example.com')
        .get('/')
        .reply(200, `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Regular Title</title>
              <meta name="description" content="Regular description">
              <meta property="og:title" content="OG Title">
              <meta property="og:description" content="OG Description">
              <meta property="og:image" content="https://og-example.com/og-image.jpg">
              <meta property="og:url" content="https://og-example.com">
              <meta property="og:type" content="website">
            </head>
            <body>
              <h1>Content</h1>
            </body>
          </html>
        `);

      const result = await metadataFetcher.fetchMetadata('https://og-example.com');
      
      expect(result).to.have.property('openGraph');
      expect(result.openGraph).to.have.property('title', 'OG Title');
      expect(result.openGraph).to.have.property('description', 'OG Description');
      expect(result.openGraph).to.have.property('image', 'https://og-example.com/og-image.jpg');
      expect(result.openGraph).to.have.property('url', 'https://og-example.com');
      expect(result.openGraph).to.have.property('type', 'website');
    });

    it('should extract Twitter Card metadata', async () => {
      nock('https://twitter-example.com')
        .get('/')
        .reply(200, `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Regular Title</title>
              <meta name="twitter:card" content="summary_large_image">
              <meta name="twitter:title" content="Twitter Title">
              <meta name="twitter:description" content="Twitter Description">
              <meta name="twitter:image" content="https://twitter-example.com/twitter-image.jpg">
            </head>
            <body>
              <h1>Content</h1>
            </body>
          </html>
        `);

      const result = await metadataFetcher.fetchMetadata('https://twitter-example.com');
      
      expect(result).to.have.property('twitter');
      expect(result.twitter).to.have.property('card', 'summary_large_image');
      expect(result.twitter).to.have.property('title', 'Twitter Title');
      expect(result.twitter).to.have.property('description', 'Twitter Description');
      expect(result.twitter).to.have.property('image', 'https://twitter-example.com/twitter-image.jpg');
    });

    it('should handle URLs with query parameters', async () => {
      nock('https://example.com')
        .get('/product')
        .query({ id: '123', ref: 'test' })
        .reply(200, `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Product 123</title>
              <meta name="description" content="Product with ID 123">
            </head>
            <body>
              <h1>Product 123</h1>
            </body>
          </html>
        `);

      const result = await metadataFetcher.fetchMetadata('https://example.com/product?id=123&ref=test');
      
      expect(result).to.have.property('url', 'https://example.com/product?id=123&ref=test');
      expect(result).to.have.property('title', 'Product 123');
      expect(result).to.have.property('description', 'Product with ID 123');
    });

    it('should handle URLs with special characters', async () => {
      nock('https://example.com')
        .get('/product')
        .query({ name: 'Test Product', category: 'Software' })
        .reply(200, `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Test Product</title>
              <meta name="description" content="Software category product">
            </head>
            <body>
              <h1>Test Product</h1>
            </body>
          </html>
        `);

      const result = await metadataFetcher.fetchMetadata('https://example.com/product?name=Test Product&category=Software');
      
      expect(result).to.have.property('title', 'Test Product');
      expect(result).to.have.property('description', 'Software category product');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 responses', async () => {
      nock('https://example.com')
        .get('/nonexistent')
        .reply(404, 'Not Found');

      try {
        await metadataFetcher.fetchMetadata('https://example.com/nonexistent');
        expect.fail('Should have thrown error for 404');
      } catch (error) {
        expect(error.message).to.include('HTTP 404');
      }
    });

    it('should handle network timeouts', async () => {
      nock('https://slow-example.com')
        .get('/')
        .delay(10000) // 10 second delay
        .reply(200, '<html><head><title>Slow Site</title></head></html>');

      try {
        await metadataFetcher.fetchMetadata('https://slow-example.com');
        expect.fail('Should have thrown timeout error');
      } catch (error) {
        expect(error.message).to.include('timeout');
      }
    });

    it('should handle malformed HTML gracefully', async () => {
      nock('https://malformed.com')
        .get('/')
        .reply(200, '<html><head><title>Malformed</title><body><h1>Missing closing tags');

      const result = await metadataFetcher.fetchMetadata('https://malformed.com');
      
      expect(result).to.have.property('title', 'Malformed');
      // Should still extract what it can despite malformed HTML
    });

    it('should handle DNS resolution failures', async () => {
      nock('https://nonexistent-domain-12345.com')
        .get('/')
        .replyWithError({ code: 'ENOTFOUND' });

      try {
        await metadataFetcher.fetchMetadata('https://nonexistent-domain-12345.com');
        expect.fail('Should have thrown DNS error');
      } catch (error) {
        expect(error.message).to.include('ENOTFOUND');
      }
    });

    it('should handle connection refused errors', async () => {
      nock('https://refused.com')
        .get('/')
        .replyWithError({ code: 'ECONNREFUSED' });

      try {
        await metadataFetcher.fetchMetadata('https://refused.com');
        expect.fail('Should have thrown connection error');
      } catch (error) {
        expect(error.message).to.include('ECONNREFUSED');
      }
    });

    it('should handle SSL certificate errors', async () => {
      nock('https://ssl-error.com')
        .get('/')
        .replyWithError({ code: 'CERT_UNTRUSTED' });

      try {
        await metadataFetcher.fetchMetadata('https://ssl-error.com');
        expect.fail('Should have thrown SSL error');
      } catch (error) {
        expect(error.message).to.include('CERT_UNTRUSTED');
      }
    });
  });

  describe('Response Structure', () => {
    it('should return consistent response structure', async () => {
      nock('https://structure-test.com')
        .get('/')
        .reply(200, `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Structure Test</title>
              <meta name="description" content="Testing response structure">
            </head>
            <body>
              <h1>Structure Test</h1>
            </body>
          </html>
        `);

      const result = await metadataFetcher.fetchMetadata('https://structure-test.com');
      
      // Verify required properties
      expect(result).to.have.property('url');
      expect(result).to.have.property('title');
      expect(result).to.have.property('description');
      
      // Verify optional properties exist (even if empty)
      expect(result).to.have.property('keywords');
      expect(result).to.have.property('openGraph');
      expect(result).to.have.property('twitter');
      expect(result).to.have.property('jsonLd');
      
      // Verify types
      expect(result.url).to.be.a('string');
      expect(result.title).to.be.a('string');
      expect(result.description).to.be.a('string');
      expect(result.keywords).to.be.an('array');
      expect(result.openGraph).to.be.an('object');
      expect(result.twitter).to.be.an('object');
      expect(result.jsonLd).to.be.an('array');
    });
  });

  describe('Performance', () => {
    it('should handle concurrent requests efficiently', async () => {
      // Mock multiple URLs
      for (let i = 1; i <= 3; i++) {
        nock(`https://concurrent-${i}.com`)
          .get('/')
          .reply(200, `
            <!DOCTYPE html>
            <html>
              <head>
                <title>Concurrent Test ${i}</title>
                <meta name="description" content="Testing concurrent request ${i}">
              </head>
              <body>
                <h1>Concurrent Test ${i}</h1>
              </body>
            </html>
          `);
      }

      // Make concurrent requests
      const requests = [
        metadataFetcher.fetchMetadata('https://concurrent-1.com'),
        metadataFetcher.fetchMetadata('https://concurrent-2.com'),
        metadataFetcher.fetchMetadata('https://concurrent-3.com')
      ];

      const results = await Promise.all(requests);

      results.forEach((result, index) => {
        expect(result.title).to.equal(`Concurrent Test ${index + 1}`);
        expect(result.description).to.equal(`Testing concurrent request ${index + 1}`);
      });
    });

    it('should complete requests within reasonable time', async () => {
      nock('https://performance-test.com')
        .get('/')
        .reply(200, `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Performance Test</title>
              <meta name="description" content="Testing performance">
            </head>
            <body>
              <h1>Performance Test</h1>
            </body>
          </html>
        `);

      const startTime = Date.now();
      const result = await metadataFetcher.fetchMetadata('https://performance-test.com');
      const endTime = Date.now();
      
      expect(result).to.have.property('title', 'Performance Test');
      expect(endTime - startTime).to.be.lessThan(5000); // Should complete within 5 seconds
    });
  });
});