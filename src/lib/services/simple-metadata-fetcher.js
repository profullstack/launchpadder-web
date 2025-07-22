/**
 * Simple Metadata Fetcher
 * Lightweight fallback for when Puppeteer fails
 * Uses simple HTTP requests and Cheerio for HTML parsing
 */

import { load } from 'cheerio';
import { URL } from 'url';

export class SimpleMetadataFetcher {
  constructor(options = {}) {
    this.timeout = options.timeout || 10000;
    this.userAgent = options.userAgent || 'ADLP-Bot/1.0 (+https://adlp.dev/bot)';
    this.maxRedirects = options.maxRedirects || 5;
    this.maxContentLength = options.maxContentLength || 5 * 1024 * 1024; // 5MB
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
   * Fetches HTML content from a URL
   * @param {string} url - The URL to fetch
   * @returns {Promise<string>} The HTML content
   */
  async fetchHtml(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        signal: controller.signal,
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content type
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        throw new Error('Response is not HTML content');
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.maxContentLength) {
        throw new Error('Content too large');
      }

      const html = await response.text();
      return html;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Extracts metadata from HTML using Cheerio
   * @param {string} html - The HTML content
   * @param {string} url - The original URL
   * @returns {Object} The extracted metadata
   */
  extractMetadata(html, url) {
    const $ = load(html);

    // Helper functions
    const getMetaContent = (name) => {
      return $(`meta[name="${name}"]`).attr('content') || null;
    };

    const getMetaProperty = (property) => {
      return $(`meta[property="${property}"]`).attr('content') || null;
    };

    const resolveUrl = (relativeUrl) => {
      if (!relativeUrl) return null;
      try {
        return new URL(relativeUrl, url).href;
      } catch {
        return null;
      }
    };

    // Extract basic metadata
    const title = $('title').text().trim() || 
                  getMetaProperty('og:title') || 
                  getMetaContent('twitter:title') || 
                  'Untitled';

    const description = getMetaContent('description') || 
                       getMetaProperty('og:description') || 
                       getMetaContent('twitter:description') || 
                       '';

    // Extract Open Graph metadata
    const openGraph = {};
    $('meta[property^="og:"]').each((_, element) => {
      const property = $(element).attr('property');
      const content = $(element).attr('content');
      if (property && content) {
        const key = property.replace('og:', '');
        openGraph[key] = content;
      }
    });

    // Extract Twitter Card metadata
    const twitter = {};
    $('meta[name^="twitter:"]').each((_, element) => {
      const name = $(element).attr('name');
      const content = $(element).attr('content');
      if (name && content) {
        const key = name.replace('twitter:', '').replace(':', '_');
        twitter[key] = content;
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
      $(selector).each((_, element) => {
        const imageUrl = $(element).attr('content') || $(element).attr('href');
        if (imageUrl) {
          const resolvedUrl = resolveUrl(imageUrl);
          if (resolvedUrl) {
            images.sources.push({
              url: resolvedUrl,
              type,
              priority,
              width: parseInt($(element).attr('width')) || null,
              height: parseInt($(element).attr('height')) || null
            });
          }
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
      $(selector).each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
          const resolvedUrl = resolveUrl(href);
          if (resolvedUrl) {
            favicons.push({
              url: resolvedUrl,
              type: $(element).attr('rel'),
              sizes: $(element).attr('sizes'),
              mimeType: $(element).attr('type')
            });
          }
        }
      });
    });

    // Extract JSON-LD structured data
    const jsonLd = [];
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const data = JSON.parse($(element).html());
        jsonLd.push(data);
      } catch (error) {
        // Ignore malformed JSON-LD
      }
    });

    // Detect content type
    let contentType = 'website';
    if (openGraph.type) {
      contentType = openGraph.type;
    } else if ($('video').length > 0) {
      contentType = 'video';
    } else if ($('article').length > 0) {
      contentType = 'article';
    }

    return {
      url,
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
      // Additional metadata
      loadTime: Date.now(),
      hasJavaScript: false, // This fetcher doesn't execute JS
      fetchMethod: 'simple-http'
    };
  }

  /**
   * Fetches metadata from a URL
   * @param {string} url - The URL to fetch metadata from
   * @returns {Promise<Object>} The extracted metadata
   */
  async fetchMetadata(url) {
    this.validateUrl(url);

    try {
      const html = await this.fetchHtml(url);
      const metadata = this.extractMetadata(html, url);
      return metadata;
    } catch (error) {
      throw new Error(`Failed to fetch metadata: ${error.message}`);
    }
  }

  /**
   * Cleanup method (no-op for simple fetcher)
   */
  async cleanup() {
    // No cleanup needed for simple HTTP fetcher
  }
}

// Export a default instance
export const simpleMetadataFetcher = new SimpleMetadataFetcher();