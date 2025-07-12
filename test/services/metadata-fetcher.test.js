/**
 * Test suite for URL metadata fetching service
 * Using Mocha + Chai for testing
 */

import { expect } from 'chai';
import nock from 'nock';
import { MetadataFetcher } from '../../src/lib/services/metadata-fetcher.js';

describe('MetadataFetcher', () => {
  let fetcher;

  beforeEach(() => {
    fetcher = new MetadataFetcher();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('constructor', () => {
    it('should create an instance with default options', () => {
      expect(fetcher).to.be.an.instanceOf(MetadataFetcher);
      expect(fetcher.timeout).to.equal(10000);
      expect(fetcher.maxRedirects).to.equal(5);
    });

    it('should accept custom options', () => {
      const customFetcher = new MetadataFetcher({
        timeout: 5000,
        maxRedirects: 3,
        userAgent: 'Custom Agent'
      });
      
      expect(customFetcher.timeout).to.equal(5000);
      expect(customFetcher.maxRedirects).to.equal(3);
      expect(customFetcher.userAgent).to.equal('Custom Agent');
    });
  });

  describe('validateUrl', () => {
    it('should accept valid HTTP URLs', () => {
      expect(() => fetcher.validateUrl('http://example.com')).to.not.throw();
      expect(() => fetcher.validateUrl('https://example.com')).to.not.throw();
    });

    it('should accept URLs with paths and query parameters', () => {
      expect(() => fetcher.validateUrl('https://example.com/path?param=value')).to.not.throw();
    });

    it('should reject invalid URLs', () => {
      expect(() => fetcher.validateUrl('not-a-url')).to.throw('Invalid URL format');
      expect(() => fetcher.validateUrl('ftp://example.com')).to.throw('Only HTTP and HTTPS URLs are supported');
      expect(() => fetcher.validateUrl('')).to.throw('URL is required');
      expect(() => fetcher.validateUrl(null)).to.throw('URL is required');
    });

    it('should reject localhost and private IPs in production', () => {
      process.env.NODE_ENV = 'production';
      expect(() => fetcher.validateUrl('http://localhost:3000')).to.throw('Localhost URLs are not allowed');
      expect(() => fetcher.validateUrl('http://127.0.0.1')).to.throw('Localhost URLs are not allowed');
      expect(() => fetcher.validateUrl('http://192.168.1.1')).to.throw('Private IP addresses are not allowed');
      process.env.NODE_ENV = 'test';
    });
  });

  describe('fetchMetadata', () => {
    it('should fetch basic metadata from a valid URL', async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Product</title>
          <meta name="description" content="A test product description">
          <meta property="og:title" content="Test Product - OG">
          <meta property="og:description" content="OG description">
          <meta property="og:image" content="https://example.com/image.jpg">
          <meta property="og:url" content="https://example.com/product">
          <link rel="icon" href="/favicon.ico">
        </head>
        <body>
          <h1>Test Product</h1>
        </body>
        </html>
      `;

      nock('https://example.com')
        .get('/product')
        .reply(200, mockHtml, {
          'content-type': 'text/html; charset=utf-8'
        });

      const metadata = await fetcher.fetchMetadata('https://example.com/product');

      expect(metadata).to.deep.include({
        url: 'https://example.com/product',
        title: 'Test Product - OG',
        description: 'OG description',
        image: 'https://example.com/image.jpg',
        favicon: 'https://example.com/favicon.ico'
      });
      expect(metadata.html).to.include('<title>Test Product</title>');
    });

    it('should handle missing Open Graph tags gracefully', async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Simple Page</title>
          <meta name="description" content="Simple description">
        </head>
        <body>
          <h1>Simple Page</h1>
        </body>
        </html>
      `;

      nock('https://example.com')
        .get('/simple')
        .reply(200, mockHtml, {
          'content-type': 'text/html; charset=utf-8'
        });

      const metadata = await fetcher.fetchMetadata('https://example.com/simple');

      expect(metadata.url).to.equal('https://example.com/simple');
      expect(metadata.title).to.equal('Simple Page');
      expect(metadata.description).to.equal('Simple description');
      expect(metadata.image).to.be.null;
      // Note: favicon will default to /favicon.ico if no explicit favicon is found
      expect(metadata.favicon).to.equal('https://example.com/favicon.ico');
    });

    it('should handle redirects correctly', async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Redirected Page</title>
        </head>
        </html>
      `;

      nock('https://example.com')
        .get('/redirect')
        .reply(302, '', { location: 'https://example.com/final' });

      nock('https://example.com')
        .get('/final')
        .reply(200, mockHtml, {
          'content-type': 'text/html; charset=utf-8'
        });

      const metadata = await fetcher.fetchMetadata('https://example.com/redirect');

      expect(metadata.url).to.equal('https://example.com/final');
      expect(metadata.title).to.equal('Redirected Page');
    });

    it('should handle network errors gracefully', async () => {
      nock('https://example.com')
        .get('/error')
        .replyWithError('Network error');

      try {
        await fetcher.fetchMetadata('https://example.com/error');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to fetch URL');
      }
    });

    it('should handle timeout errors', async () => {
      const slowFetcher = new MetadataFetcher({ timeout: 100 });

      nock('https://example.com')
        .get('/slow')
        .delay(200)
        .reply(200, '<html><head><title>Slow</title></head></html>');

      try {
        await slowFetcher.fetchMetadata('https://example.com/slow');
        expect.fail('Should have thrown a timeout error');
      } catch (error) {
        expect(error.message).to.include('timeout');
      }
    });

    it('should handle non-HTML content types', async () => {
      nock('https://example.com')
        .get('/image.jpg')
        .reply(200, 'binary-image-data', {
          'content-type': 'image/jpeg'
        });

      try {
        await fetcher.fetchMetadata('https://example.com/image.jpg');
        expect.fail('Should have thrown an error for non-HTML content');
      } catch (error) {
        expect(error.message).to.include('Content type not supported');
      }
    });

    it('should handle large HTML documents', async () => {
      const largeHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Large Page</title>
          <meta name="description" content="Large page description">
        </head>
        <body>
          ${'<p>Large content</p>'.repeat(10000)}
        </body>
        </html>
      `;

      nock('https://example.com')
        .get('/large')
        .reply(200, largeHtml, {
          'content-type': 'text/html; charset=utf-8'
        });

      const metadata = await fetcher.fetchMetadata('https://example.com/large');

      expect(metadata.title).to.equal('Large Page');
      expect(metadata.description).to.equal('Large page description');
    });
  });

  describe('extractMetadata', () => {
    it('should extract Twitter Card metadata', () => {
      const html = `
        <html>
        <head>
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="Twitter Title">
          <meta name="twitter:description" content="Twitter Description">
          <meta name="twitter:image" content="https://example.com/twitter.jpg">
        </head>
        </html>
      `;

      const metadata = fetcher.extractMetadata(html, 'https://example.com');

      expect(metadata.twitter).to.deep.equal({
        card: 'summary_large_image',
        title: 'Twitter Title',
        description: 'Twitter Description',
        image: 'https://example.com/twitter.jpg'
      });
    });

    it('should extract JSON-LD structured data', () => {
      const html = `
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "JSON-LD Product",
            "description": "Product from JSON-LD",
            "image": "https://example.com/jsonld.jpg"
          }
          </script>
        </head>
        </html>
      `;

      const metadata = fetcher.extractMetadata(html, 'https://example.com');

      expect(metadata.jsonLd).to.be.an('array');
      expect(metadata.jsonLd[0]).to.deep.include({
        '@type': 'Product',
        name: 'JSON-LD Product',
        description: 'Product from JSON-LD'
      });
    });

    it('should prioritize Open Graph over basic meta tags', () => {
      const html = `
        <html>
        <head>
          <title>Basic Title</title>
          <meta name="description" content="Basic description">
          <meta property="og:title" content="OG Title">
          <meta property="og:description" content="OG description">
        </head>
        </html>
      `;

      const metadata = fetcher.extractMetadata(html, 'https://example.com');

      expect(metadata.title).to.equal('OG Title');
      expect(metadata.description).to.equal('OG description');
    });

    it('should handle malformed HTML gracefully', () => {
      const malformedHtml = `
        <html>
        <head>
          <title>Malformed
          <meta name="description" content="Missing closing quote>
          <meta property="og:title" content="OG Title">
        </head>
      `;

      expect(() => {
        fetcher.extractMetadata(malformedHtml, 'https://example.com');
      }).to.not.throw();
    });
  });

  describe('resolveUrl', () => {
    it('should resolve relative URLs correctly', () => {
      expect(fetcher.resolveUrl('/path', 'https://example.com')).to.equal('https://example.com/path');
      expect(fetcher.resolveUrl('path', 'https://example.com/')).to.equal('https://example.com/path');
      expect(fetcher.resolveUrl('../path', 'https://example.com/sub/')).to.equal('https://example.com/path');
    });

    it('should return absolute URLs unchanged', () => {
      expect(fetcher.resolveUrl('https://other.com/path', 'https://example.com')).to.equal('https://other.com/path');
    });

    it('should handle protocol-relative URLs', () => {
      expect(fetcher.resolveUrl('//cdn.example.com/image.jpg', 'https://example.com')).to.equal('https://cdn.example.com/image.jpg');
    });
  });
});