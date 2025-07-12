/**
 * Enhanced URL Metadata Fetching Service
 * Extends the base metadata fetcher with advanced features:
 * - Multiple image extraction with size analysis
 * - Enhanced favicon detection
 * - Structured data parsing (JSON-LD, Microdata)
 * - Performance optimizations with caching
 * - Support for various content types
 * - Social media optimization
 */

import { MetadataFetcher } from './metadata-fetcher.js';
import { load } from 'cheerio';
import fetch from 'node-fetch';
import { URL } from 'url';

export class EnhancedMetadataFetcher extends MetadataFetcher {
  constructor(options = {}) {
    super(options);
    
    // Enhanced options
    this.enableImageAnalysis = options.enableImageAnalysis ?? true;
    this.enableCaching = options.enableCaching ?? false;
    this.cacheMaxAge = options.cacheMaxAge ?? 3600; // 1 hour
    this.maxImageSize = options.maxImageSize ?? 5 * 1024 * 1024; // 5MB
    this.enableStructuredData = options.enableStructuredData ?? true;
    
    // Cache storage
    this.cache = new Map();
    this.requestPromises = new Map(); // For deduplicating concurrent requests
  }

  /**
   * Enhanced metadata fetching with caching and performance optimizations
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
   * Override fetchWithTimeout to handle additional content types
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
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
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

      // Enhanced content type support
      const contentType = response.headers.get('content-type') || 'text/html';
      if (!contentType.includes('text/html') &&
          !contentType.includes('application/xhtml') &&
          !contentType.includes('application/pdf') &&
          contentType !== 'text/html') {
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
   * Internal metadata fetching implementation
   * @param {string} url - The URL to fetch metadata from
   * @returns {Promise<Object>} The extracted metadata
   */
  async _fetchMetadataInternal(url) {
    try {
      const response = await this.fetchWithTimeout(url);
      const contentType = response.headers.get('content-type') || '';
      
      // Handle different content types
      if (contentType.includes('application/pdf')) {
        return this.extractPdfMetadata(response, url);
      }
      
      const html = await response.text();
      const finalUrl = response.url || url;
      
      return this.extractEnhancedMetadata(html, finalUrl);
    } catch (error) {
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }

  /**
   * Extracts enhanced metadata from HTML content
   * @param {string} html - The HTML content
   * @param {string} url - The source URL
   * @returns {Object} The extracted metadata
   */
  extractEnhancedMetadata(html, url) {
    const $ = load(html);
    
    // Start with base metadata
    const metadata = super.extractMetadata(html, url);
    
    // Enhanced image extraction
    if (this.enableImageAnalysis) {
      metadata.images = this.extractMultipleImages($, url);
    }
    
    // Enhanced favicon extraction
    metadata.favicons = this.extractEnhancedFavicons($, url);
    
    // Structured data extraction
    if (this.enableStructuredData) {
      metadata.structuredData = this.extractStructuredData($);
    }
    
    // Content type detection
    metadata.contentType = this.detectContentType($, metadata);
    
    // Video metadata if applicable
    if (metadata.contentType === 'video') {
      metadata.video = this.extractVideoMetadata($, url);
    }
    
    // Enhanced social media metadata
    metadata.social = this.extractSocialMetadata($);
    
    // Override base metadata with enhanced versions
    metadata.twitter = metadata.social.twitter;
    metadata.openGraph = metadata.social.openGraph;
    
    return metadata;
  }

  /**
   * Extracts multiple images with size and type information
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {string} baseUrl - The base URL for resolving relative URLs
   * @returns {Object} Image metadata with primary image and sources array
   */
  extractMultipleImages($, baseUrl) {
    const images = {
      primary: null,
      sources: []
    };

    // Define image selectors with priorities
    const imageSelectors = [
      { selector: 'meta[property="og:image"]', type: 'og:image', priority: 10 },
      { selector: 'meta[name="twitter:image"]', type: 'twitter:image', priority: 9 },
      { selector: 'meta[name="twitter:image:src"]', type: 'twitter:image:src', priority: 8 },
      { selector: 'link[rel="image_src"]', type: 'image_src', priority: 7 },
      { selector: 'link[rel="apple-touch-icon"]', type: 'apple-touch-icon', priority: 6 },
      { selector: 'link[rel="icon"][type*="image"]', type: 'icon', priority: 5 }
    ];

    // Extract meta tag images
    imageSelectors.forEach(({ selector, type, priority }) => {
      $(selector).each((_, element) => {
        const url = $(element).attr('content') || $(element).attr('href');
        if (url) {
          const imageData = {
            url: this.resolveUrl(url, baseUrl),
            type,
            priority,
            sizes: $(element).attr('sizes'),
            width: this.extractImageDimension($, 'og:image:width', type),
            height: this.extractImageDimension($, 'og:image:height', type)
          };
          
          images.sources.push(imageData);
        }
      });
    });

    // Extract images from img tags
    $('img').each((_, element) => {
      const src = $(element).attr('src');
      const alt = $(element).attr('alt');
      const width = parseInt($(element).attr('width')) || null;
      const height = parseInt($(element).attr('height')) || null;
      
      if (src) {
        images.sources.push({
          url: this.resolveUrl(src, baseUrl),
          type: 'img',
          priority: 3,
          alt,
          width,
          height
        });
      }
    });

    // Sort by priority and set primary image
    images.sources.sort((a, b) => b.priority - a.priority);
    
    if (images.sources.length > 0) {
      images.primary = images.sources[0].url;
    }

    return images;
  }

  /**
   * Extracts image dimension from meta tags
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {string} property - The property to look for
   * @param {string} imageType - The image type context
   * @returns {number|null} The dimension value
   */
  extractImageDimension($, property, imageType) {
    if (imageType === 'og:image') {
      const value = $(`meta[property="${property}"]`).attr('content');
      return value ? parseInt(value) : null;
    }
    return null;
  }

  /**
   * Extracts enhanced favicon information
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {string} baseUrl - The base URL for resolving relative URLs
   * @returns {Array} Array of favicon objects
   */
  extractEnhancedFavicons($, baseUrl) {
    const favicons = [];
    
    const faviconSelectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]',
      'link[rel="mask-icon"]'
    ];

