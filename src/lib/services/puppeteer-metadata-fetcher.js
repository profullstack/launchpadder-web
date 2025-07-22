/**
 * Puppeteer-based Metadata Fetching Service
 * Handles client-side rendered applications by executing JavaScript
 * and waiting for dynamic content to load before extracting metadata
 */

import puppeteer from 'puppeteer';
import { URL } from 'url';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PuppeteerMetadataFetcher {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000;
    this.waitForSelector = options.waitForSelector || null;
    this.waitForTimeout = options.waitForTimeout || 3000; // Wait for JS to execute
    this.userAgent = options.userAgent || 'ADLP-Bot/1.0 (+https://adlp.dev/bot)';
    this.enableImages = options.enableImages ?? true; // Enable images for screenshots
    this.enableJavaScript = options.enableJavaScript ?? true;
    this.viewport = options.viewport || { width: 1280, height: 720 };
    this.enableCaching = options.enableCaching ?? false;
    this.cacheMaxAge = options.cacheMaxAge ?? 3600; // 1 hour
    
    // Screenshot functionality
    this.enableScreenshots = options.enableScreenshots ?? true;
    this.screenshotDir = options.screenshotDir || path.join(process.cwd(), 'uploads', 'screenshots');
    this.screenshotBaseUrl = options.screenshotBaseUrl || '/uploads/screenshots';
    this.maxNavbarLinks = options.maxNavbarLinks || 10;
    
    // Browser instance management
    this.browser = null;
    this.browserPromise = null;
    
    // Cache storage
    this.cache = new Map();
    this.requestPromises = new Map(); // For deduplicating concurrent requests
    
    // Ensure screenshot directory exists
    this.ensureScreenshotDir();
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

    // Only allow HTTP, HTTPS, and file (for testing)
    if (!['http:', 'https:', 'file:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP, HTTPS, and file URLs are supported');
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
   * Ensures the screenshot directory exists
   */
  async ensureScreenshotDir() {
    try {
      await fs.mkdir(this.screenshotDir, { recursive: true });
    } catch (error) {
      console.warn('Failed to create screenshot directory:', error.message);
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

        // Enhanced logo and favicon detection
        const logos = {
          primary: null,
          sources: []
        };
        
        const favicons = [];
        
        // Logo detection selectors (prioritized)
        const logoSelectors = [
          { selector: 'img[alt*="logo" i]', type: 'alt-logo', priority: 10 },
          { selector: 'img[class*="logo" i]', type: 'class-logo', priority: 9 },
          { selector: 'img[id*="logo" i]', type: 'id-logo', priority: 8 },
          { selector: '.logo img', type: 'logo-container', priority: 7 },
          { selector: '#logo img', type: 'logo-id-container', priority: 6 },
          { selector: 'header img:first-of-type', type: 'header-first-img', priority: 5 },
          { selector: 'nav img:first-of-type', type: 'nav-first-img', priority: 4 },
          { selector: '.navbar img:first-of-type', type: 'navbar-first-img', priority: 3 },
          { selector: '.header img:first-of-type', type: 'header-class-first-img', priority: 2 }
        ];

        // Extract logos
        logoSelectors.forEach(({ selector, type, priority }) => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const src = element.getAttribute('src');
            if (src && element.offsetWidth > 0 && element.offsetHeight > 0) {
              try {
                const resolvedUrl = src.startsWith('http') ? src : new window.URL(src, window.location.href).href;
                logos.sources.push({
                  url: resolvedUrl,
                  type,
                  priority,
                  width: element.offsetWidth || parseInt(element.getAttribute('width')) || null,
                  height: element.offsetHeight || parseInt(element.getAttribute('height')) || null,
                  alt: element.getAttribute('alt') || ''
                });
              } catch (urlError) {
                console.warn('Invalid logo URL:', src);
              }
            }
          });
        });

        // Sort logos by priority and set primary
        logos.sources.sort((a, b) => b.priority - a.priority);
        if (logos.sources.length > 0) {
          logos.primary = logos.sources[0].url;
        }

        // Enhanced favicon detection
        const faviconSelectors = [
          { selector: 'link[rel="icon"]', priority: 10 },
          { selector: 'link[rel="shortcut icon"]', priority: 9 },
          { selector: 'link[rel="apple-touch-icon"]', priority: 8 },
          { selector: 'link[rel="apple-touch-icon-precomposed"]', priority: 7 },
          { selector: 'link[rel="mask-icon"]', priority: 6 },
          { selector: 'link[rel="fluid-icon"]', priority: 5 }
        ];

        faviconSelectors.forEach(({ selector, priority }) => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const href = element.getAttribute('href');
            if (href) {
              try {
                const resolvedUrl = href.startsWith('http') ? href : new window.URL(href, window.location.href).href;
                favicons.push({
                  url: resolvedUrl,
                  type: element.getAttribute('rel'),
                  sizes: element.getAttribute('sizes'),
                  mimeType: element.getAttribute('type'),
                  priority
                });
              } catch (urlError) {
                console.warn('Invalid favicon URL:', href);
              }
            }
          });
        });

        // Sort favicons by priority
        favicons.sort((a, b) => b.priority - a.priority);

        // Extract navbar links for screenshots
        const navbarLinks = [];
        const navSelectors = [
          'nav a',
          '.navbar a',
          '.navigation a',
          '.nav a',
          'header nav a',
          '.header nav a',
          '.menu a',
          '.main-menu a',
          '.primary-menu a'
        ];

        const foundLinks = new Set(); // Prevent duplicates
        navSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const href = element.getAttribute('href');
            const text = element.textContent?.trim();
            
            if (href && text && !foundLinks.has(href) && navbarLinks.length < 10) {
              try {
                const resolvedUrl = href.startsWith('http') ? href : new window.URL(href, window.location.href).href;
                const rect = element.getBoundingClientRect();
                
                // Only include visible links
                if (rect.width > 0 && rect.height > 0) {
                  navbarLinks.push({
                    url: resolvedUrl,
                    text: text.substring(0, 50), // Limit text length
                    selector: selector,
                    position: {
                      x: Math.round(rect.left + rect.width / 2),
                      y: Math.round(rect.top + rect.height / 2),
                      width: Math.round(rect.width),
                      height: Math.round(rect.height)
                    }
                  });
                  foundLinks.add(href);
                }
              } catch (urlError) {
                console.warn('Invalid navbar link URL:', href);
              }
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

        // Generate topic tags based on content analysis
        const topicTags = [];
        const tagSources = new Set();
        
        // Extract keywords from meta tags
        const keywords = getMetaContent('keywords');
        if (keywords) {
          keywords.split(',').forEach(keyword => {
            const tag = keyword.trim().toLowerCase();
            if (tag && tag.length > 2 && tag.length < 30) {
              topicTags.push({ tag, source: 'meta-keywords', confidence: 0.8 });
              tagSources.add(tag);
            }
          });
        }
        
        // Extract tags from Open Graph article tags
        const ogTags = getMetaProperty('article:tag');
        if (ogTags) {
          ogTags.split(',').forEach(tag => {
            const cleanTag = tag.trim().toLowerCase();
            if (cleanTag && !tagSources.has(cleanTag)) {
              topicTags.push({ tag: cleanTag, source: 'og-article-tag', confidence: 0.9 });
              tagSources.add(cleanTag);
            }
          });
        }
        
        // Analyze headings for topic extraction
        const headings = [];
        ['h1', 'h2', 'h3'].forEach(tag => {
          const elements = document.querySelectorAll(tag);
          elements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length > 3 && text.length < 100) {
              headings.push({ text, level: parseInt(tag.charAt(1)) });
            }
          });
        });
        
        // Extract topics from headings using keyword analysis
        headings.forEach(heading => {
          const words = heading.text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3 && word.length < 20);
          
          words.forEach(word => {
            if (!tagSources.has(word) && !isCommonWord(word)) {
              const confidence = heading.level === 1 ? 0.7 : heading.level === 2 ? 0.6 : 0.5;
              topicTags.push({ tag: word, source: `h${heading.level}-heading`, confidence });
              tagSources.add(word);
            }
          });
        });
        
        // Analyze navigation links for topic hints
        navbarLinks.forEach(link => {
          const words = link.text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3 && word.length < 20);
          
          words.forEach(word => {
            if (!tagSources.has(word) && !isCommonWord(word)) {
              topicTags.push({ tag: word, source: 'navigation', confidence: 0.4 });
              tagSources.add(word);
            }
          });
        });
        
        // Analyze page content for topic extraction
        const contentElements = document.querySelectorAll('p, article, section, main, .content, .post, .article');
        let contentText = '';
        contentElements.forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.length > 50) {
            contentText += ' ' + text;
          }
        });
        
        if (contentText.length > 100) {
          const words = contentText.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 4 && word.length < 25);
          
          // Count word frequency
          const wordCount = {};
          words.forEach(word => {
            if (!isCommonWord(word)) {
              wordCount[word] = (wordCount[word] || 0) + 1;
            }
          });
          
          // Add frequent words as tags
          Object.entries(wordCount)
            .filter(([word, count]) => count >= 3 && !tagSources.has(word))
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .forEach(([word, count]) => {
              const confidence = Math.min(0.6, 0.2 + (count * 0.05));
              topicTags.push({ tag: word, source: 'content-analysis', confidence });
              tagSources.add(word);
            });
        }
        
        // Detect technology/framework tags from various signals
        const techIndicators = {
          'react': ['react', 'jsx', 'create-react-app', 'next.js', 'nextjs'],
          'vue': ['vue', 'vuejs', 'nuxt'],
          'angular': ['angular', 'angularjs', 'ng-'],
          'wordpress': ['wp-content', 'wordpress', 'wp-includes'],
          'shopify': ['shopify', 'myshopify'],
          'woocommerce': ['woocommerce', 'wc-'],
          'bootstrap': ['bootstrap', 'bs-'],
          'tailwind': ['tailwind', 'tw-'],
          'javascript': ['javascript', 'js', 'jquery'],
          'ecommerce': ['shop', 'cart', 'buy', 'price', 'product', 'checkout'],
          'blog': ['blog', 'post', 'article', 'author', 'published'],
          'portfolio': ['portfolio', 'work', 'projects', 'showcase'],
          'saas': ['saas', 'software', 'platform', 'api', 'dashboard'],
          'startup': ['startup', 'founder', 'funding', 'venture'],
          'ai': ['artificial intelligence', 'machine learning', 'ai', 'ml', 'neural'],
          'crypto': ['crypto', 'blockchain', 'bitcoin', 'ethereum', 'defi'],
          'fintech': ['fintech', 'finance', 'banking', 'payment', 'financial']
        };
        
        const pageHTML = document.documentElement.outerHTML.toLowerCase();
        const pageText = (title + ' ' + description + ' ' + contentText).toLowerCase();
        
        Object.entries(techIndicators).forEach(([tech, indicators]) => {
          const matches = indicators.filter(indicator =>
            pageHTML.includes(indicator) || pageText.includes(indicator)
          );
          
          if (matches.length > 0 && !tagSources.has(tech)) {
            const confidence = Math.min(0.8, 0.3 + (matches.length * 0.1));
            topicTags.push({ tag: tech, source: 'tech-detection', confidence });
            tagSources.add(tech);
          }
        });
        
        // Helper function to filter common words
        function isCommonWord(word) {
          const commonWords = new Set([
            'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'does', 'let', 'man', 'men', 'put', 'say', 'she', 'too', 'use', 'your', 'about', 'after', 'again', 'back', 'been', 'before', 'being', 'between', 'both', 'came', 'come', 'could', 'each', 'first', 'from', 'good', 'great', 'have', 'here', 'into', 'just', 'know', 'last', 'life', 'like', 'long', 'look', 'made', 'make', 'many', 'more', 'most', 'much', 'must', 'never', 'only', 'other', 'over', 'said', 'same', 'should', 'since', 'some', 'still', 'such', 'take', 'than', 'that', 'their', 'them', 'these', 'they', 'this', 'time', 'very', 'want', 'water', 'way', 'well', 'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'work', 'would', 'write', 'year', 'years', 'also', 'around', 'because', 'down', 'even', 'find', 'give', 'going', 'help', 'home', 'house', 'keep', 'left', 'might', 'move', 'need', 'number', 'part', 'place', 'right', 'seem', 'show', 'small', 'through', 'turn', 'under', 'until', 'without', 'world', 'always', 'another', 'away', 'become', 'began', 'call', 'came', 'every', 'found', 'hand', 'high', 'large', 'line', 'live', 'name', 'near', 'never', 'next', 'open', 'own', 'people', 'point', 'public', 'read', 'school', 'second', 'set', 'start', 'state', 'story', 'those', 'three', 'today', 'together', 'took', 'upon', 'used', 'using', 'want', 'ways', 'week', 'white', 'within', 'words', 'young'
          ]);
          return commonWords.has(word);
        }
        
        // Sort tags by confidence and limit to top 15
        const finalTags = topicTags
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 15)
          .map(item => ({
            tag: item.tag,
            source: item.source,
            confidence: Math.round(item.confidence * 100) / 100
          }));

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
          logos,
          favicons,
          navbarLinks,
          topicTags: finalTags,
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

      // Capture screenshots of navbar links if enabled
      if (this.enableScreenshots && metadata.navbarLinks?.length > 0) {
        metadata.screenshots = await this.captureNavbarScreenshots(page, metadata.navbarLinks, url);
      }

      return metadata;

    } catch (error) {
      throw new Error(`Failed to fetch metadata: ${error.message}`);
    } finally {
      await page.close();
    }
  }

  /**
   * Captures screenshots of navbar links
   * @param {Page} page - Puppeteer page instance
   * @param {Array} navbarLinks - Array of navbar link objects
   * @param {string} baseUrl - Base URL for generating unique filenames
   * @returns {Promise<Array>} Array of screenshot data
   */
  async captureNavbarScreenshots(page, navbarLinks, baseUrl) {
    const screenshots = [];
    const urlHash = this.generateUrlHash(baseUrl);
    
    try {
      for (let i = 0; i < Math.min(navbarLinks.length, this.maxNavbarLinks); i++) {
        const link = navbarLinks[i];
        
        try {
          // Highlight the link element for better screenshot
          await page.evaluate((linkData) => {
            const elements = document.querySelectorAll(linkData.selector);
            elements.forEach(el => {
              const rect = el.getBoundingClientRect();
              if (Math.abs(rect.left + rect.width / 2 - linkData.position.x) < 5 &&
                  Math.abs(rect.top + rect.height / 2 - linkData.position.y) < 5) {
                el.style.outline = '2px solid #007bff';
                el.style.outlineOffset = '2px';
              }
            });
          }, link);

          // Take screenshot of the specific element area
          const filename = `navbar-${urlHash}-${i + 1}-${this.sanitizeFilename(link.text)}.png`;
          const filepath = path.join(this.screenshotDir, filename);
          
          // Calculate screenshot area with padding
          const clip = {
            x: Math.max(0, link.position.x - link.position.width / 2 - 10),
            y: Math.max(0, link.position.y - link.position.height / 2 - 10),
            width: Math.min(this.viewport.width, link.position.width + 20),
            height: Math.min(this.viewport.height, link.position.height + 20)
          };

          await page.screenshot({
            path: filepath,
            clip: clip,
            type: 'png'
          });

          // Remove highlight
          await page.evaluate((linkData) => {
            const elements = document.querySelectorAll(linkData.selector);
            elements.forEach(el => {
              el.style.outline = '';
              el.style.outlineOffset = '';
            });
          }, link);

          screenshots.push({
            linkText: link.text,
            linkUrl: link.url,
            screenshotPath: filepath,
            screenshotUrl: `${this.screenshotBaseUrl}/${filename}`,
            position: link.position,
            index: i + 1
          });

        } catch (linkError) {
          console.warn(`Failed to capture screenshot for navbar link ${i + 1}:`, linkError.message);
        }
      }
    } catch (error) {
      console.error('Failed to capture navbar screenshots:', error.message);
    }

    return screenshots;
  }

  /**
   * Generates a hash from URL for unique filenames
   * @param {string} url - The URL to hash
   * @returns {string} URL hash
   */
  generateUrlHash(url) {
    return Buffer.from(url).toString('base64')
      .replace(/[+/=]/g, '')
      .substring(0, 8);
  }

  /**
   * Sanitizes filename by removing invalid characters
   * @param {string} filename - The filename to sanitize
   * @returns {string} Sanitized filename
   */
  sanitizeFilename(filename) {
    return filename
      .replace(/[^a-zA-Z0-9\-_]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 30)
      .toLowerCase();
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