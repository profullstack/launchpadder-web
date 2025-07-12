/**
 * URL Metadata Fetching Service
 * Fetches and extracts metadata from web pages including Open Graph, Twitter Cards, and JSON-LD
 */

import { load } from 'cheerio';
import fetch from 'node-fetch';
import { URL } from 'url';

export class MetadataFetcher {
  constructor(options = {}) {
    this.timeout = options.timeout || 10000;
    this.maxRedirects = options.maxRedirects || 5;
    this.userAgent = options.userAgent || 'ADLP-Bot/1.0 (+https://adlp.dev/bot)';
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
   * Fetches metadata from a URL
   * @param {string} url - The URL to fetch metadata from
   * @returns {Promise<Object>} The extracted metadata
   */
  async fetchMetadata(url) {
    this.validateUrl(url);

    try {
      const response = await this.fetchWithTimeout(url);
      const html = await response.text();
      
      // Get the final URL after redirects
      const finalUrl = response.url || url;
      
      return this.extractMetadata(html, finalUrl);
    } catch (error) {
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }

  /**
   * Fetches a URL with timeout and redirect handling
   * @param {string} url - The URL to fetch
   * @returns {Promise<Response>} The fetch response
   */
  async fetchWithTimeout(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        redirect: 'follow',
        follow: this.maxRedirects,
        timeout: this.timeout,
        signal: controller.signal,
        size: this.maxContentLength
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content type - be more lenient with missing content-type headers
      const contentType = response.headers.get('content-type') || 'text/html';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml') && contentType !== 'text/html') {
        throw new Error(`Content type not supported: ${contentType}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      throw error;
    }
  }

  /**
   * Extracts metadata from HTML content
   * @param {string} html - The HTML content
   * @param {string} url - The source URL
   * @returns {Object} The extracted metadata
   */
  extractMetadata(html, url) {
    const $ = load(html);
    const metadata = {
      url,
      title: null,
      description: null,
      image: null,
      favicon: null,
      html,
      openGraph: {},
      twitter: {},
      jsonLd: []
    };

    // Extract basic metadata
    metadata.title = this.extractTitle($);
    metadata.description = this.extractDescription($);
    metadata.image = this.extractImage($, url);
    metadata.favicon = this.extractFavicon($, url);

    // Extract Open Graph metadata
    metadata.openGraph = this.extractOpenGraph($);

    // Extract Twitter Card metadata
    metadata.twitter = this.extractTwitter($);

    // Extract JSON-LD structured data
    metadata.jsonLd = this.extractJsonLd($);

    // Prioritize Open Graph over basic meta tags
    if (metadata.openGraph.title) {
      metadata.title = metadata.openGraph.title;
    }
    if (metadata.openGraph.description) {
      metadata.description = metadata.openGraph.description;
    }
    if (metadata.openGraph.image) {
      metadata.image = this.resolveUrl(metadata.openGraph.image, url);
    }

    return metadata;
  }

  /**
   * Extracts the page title
   * @param {CheerioAPI} $ - Cheerio instance
   * @returns {string|null} The page title
   */
  extractTitle($) {
    return $('title').first().text()?.trim() || null;
  }

  /**
   * Extracts the page description
   * @param {CheerioAPI} $ - Cheerio instance
   * @returns {string|null} The page description
   */
  extractDescription($) {
    return $('meta[name="description"]').attr('content')?.trim() || null;
  }

  /**
   * Extracts the main image
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {string} baseUrl - The base URL for resolving relative URLs
   * @returns {string|null} The image URL
   */
  extractImage($, baseUrl) {
    // Try various image sources in order of preference
    const selectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
      'link[rel="image_src"]'
    ];

    for (const selector of selectors) {
      const content = $(selector).attr('content') || $(selector).attr('href');
      if (content) {
        return this.resolveUrl(content, baseUrl);
      }
    }

    return null;
  }

  /**
   * Extracts the favicon
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {string} baseUrl - The base URL for resolving relative URLs
   * @returns {string|null} The favicon URL
   */
  extractFavicon($, baseUrl) {
    const selectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]'
    ];

    for (const selector of selectors) {
      const href = $(selector).attr('href');
      if (href) {
        return this.resolveUrl(href, baseUrl);
      }
    }

    // Default favicon location
    return this.resolveUrl('/favicon.ico', baseUrl);
  }

  /**
   * Extracts Open Graph metadata
   * @param {CheerioAPI} $ - Cheerio instance
   * @returns {Object} Open Graph metadata
   */
  extractOpenGraph($) {
    const og = {};
    
    $('meta[property^="og:"]').each((_, element) => {
      const property = $(element).attr('property');
      const content = $(element).attr('content');
      
      if (property && content) {
        const key = property.replace('og:', '');
        og[key] = content.trim();
      }
    });

    return og;
  }

  /**
   * Extracts Twitter Card metadata
   * @param {CheerioAPI} $ - Cheerio instance
   * @returns {Object} Twitter Card metadata
   */
  extractTwitter($) {
    const twitter = {};
    
    $('meta[name^="twitter:"]').each((_, element) => {
      const name = $(element).attr('name');
      const content = $(element).attr('content');
      
      if (name && content) {
        const key = name.replace('twitter:', '');
        twitter[key] = content.trim();
      }
    });

    return twitter;
  }

  /**
   * Extracts JSON-LD structured data
   * @param {CheerioAPI} $ - Cheerio instance
   * @returns {Array} Array of JSON-LD objects
   */
  extractJsonLd($) {
    const jsonLdData = [];
    
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const content = $(element).html();
        if (content) {
          const data = JSON.parse(content);
          jsonLdData.push(data);
        }
      } catch (error) {
        // Ignore malformed JSON-LD
        console.warn('Failed to parse JSON-LD:', error.message);
      }
    });

    return jsonLdData;
  }

  /**
   * Resolves a URL relative to a base URL
   * @param {string} url - The URL to resolve
   * @param {string} baseUrl - The base URL
   * @returns {string} The resolved absolute URL
   */
  resolveUrl(url, baseUrl) {
    if (!url) return null;
    
    try {
      // Handle protocol-relative URLs
      if (url.startsWith('//')) {
        const baseUrlObj = new URL(baseUrl);
        return `${baseUrlObj.protocol}${url}`;
      }
      
      // Return absolute URLs as-is
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      
      // Resolve relative URLs
      return new URL(url, baseUrl).toString();
    } catch (error) {
      console.warn('Failed to resolve URL:', url, error.message);
      return null;
    }
  }
}

// Export a default instance
export const metadataFetcher = new MetadataFetcher();