    faviconSelectors.forEach(selector => {
      $(selector).each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
          favicons.push({
            url: this.resolveUrl(href, baseUrl),
            type: $(element).attr('rel'),
            sizes: $(element).attr('sizes'),
            mimeType: $(element).attr('type'),
            color: $(element).attr('color') // For mask-icon
          });
        }
      });
    });

    // Add default favicon if none found
    if (favicons.length === 0) {
      favicons.push({
        url: this.resolveUrl('/favicon.ico', baseUrl),
        type: 'icon',
        sizes: null,
        mimeType: 'image/x-icon'
      });
    }

    return favicons;
  }

  /**
   * Extracts structured data (JSON-LD, Microdata)
   * @param {CheerioAPI} $ - Cheerio instance
   * @returns {Object} Structured data object
   */
  extractStructuredData($) {
    const structuredData = {
      jsonLd: [],
      microdata: []
    };

    // Extract JSON-LD (enhanced from base class)
    structuredData.jsonLd = super.extractJsonLd($);

    // Extract Microdata
    structuredData.microdata = this.extractMicrodata($);

    return structuredData;
  }

  /**
   * Extracts Microdata structured data
   * @param {CheerioAPI} $ - Cheerio instance
   * @returns {Array} Array of microdata objects
   */
  extractMicrodata($) {
    const microdata = [];
    
    $('[itemscope]').each((_, element) => {
      const itemType = $(element).attr('itemtype');
      const item = {
        type: itemType,
        properties: {}
      };

      $(element).find('[itemprop]').each((_, propElement) => {
        const propName = $(propElement).attr('itemprop');
        const propValue = $(propElement).attr('content') || 
                         $(propElement).attr('href') || 
                         $(propElement).text().trim();
        
        if (propName && propValue) {
          if (item.properties[propName]) {
            // Handle multiple values
            if (!Array.isArray(item.properties[propName])) {
              item.properties[propName] = [item.properties[propName]];
            }
            item.properties[propName].push(propValue);
          } else {
            item.properties[propName] = propValue;
          }
        }
      });

      if (Object.keys(item.properties).length > 0) {
        microdata.push(item);
      }
    });

    return microdata;
  }

  /**
   * Detects content type based on metadata
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {Object} metadata - Existing metadata
   * @returns {string} Content type
   */
  detectContentType($, metadata) {
    // Check Open Graph type
    if (metadata.openGraph?.type) {
      return metadata.openGraph.type;
    }

    // Check for video indicators
    if ($('meta[property="og:video"]').length > 0 || 
        $('video').length > 0) {
      return 'video';
    }

    // Check for article indicators
    if ($('article').length > 0 || 
        $('meta[property="article:author"]').length > 0) {
      return 'article';
    }

    // Check for product indicators
    if ($('[itemtype*="Product"]').length > 0 ||
        metadata.structuredData?.jsonLd?.some(item => item['@type'] === 'Product')) {
      return 'product';
    }

    return 'website';
  }

  /**
   * Extracts video metadata
   * @param {CheerioAPI} $ - Cheerio instance
   * @param {string} baseUrl - The base URL
   * @returns {Object} Video metadata
   */
  extractVideoMetadata($, baseUrl) {
    const video = {};

    // Open Graph video properties
    const ogVideo = $('meta[property="og:video"]').attr('content');
    if (ogVideo) {
      video.url = this.resolveUrl(ogVideo, baseUrl);
    }

    video.width = parseInt($('meta[property="og:video:width"]').attr('content')) || null;
    video.height = parseInt($('meta[property="og:video:height"]').attr('content')) || null;
    video.duration = parseInt($('meta[property="og:video:duration"]').attr('content')) || null;
    video.type = $('meta[property="og:video:type"]').attr('content') || null;

    return video;
  }

  /**
   * Extracts enhanced social media metadata
   * @param {CheerioAPI} $ - Cheerio instance
   * @returns {Object} Social media metadata
   */
  extractSocialMetadata($) {
    const social = {
      twitter: this.extractEnhancedTwitter($),
      openGraph: this.extractEnhancedOpenGraph($),
      facebook: {},
      linkedin: {}
    };

    // Extract Facebook-specific metadata
    $('meta[property^="fb:"]').each((_, element) => {
      const property = $(element).attr('property');
      const content = $(element).attr('content');
      
      if (property && content) {
        const key = property.replace('fb:', '');
        social.facebook[key] = content.trim();
      }
    });

    return social;
  }

  /**
   * Enhanced Twitter metadata extraction
   * @param {CheerioAPI} $ - Cheerio instance
   * @returns {Object} Enhanced Twitter metadata
   */
  extractEnhancedTwitter($) {
    const twitter = {};
    
    $('meta[name^="twitter:"]').each((_, element) => {
      const name = $(element).attr('name');
      const content = $(element).attr('content');
      
      if (name && content) {
        const key = name.replace('twitter:', '').replace(':', '_');
        twitter[key] = content.trim();
      }
    });

    return twitter;
  }

  /**
   * Enhanced Open Graph metadata extraction
   * @param {CheerioAPI} $ - Cheerio instance
   * @returns {Object} Enhanced Open Graph metadata
   */
  extractEnhancedOpenGraph($) {
    const og = {};
    
    $('meta[property^="og:"], meta[property^="article:"]').each((_, element) => {
      const property = $(element).attr('property');
      const content = $(element).attr('content');
      
      if (property && content) {
        let key = property.replace('og:', '').replace('article:', '');
        // Handle article properties by prefixing them
        if (property.startsWith('article:')) {
          key = property.replace('article:', '');
        }
        og[key] = content.trim();
      }
    });

    // Fallback: try to extract from malformed HTML using regex if Cheerio fails
    if (Object.keys(og).length === 0) {
      const html = $.html();
      
      // Decode HTML entities first
      const decodedHtml = html
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
      
      // Try multiple regex patterns to handle different formats
      const patterns = [
        /<meta\s+property=["']og:([^"']+)["']\s+content=["']([^"']+)["']/gi,
        /<meta\s+content=["']([^"']+)["']\s+property=["']og:([^"']+)["']/gi,
        /<meta[^>]*property=["']og:([^"']+)["'][^>]*content=["']([^"']+)["'][^>]*>/gi
      ];
      
      for (const pattern of patterns) {
        const ogMatches = decodedHtml.match(pattern);
        if (ogMatches) {
          ogMatches.forEach(match => {
            const propMatch = match.match(/property=["']og:([^"']+)["']/);
            const contentMatch = match.match(/content=["']([^"']+)["']/);
            if (propMatch && contentMatch) {
              og[propMatch[1]] = contentMatch[1];
            }
          });
          break; // Stop after first successful pattern
        }
      }
    }

    return og;
  }

  /**
   * Extracts PDF metadata
   * @param {Response} response - Fetch response
   * @param {string} url - The PDF URL
   * @returns {Object} PDF metadata
   */
  async extractPdfMetadata(response, url) {
    const contentLength = response.headers.get('content-length');
    const filename = url.split('/').pop() || 'document.pdf';
    
    return {
      url,
      title: filename,
      description: `PDF document: ${filename}`,
      contentType: 'application/pdf',
      fileSize: contentLength ? parseInt(contentLength) : null,
      filename,
      openGraph: {},
      twitter: {},
      jsonLd: []
    };
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
}

// Export a default instance
export const enhancedMetadataFetcher = new EnhancedMetadataFetcher();