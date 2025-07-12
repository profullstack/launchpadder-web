/**
 * Test suite for Enhanced Metadata Fetching Service
 * Using Mocha + Chai for testing
 */

import { expect } from 'chai';
import nock from 'nock';
import { EnhancedMetadataFetcher } from '../../src/lib/services/enhanced-metadata-fetcher.js';

describe('EnhancedMetadataFetcher', () => {
  let fetcher;

  beforeEach(() => {
    fetcher = new EnhancedMetadataFetcher();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('constructor', () => {
    it('should create an instance with enhanced options', () => {
      const customFetcher = new EnhancedMetadataFetcher({
        enableImageAnalysis: true,
        enableCaching: true,
        cacheMaxAge: 3600,
        maxImageSize: 10 * 1024 * 1024
      });
      
      expect(customFetcher.enableImageAnalysis).to.be.true;
      expect(customFetcher.enableCaching).to.be.true;
      expect(customFetcher.cacheMaxAge).to.equal(3600);
      expect(customFetcher.maxImageSize).to.equal(10 * 1024 * 1024);
    });
  });

  describe('extractMultipleImages', () => {
    it('should extract multiple image sources with different sizes', async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:image" content="https://example.com/og-image.jpg">
          <meta property="og:image:width" content="1200">
          <meta property="og:image:height" content="630">
          <meta name="twitter:image" content="https://example.com/twitter-image.jpg">
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
          <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
        </head>
        <body>
          <img src="/hero-image.jpg" alt="Hero Image" width="800" height="400">
          <img src="/thumbnail.jpg" alt="Thumbnail" width="200" height="200">
        </body>
        </html>
      `;

      nock('https://example.com')
        .get('/test')
        .reply(200, mockHtml, {
          'content-type': 'text/html; charset=utf-8'
        });

      const metadata = await fetcher.fetchMetadata('https://example.com/test');

      expect(metadata.images).to.be.an('object');
      expect(metadata.images.primary).to.equal('https://example.com/og-image.jpg');
      expect(metadata.images.sources).to.be.an('array');
      expect(metadata.images.sources).to.have.length.greaterThan(1);
      
      // Check for different image types
      const sources = metadata.images.sources;
      expect(sources.some(img => img.type === 'og:image')).to.be.true;
      expect(sources.some(img => img.type === 'twitter:image')).to.be.true;
      expect(sources.some(img => img.type === 'apple-touch-icon')).to.be.true;
    });

    it('should extract image dimensions when available', async () => {
      const mockHtml = `
        <html>
        <head>
          <meta property="og:image" content="https://example.com/image.jpg">
          <meta property="og:image:width" content="1200">
          <meta property="og:image:height" content="630">
        </head>
        </html>
      `;

      nock('https://example.com')
        .get('/test')
        .reply(200, mockHtml);

      const metadata = await fetcher.fetchMetadata('https://example.com/test');
      const ogImage = metadata.images.sources.find(img => img.type === 'og:image');
      
      expect(ogImage).to.exist;
      expect(ogImage.width).to.equal(1200);
      expect(ogImage.height).to.equal(630);
    });
  });

  describe('extractEnhancedFavicons', () => {
    it('should extract multiple favicon sizes and formats', async () => {
      const mockHtml = `
        <html>
        <head>
          <link rel="icon" type="image/x-icon" href="/favicon.ico">
          <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
          <link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-152x152.png">
          <link rel="manifest" href="/site.webmanifest">
        </head>
        </html>
      `;

      nock('https://example.com')
        .get('/test')
        .reply(200, mockHtml);

      const metadata = await fetcher.fetchMetadata('https://example.com/test');

      expect(metadata.favicons).to.be.an('array');
      expect(metadata.favicons).to.have.length.greaterThan(3);
      
      // Check for different favicon types
      const types = metadata.favicons.map(f => f.type);
      expect(types).to.include('icon');
      expect(types).to.include('apple-touch-icon');
      
      // Check for size information
      const withSizes = metadata.favicons.filter(f => f.sizes);
      expect(withSizes).to.have.length.greaterThan(0);
    });

    it('should handle missing favicon gracefully', async () => {
      const mockHtml = `
        <html>
        <head>
          <title>No Favicon</title>
        </head>
        </html>
      `;

      nock('https://example.com')
        .get('/test')
        .reply(200, mockHtml);

      // Mock the default favicon check
      nock('https://example.com')
        .get('/favicon.ico')
        .reply(404);

      const metadata = await fetcher.fetchMetadata('https://example.com/test');

      expect(metadata.favicons).to.be.an('array');
      // Should still have the default favicon attempt
      expect(metadata.favicons).to.have.length.greaterThan(0);
    });
  });

  describe('extractStructuredData', () => {
    it('should extract and parse JSON-LD structured data', async () => {
      const mockHtml = `
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Test Product",
            "description": "A test product",
            "image": "https://example.com/product.jpg",
            "offers": {
              "@type": "Offer",
              "price": "29.99",
              "priceCurrency": "USD"
            }
          }
          </script>
        </head>
        </html>
      `;

      nock('https://example.com')
        .get('/test')
        .reply(200, mockHtml);

      const metadata = await fetcher.fetchMetadata('https://example.com/test');

      expect(metadata.structuredData).to.be.an('object');
      expect(metadata.structuredData.jsonLd).to.be.an('array');
      expect(metadata.structuredData.jsonLd[0]).to.have.property('@type', 'Product');
      expect(metadata.structuredData.jsonLd[0]).to.have.property('name', 'Test Product');
    });

    it('should extract microdata', async () => {
      const mockHtml = `
        <html>
        <body>
          <div itemscope itemtype="https://schema.org/Product">
            <h1 itemprop="name">Test Product</h1>
            <p itemprop="description">A test product description</p>
            <span itemprop="price">$29.99</span>
          </div>
        </body>
        </html>
      `;

      nock('https://example.com')
        .get('/test')
        .reply(200, mockHtml);

      const metadata = await fetcher.fetchMetadata('https://example.com/test');

      expect(metadata.structuredData.microdata).to.be.an('array');
      expect(metadata.structuredData.microdata[0]).to.have.property('type', 'https://schema.org/Product');
      expect(metadata.structuredData.microdata[0].properties).to.have.property('name');
    });
  });

  describe('performance optimizations', () => {
    it('should implement request caching', async () => {
      const mockHtml = '<html><head><title>Cached Page</title></head></html>';
      
      nock('https://example.com')
        .get('/cached')
        .reply(200, mockHtml)
        .persist(); // Allow multiple requests

      const cachedFetcher = new EnhancedMetadataFetcher({
        enableCaching: true,
        cacheMaxAge: 3600
      });

      // First request
      const start1 = Date.now();
      const metadata1 = await cachedFetcher.fetchMetadata('https://example.com/cached');
      const time1 = Date.now() - start1;

      // Second request (should be cached)
      const start2 = Date.now();
      const metadata2 = await cachedFetcher.fetchMetadata('https://example.com/cached');
      const time2 = Date.now() - start2;

      expect(metadata1.title).to.equal(metadata2.title);
      expect(time2).to.be.lessThan(time1); // Cached request should be faster
    });

    it('should handle concurrent requests efficiently', async () => {
      const mockHtml = '<html><head><title>Concurrent Test</title></head></html>';
      
      nock('https://example.com')
        .get('/concurrent')
        .reply(200, mockHtml);

      const promises = Array(5).fill().map(() => 
        fetcher.fetchMetadata('https://example.com/concurrent')
      );

      const results = await Promise.all(promises);
      
      // All results should be identical
      results.forEach(result => {
        expect(result.title).to.equal('Concurrent Test');
      });
    });
  });

  describe('content type support', () => {
    it('should handle PDF metadata extraction', async () => {
      const mockPdfResponse = Buffer.from('PDF content mock');
      
      nock('https://example.com')
        .get('/document.pdf')
        .reply(200, mockPdfResponse, {
          'content-type': 'application/pdf',
          'content-length': mockPdfResponse.length
        });

      const metadata = await fetcher.fetchMetadata('https://example.com/document.pdf');

      expect(metadata.contentType).to.equal('application/pdf');
      expect(metadata.fileSize).to.be.a('number');
      expect(metadata.title).to.include('document.pdf');
    });

    it('should extract video metadata', async () => {
      const mockHtml = `
        <html>
        <head>
          <meta property="og:type" content="video">
          <meta property="og:video" content="https://example.com/video.mp4">
          <meta property="og:video:width" content="1920">
          <meta property="og:video:height" content="1080">
          <meta property="og:video:duration" content="120">
        </head>
        </html>
      `;

      nock('https://example.com')
        .get('/video')
        .reply(200, mockHtml);

      const metadata = await fetcher.fetchMetadata('https://example.com/video');

      expect(metadata.contentType).to.equal('video');
      expect(metadata.video).to.be.an('object');
      expect(metadata.video.url).to.equal('https://example.com/video.mp4');
      expect(metadata.video.width).to.equal(1920);
      expect(metadata.video.height).to.equal(1080);
    });
  });

  describe('error handling and resilience', () => {
    it('should handle malformed HTML gracefully', async () => {
      const malformedHtml = `
        <html>
        <head>
          <title>Malformed
          <meta property="og:title" content="Test">
          <meta property="og:description" content="Missing quote>
        </head>
        <body>
          <div>Unclosed div
        </body>
      `;

      nock('https://example.com')
        .get('/malformed')
        .reply(200, malformedHtml);

      const metadata = await fetcher.fetchMetadata('https://example.com/malformed');

      expect(metadata).to.be.an('object');
      expect(metadata.title).to.exist;
      expect(metadata.openGraph.title).to.equal('Test');
    });

    it('should handle network timeouts gracefully', async () => {
      const timeoutFetcher = new EnhancedMetadataFetcher({ timeout: 100 });

      nock('https://example.com')
        .get('/slow')
        .delay(200)
        .reply(200, '<html><title>Slow</title></html>');

      try {
        await timeoutFetcher.fetchMetadata('https://example.com/slow');
        expect.fail('Should have thrown timeout error');
      } catch (error) {
        expect(error.message).to.include('timeout');
      }
    });

    it('should provide fallback metadata for failed requests', async () => {
      nock('https://example.com')
        .get('/error')
        .reply(500, 'Server Error');

      try {
        await fetcher.fetchMetadata('https://example.com/error');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to fetch URL');
      }
    });
  });

  describe('social media optimization', () => {
    it('should extract comprehensive Twitter Card metadata', async () => {
      const mockHtml = `
        <html>
        <head>
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:site" content="@example">
          <meta name="twitter:creator" content="@creator">
          <meta name="twitter:title" content="Twitter Title">
          <meta name="twitter:description" content="Twitter Description">
          <meta name="twitter:image" content="https://example.com/twitter.jpg">
          <meta name="twitter:image:alt" content="Twitter Image Alt">
        </head>
        </html>
      `;

      nock('https://example.com')
        .get('/twitter')
        .reply(200, mockHtml);

      const metadata = await fetcher.fetchMetadata('https://example.com/twitter');

      expect(metadata.twitter.card).to.equal('summary_large_image');
      expect(metadata.twitter.site).to.equal('@example');
      expect(metadata.twitter.creator).to.equal('@creator');
      expect(metadata.twitter.image_alt).to.equal('Twitter Image Alt');
    });

    it('should extract Facebook Open Graph metadata', async () => {
      const mockHtml = `
        <html>
        <head>
          <meta property="og:type" content="article">
          <meta property="og:title" content="Article Title">
          <meta property="og:description" content="Article Description">
          <meta property="og:image" content="https://example.com/og.jpg">
          <meta property="og:url" content="https://example.com/article">
          <meta property="og:site_name" content="Example Site">
          <meta property="article:author" content="John Doe">
          <meta property="article:published_time" content="2023-01-01T00:00:00Z">
        </head>
        </html>
      `;

      nock('https://example.com')
        .get('/article')
        .reply(200, mockHtml);

      const metadata = await fetcher.fetchMetadata('https://example.com/article');

      expect(metadata.openGraph.type).to.equal('article');
      expect(metadata.openGraph.site_name).to.equal('Example Site');
      expect(metadata.openGraph.author).to.equal('John Doe');
      expect(metadata.openGraph.published_time).to.equal('2023-01-01T00:00:00Z');
    });
  });
});