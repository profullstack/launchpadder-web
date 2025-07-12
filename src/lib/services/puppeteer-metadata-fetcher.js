/**
 * Puppeteer-based Metadata Fetching Service
 * Handles client-side rendered applications by executing JavaScript
 * and waiting for dynamic content to load before extracting metadata
 */

import puppeteer from 'puppeteer';
import { URL } from 'url';

export class PuppeteerMetadataFetcher {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000;
    this.waitForSelector = options.waitForSelector || null;
    this.waitForTimeout = options.waitForTimeout || 3000; // Wait for JS to execute
    this.userAgent = options.userAgent || 'ADLP-Bot/1.0 (+https://adlp.dev/bot)';
    this.enableImages = options.enableImages ?? false; // Disable images for faster loading
    this.enableJavaScript = options.enableJavaScript ?? true;
    this.viewport = options.viewport || { width: 1280, height: 720 };
    this.enableCaching = options.enableCaching ?? false;
    this.cacheMaxAge = options.cacheMaxAge ?? 3600; // 1 hour
    
    // Browser instance management
    this.browser = null;
    this.browserPromise = null;
    
    // Cache storage
    this.cache = new Map();
    this.requestPromises = new Map(); // For deduplicating concurrent requests
  }

  /**
   * Validates a URL for security and format
   * @param {string} url - The URL to validate
   * @throws {Error} If URL is invalid or not allowed
   */
  validateUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('URL is required');
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      throw new Error('Invalid URL format');
    }

    // Only allow HTTP and HTTPS
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are supported');
    }

    // Security checks for production
    if (process.env.NODE_ENV === 'production') {
      const hostname = parsedUrl.hostname.toLowerCase();
      
      // Block localhost
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        throw new Error('Localhost URLs are not allowed');
      }

      // Block private IP ranges
      if (this.isPrivateIP(hostname)) {
        throw new Error('Private IP addresses are not allowed');
      }
    }
  }

  /**
   * Checks if a hostname is a private IP address
   * @param {string} hostname - The hostname to check
   * @returns {boolean} True if it's a private IP
   */
  isPrivateIP(hostname) {
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);
    
    if (!match) return false;

    const [, a, b, c, d] = match.map(Number);
    
    // Check for private IP ranges
    return (
      (a === 10) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) // Link-local
    );
  }

  /**
   * Gets or creates a browser instance
   * @returns {Promise<Browser>} Puppeteer browser instance
   */
  async getBrowser() {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    if (this.browserPromise) {
      return this.browserPromise;
    }

    this.browserPromise = puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    this.browser = await this.browserPromise;
    this.browserPromise = null;
    
    return this.browser;
  }

  /**
   * Fetches metadata from a URL using Puppeteer
   * @param {string} url - The URL to fetch metadata from
   * @returns {Promise<Object>} The extracted metadata
   */
  async fetchMetadata(url) {
    this.validateUrl(url);

    // Check cache first
    if (this.enableCaching) {
      const cached = this.getCachedMetadata(url);
      if (cached) {
        return cached;
      }
    }

    // Deduplicate concurrent requests
    if (this.requestPromises.has(url)) {
      return this.requestPromises.get(url);
    }

    const promise = this._fetchMetadataInternal(url);
    this.requestPromises.set(url, promise);

    try {
      const metadata = await promise;
      
      // Cache the result
      if (this.enableCaching) {
        this.setCachedMetadata(url, metadata);
      }
      
      return metadata;
    } finally {
      this.requestPromises.delete(url);
    }
  }

  /**
   * Internal metadata fetching implementation
   * @param {string} url - The URL to fetch metadata from
   * @returns {Promise<Object>} The extracted metadata
   */
  async _fetchMetadataInternal(url) {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Configure page
      await page.setUserAgent(this.userAgent);
      await page.setViewport(this.viewport);
      
      // Disable images if configured for faster loading
      if (!this.enableImages) {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          if (req.resourceType() === 'image') {
            req.abort();
          } else {
            req.continue();
          }
        });
      }

      // Set JavaScript enabled/disabled
      await page.setJavaScriptEnabled(this.enableJavaScript);

      // Navigate to the page
      const response = await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: this.timeout
      });

      if (!response.ok()) {
        throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
      }

      // Wait for specific selector if provided
      if (this.waitForSelector) {
        await page.waitForSelector(this.waitForSelector, { timeout: this.waitForTimeout });
      } else if (this.waitForTimeout > 0) {
        // Wait for additional time to let JavaScript execute
        await new Promise(resolve => setTimeout(resolve, this.waitForTimeout));
      }

      // Extract metadata using page.evaluate to run in browser context
      const metadata = await page.evaluate(() => {
        const getMetaContent = (name) => {
          const element = document.querySelector(`meta[name="${name}"]`);
          return element ? element.getAttribute('content') : null;
        };

        const getMetaProperty = (property) => {
          const element = document.querySelector(`meta[property="${property}"]`);
          return element ? element.getAttribute('content') : null;
        };

        const getAllMeta = (selector) => {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements).map(el => ({
            property: el.getAttribute('property') || el.getAttribute('name'),
            content: el.getAttribute('content'),
            href: el.getAttribute('href')
          }));
        };

        // Extract basic metadata
        const title = document.title || getMetaProperty('og:title') || getMetaContent('twitter:title') || 'Untitled';
        const description = getMetaContent('description') || getMetaProperty('og:description') || getMetaContent('twitter:description') || '';

        // Extract Open Graph metadata
        const openGraph = {};
        getAllMeta('meta[property^="og:"]').forEach(meta => {
          if (meta.property && meta.content) {
            const key = meta.property.replace('og:', '');
            openGraph[key] = meta.content;
          }
        });

        // Extract Twitter Card metadata
        const twitter = {};
        getAllMeta('meta[name^="twitter:"]').forEach(meta => {
          if (meta.property && meta.content) {
            const key = meta.property.replace('twitter:', '').replace(':', '_');
            twitter[key] = meta.content;
          }
        });

        // Extract images with priorities
        const images = {
          primary: null,
          sources: []
        };

        const imageSelectors = [
          { selector: 'meta[property="og:image"]', type: 'og:image', priority: 10 },
          { selector: 'meta[name="twitter:image"]', type: 'twitter:image', priority: 9 },
          { selector: 'meta[name="twitter:image:src"]', type: 'twitter:image:src', priority: 8 },
          { selector: 'link[rel="image_src"]', type: 'image_src', priority: 7 }
        ];

        imageSelectors.forEach(({ selector, type, priority }) => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const url = element.getAttribute('content') || element.getAttribute('href');
            if (url) {
              images.sources.push({
                url,
                type,
                priority,
                width: parseInt(element.getAttribute('width')) || null,
                height: parseInt(element.getAttribute('height')) || null
              });
            }
          });
        });

        // Sort by priority and set primary
        images.sources.sort((a, b) => b.priority - a.priority);
        if (images.sources.length > 0) {
          images.primary = images.sources[0].url;
        }

        // Extract favicons
        const favicons = [];
        const faviconSelectors = [
          'link[rel="icon"]',
          'link[rel="shortcut icon"]',
          'link[rel="apple-touch-icon"]',
          'link[rel="apple-touch-icon-precomposed"]'
        ];

        faviconSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const href = element.getAttribute('href');
            if (href) {
              favicons.push({
                url: new URL(href, window.location.href).href,
                type: element.getAttribute('rel'),
                sizes: element.getAttribute('sizes'),
                mimeType: element.getAttribute('type')
              });
            }
          });
        });

        // Extract JSON-LD structured data
        const jsonLd = [];
        const jsonLdElements = document.querySelectorAll('script[type="application/ld+json"]');
        jsonLdElements.forEach(element => {
          try {
            const data = JSON.parse(element.textContent);
            jsonLd.push(data);
          } catch (error) {
            // Ignore malformed JSON-LD
          }
        });

        // Detect content type
        let contentType = 'website';
        if (openGraph.type) {
          contentType = openGraph.type;
        } else if (document.querySelector('video')) {
          contentType = 'video';
        } else if (document.querySelector('article')) {
          contentType = 'article';
        }

        return {
          url: window.location.href,
          title,
          description,
          contentType,
          images,
          favicons,
          openGraph,
          twitter,
          structuredData: {
            jsonLd,
            microdata: [] // Could be enhanced to extract microdata
          },
          // Additional metadata that's useful for CSR apps
          loadTime: Date.now(),
          hasJavaScript: true,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        };
      });

      return metadata;

    } catch (error) {
      throw new Error(`Failed to fetch metadata: ${error.message}`);
    } finally {
      await page.close();
    }
  }

  /**
   * Cache management methods
   */
  getCachedMetadata(url) {
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge * 1000) {
      return cached.data;
    }
    return null;
  }

  setCachedMetadata(url, metadata) {
    this.cache.set(url, {
      data: metadata,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }

  /**
   * Closes the browser instance
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async cleanup() {
    await this.close();
    this.cache.clear();
    this.requestPromises.clear();
  }
}

// Export a default instance
export const puppeteerMetadataFetcher = new PuppeteerMetadataFetcher();

// Graceful shutdown handling
process.on('SIGINT', async () => {
  await puppeteerMetadataFetcher.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await puppeteerMetadataFetcher.cleanup();
  process.exit(0);
});