import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';

// Mock browser environment
global.window = {
  localStorage: {
    getItem: sinon.stub(),
    setItem: sinon.stub(),
    removeItem: sinon.stub()
  },
  navigator: {
    language: 'en-US',
    languages: ['en-US', 'en']
  }
};

global.document = {
  documentElement: {
    lang: 'en',
    dir: 'ltr'
  }
};

// Mock browser detection
const mockBrowser = { browser: true };

// Import the functions to test
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_METADATA,
  validateLocale,
  detectLocaleFromPath,
  getLocalizedPath,
  removeLocaleFromPath,
  getCurrentLocale
} from '../../src/lib/i18n/index.js';

describe('i18n Core Functions', () => {
  beforeEach(() => {
    // Reset localStorage stubs
    global.window.localStorage.getItem.reset();
    global.window.localStorage.setItem.reset();
    global.window.localStorage.removeItem.reset();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Constants', () => {
    it('should have correct supported locales', () => {
      expect(SUPPORTED_LOCALES).to.be.an('array');
      expect(SUPPORTED_LOCALES).to.include('en');
      expect(SUPPORTED_LOCALES).to.include('es');
      expect(SUPPORTED_LOCALES).to.include('fr');
      expect(SUPPORTED_LOCALES).to.include('de');
    });

    it('should have correct default locale', () => {
      expect(DEFAULT_LOCALE).to.equal('en');
    });

    it('should have locale metadata for all supported locales', () => {
      SUPPORTED_LOCALES.forEach(locale => {
        expect(LOCALE_METADATA).to.have.property(locale);
        expect(LOCALE_METADATA[locale]).to.have.property('name');
        expect(LOCALE_METADATA[locale]).to.have.property('nativeName');
        expect(LOCALE_METADATA[locale]).to.have.property('flag');
        expect(LOCALE_METADATA[locale]).to.have.property('dir');
      });
    });
  });

  describe('validateLocale', () => {
    it('should return valid locale for supported language', () => {
      expect(validateLocale('en')).to.equal('en');
      expect(validateLocale('es')).to.equal('es');
      expect(validateLocale('fr')).to.equal('fr');
      expect(validateLocale('de')).to.equal('de');
    });

    it('should return default locale for unsupported language', () => {
      expect(validateLocale('zh')).to.equal(DEFAULT_LOCALE);
      expect(validateLocale('ar')).to.equal(DEFAULT_LOCALE);
      expect(validateLocale('invalid')).to.equal(DEFAULT_LOCALE);
    });

    it('should handle locale with country code', () => {
      expect(validateLocale('en-US')).to.equal('en');
      expect(validateLocale('es-ES')).to.equal('es');
      expect(validateLocale('fr-FR')).to.equal('fr');
      expect(validateLocale('de-DE')).to.equal('de');
    });

    it('should handle invalid input', () => {
      expect(validateLocale(null)).to.equal(DEFAULT_LOCALE);
      expect(validateLocale(undefined)).to.equal(DEFAULT_LOCALE);
      expect(validateLocale('')).to.equal(DEFAULT_LOCALE);
      expect(validateLocale(123)).to.equal(DEFAULT_LOCALE);
    });

    it('should be case insensitive', () => {
      expect(validateLocale('EN')).to.equal('en');
      expect(validateLocale('Es')).to.equal('es');
      expect(validateLocale('FR')).to.equal('fr');
    });
  });

  describe('detectLocaleFromPath', () => {
    it('should detect locale from valid path', () => {
      expect(detectLocaleFromPath('/en/home')).to.equal('en');
      expect(detectLocaleFromPath('/es/inicio')).to.equal('es');
      expect(detectLocaleFromPath('/fr/accueil')).to.equal('fr');
      expect(detectLocaleFromPath('/de/startseite')).to.equal('de');
    });

    it('should return null for path without locale', () => {
      expect(detectLocaleFromPath('/home')).to.be.null;
      expect(detectLocaleFromPath('/about')).to.be.null;
      expect(detectLocaleFromPath('/contact')).to.be.null;
    });

    it('should return null for root path', () => {
      expect(detectLocaleFromPath('/')).to.be.null;
      expect(detectLocaleFromPath('')).to.be.null;
    });

    it('should return null for unsupported locale', () => {
      expect(detectLocaleFromPath('/zh/home')).to.be.null;
      expect(detectLocaleFromPath('/ar/home')).to.be.null;
    });

    it('should handle edge cases', () => {
      expect(detectLocaleFromPath(null)).to.be.null;
      expect(detectLocaleFromPath(undefined)).to.be.null;
    });
  });

  describe('getLocalizedPath', () => {
    it('should return original path for default locale', () => {
      expect(getLocalizedPath('/home', 'en')).to.equal('/home');
      expect(getLocalizedPath('/', 'en')).to.equal('/');
      expect(getLocalizedPath('/about', 'en')).to.equal('/about');
    });

    it('should add locale prefix for non-default locales', () => {
      expect(getLocalizedPath('/home', 'es')).to.equal('/es/home');
      expect(getLocalizedPath('/about', 'fr')).to.equal('/fr/about');
      expect(getLocalizedPath('/contact', 'de')).to.equal('/de/contact');
    });

    it('should handle root path correctly', () => {
      expect(getLocalizedPath('/', 'es')).to.equal('/es');
      expect(getLocalizedPath('/', 'fr')).to.equal('/fr');
      expect(getLocalizedPath('/', 'de')).to.equal('/de');
    });

    it('should remove existing locale prefix', () => {
      expect(getLocalizedPath('/fr/home', 'es')).to.equal('/es/home');
      expect(getLocalizedPath('/de/about', 'fr')).to.equal('/fr/about');
      expect(getLocalizedPath('/es/contact', 'en')).to.equal('/contact');
    });

    it('should validate locale input', () => {
      expect(getLocalizedPath('/home', 'invalid')).to.equal('/home');
      expect(getLocalizedPath('/home', null)).to.equal('/home');
      expect(getLocalizedPath('/home', undefined)).to.equal('/home');
    });
  });

  describe('removeLocaleFromPath', () => {
    it('should remove locale prefix from path', () => {
      expect(removeLocaleFromPath('/en/home')).to.equal('/home');
      expect(removeLocaleFromPath('/es/inicio')).to.equal('/inicio');
      expect(removeLocaleFromPath('/fr/accueil')).to.equal('/accueil');
      expect(removeLocaleFromPath('/de/startseite')).to.equal('/startseite');
    });

    it('should handle root locale paths', () => {
      expect(removeLocaleFromPath('/en')).to.equal('/');
      expect(removeLocaleFromPath('/es')).to.equal('/');
      expect(removeLocaleFromPath('/fr')).to.equal('/');
      expect(removeLocaleFromPath('/de')).to.equal('/');
    });

    it('should return original path if no locale prefix', () => {
      expect(removeLocaleFromPath('/home')).to.equal('/home');
      expect(removeLocaleFromPath('/about')).to.equal('/about');
      expect(removeLocaleFromPath('/')).to.equal('/');
    });

    it('should handle invalid locale prefixes', () => {
      expect(removeLocaleFromPath('/zh/home')).to.equal('/home');
      expect(removeLocaleFromPath('/ar/about')).to.equal('/about');
    });
  });

  describe('getCurrentLocale', () => {
    it('should return stored locale from localStorage', () => {
      global.window.localStorage.getItem.withArgs('locale').returns('es');
      expect(getCurrentLocale()).to.equal('es');
    });

    it('should return browser language if no stored locale', () => {
      global.window.localStorage.getItem.withArgs('locale').returns(null);
      global.window.navigator.language = 'fr-FR';
      expect(getCurrentLocale()).to.equal('fr');
    });

    it('should return default locale if browser language unsupported', () => {
      global.window.localStorage.getItem.withArgs('locale').returns(null);
      global.window.navigator.language = 'zh-CN';
      expect(getCurrentLocale()).to.equal(DEFAULT_LOCALE);
    });

    it('should handle missing navigator', () => {
      global.window.localStorage.getItem.withArgs('locale').returns(null);
      const originalNavigator = global.window.navigator;
      global.window.navigator = undefined;
      
      expect(getCurrentLocale()).to.equal(DEFAULT_LOCALE);
      
      global.window.navigator = originalNavigator;
    });

    it('should validate stored locale', () => {
      global.window.localStorage.getItem.withArgs('locale').returns('invalid');
      expect(getCurrentLocale()).to.equal(DEFAULT_LOCALE);
    });
  });
});