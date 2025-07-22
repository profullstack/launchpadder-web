/**
 * Tests for Enhanced PuppeteerMetadataFetcher
 * Tests the enhanced logo detection, navbar link extraction, and screenshot functionality
 */

import { expect } from 'chai';
import { PuppeteerMetadataFetcher } from '../../src/lib/services/puppeteer-metadata-fetcher.js';
import { promises as fs } from 'fs';
import path from 'path';

describe('Enhanced PuppeteerMetadataFetcher', () => {
  let fetcher;
  const testScreenshotDir = path.join(process.cwd(), 'test', 'fixtures', 'screenshots');

  beforeEach(() => {
    fetcher = new PuppeteerMetadataFetcher({
      timeout: 10000,
      enableScreenshots: true,
      screenshotDir: testScreenshotDir,
      screenshotBaseUrl: '/test/screenshots',
      maxNavbarLinks: 5
    });
  });

  afterEach(async () => {
    await fetcher.cleanup();
    
    // Clean up test screenshots
    try {
      const files = await fs.readdir(testScreenshotDir);
      for (const file of files) {
        if (file.startsWith('navbar-')) {
          await fs.unlink(path.join(testScreenshotDir, file));
        }
      }
    } catch (error) {
      // Directory might not exist, ignore
    }
  });

  describe('Enhanced Logo Detection', () => {
    it('should detect logos with various selectors', async () => {
      // Create a simple HTML page with logo elements
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
          <meta name="description" content="Test page for logo detection">
        </head>
        <body>
          <header>
            <img src="/logo.png" alt="Company Logo" class="logo" width="100" height="50">
            <nav>
              <a href="/home">Home</a>
              <a href="/about">About</a>
              <a href="/contact">Contact</a>
            </nav>
          </header>
        </body>
        </html>
      `;

      // Write test HTML to a temporary file
      const testFile = path.join(process.cwd(), 'test-page.html');
      await fs.writeFile(testFile, testHtml);

      try {
        const metadata = await fetcher.fetchMetadata(`file://${testFile}`);
        
        // Test logo detection
        expect(metadata.logos).to.exist;
        expect(metadata.logos.sources).to.be.an('array');
        expect(metadata.logos.sources.length).to.be.greaterThan(0);
        
        const logo = metadata.logos.sources[0];
        expect(logo.url).to.include('logo.png');
        expect(logo.type).to.equal('class-logo');
        expect(logo.alt).to.equal('Company Logo');

        // Test navbar links detection
        expect(metadata.navbarLinks).to.exist;
        expect(metadata.navbarLinks).to.be.an('array');
        expect(metadata.navbarLinks.length).to.equal(3);
        
        const homeLink = metadata.navbarLinks.find(link => link.text === 'Home');
        expect(homeLink).to.exist;
        expect(homeLink.url).to.include('/home');
        expect(homeLink.position).to.exist;
        expect(homeLink.position.x).to.be.a('number');
        expect(homeLink.position.y).to.be.a('number');

      } finally {
        // Clean up test file
        await fs.unlink(testFile);
      }
    });
  });

  describe('Enhanced Favicon Detection', () => {
    it('should detect favicons with priority ordering', async () => {
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Page</title>
          <link rel="icon" href="/favicon.ico">
          <link rel="apple-touch-icon" href="/apple-icon.png">
          <link rel="shortcut icon" href="/shortcut.ico">
        </head>
        <body>
          <h1>Test Page</h1>
        </body>
        </html>
      `;

      const testFile = path.join(process.cwd(), 'test-favicon.html');
      await fs.writeFile(testFile, testHtml);

      try {
        const metadata = await fetcher.fetchMetadata(`file://${testFile}`);
        
        expect(metadata.favicons).to.exist;
        expect(metadata.favicons).to.be.an('array');
        expect(metadata.favicons.length).to.equal(3);
        
        // Should be sorted by priority (icon = 10, shortcut icon = 9, apple-touch-icon = 8)
        expect(metadata.favicons[0].type).to.equal('icon');
        expect(metadata.favicons[1].type).to.equal('shortcut icon');
        expect(metadata.favicons[2].type).to.equal('apple-touch-icon');

      } finally {
        await fs.unlink(testFile);
      }
    });
  });

  describe('Screenshot Functionality', () => {
    it('should generate unique filenames for screenshots', () => {
      const url1 = 'https://example.com';
      const url2 = 'https://test.com';
      
      const hash1 = fetcher.generateUrlHash(url1);
      const hash2 = fetcher.generateUrlHash(url2);
      
      expect(hash1).to.be.a('string');
      expect(hash2).to.be.a('string');
      expect(hash1).to.not.equal(hash2);
      expect(hash1.length).to.equal(8);
    });

    it('should sanitize filenames correctly', () => {
      const testCases = [
        { input: 'Home Page!', expected: 'home-page-' },
        { input: 'About Us & Contact', expected: 'about-us---contact' },
        { input: 'Very Long Navigation Link Text That Should Be Truncated', expected: 'very-long-navigation-link-text-' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = fetcher.sanitizeFilename(input);
        expect(result).to.equal(expected);
        expect(result.length).to.be.at.most(30);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid URLs gracefully', async () => {
      try {
        await fetcher.fetchMetadata('invalid-url');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Invalid URL format');
      }
    });

    it('should handle screenshot failures gracefully', async () => {
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <nav>
            <a href="/test">Test Link</a>
          </nav>
        </body>
        </html>
      `;

      const testFile = path.join(process.cwd(), 'test-screenshot.html');
      await fs.writeFile(testFile, testHtml);

      try {
        // Create fetcher with invalid screenshot directory to test error handling
        const invalidFetcher = new PuppeteerMetadataFetcher({
          enableScreenshots: true,
          screenshotDir: '/invalid/path/that/does/not/exist'
        });

        const metadata = await invalidFetcher.fetchMetadata(`file://${testFile}`);
        
        // Should still return metadata even if screenshots fail
        expect(metadata.navbarLinks).to.exist;
        expect(metadata.navbarLinks.length).to.equal(1);
        
        await invalidFetcher.cleanup();

      } finally {
        await fs.unlink(testFile);
      }
    });
  });
});