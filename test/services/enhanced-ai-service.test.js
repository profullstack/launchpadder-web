/**
 * Test suite for Enhanced AI Service
 * Using Mocha + Chai for testing
 */

import { expect } from 'chai';
import { EnhancedAIService } from '../../src/lib/services/enhanced-ai-service.js';

describe('EnhancedAIService', () => {
  let aiService;
  let mockAIRewriter;

  beforeEach(() => {
    // Mock AI rewriter to avoid OpenAI API calls in tests
    mockAIRewriter = {
      rewriteMetadata: async (metadata) => ({
        title: `Enhanced ${metadata.title}`,
        description: `Improved ${metadata.description}`,
        tags: ['enhanced', 'ai-generated']
      })
    };

    aiService = new EnhancedAIService({
      aiRewriter: mockAIRewriter
    });
  });

  describe('constructor', () => {
    it('should create an instance with default options', () => {
      const service = new EnhancedAIService({
        aiRewriter: mockAIRewriter
      });
      
      expect(service).to.be.an.instanceOf(EnhancedAIService);
      expect(service.enableContentAnalysis).to.be.true;
      expect(service.enableSEOOptimization).to.be.true;
      expect(service.enableSentimentAnalysis).to.be.true;
      expect(service.enableCategoryDetection).to.be.true;
    });

    it('should accept custom options', () => {
      const service = new EnhancedAIService({
        aiRewriter: mockAIRewriter,
        enableContentAnalysis: false,
        enableSEOOptimization: false,
        enableSentimentAnalysis: true,
        enableCategoryDetection: true
      });
      
      expect(service.enableContentAnalysis).to.be.false;
      expect(service.enableSEOOptimization).to.be.false;
      expect(service.enableSentimentAnalysis).to.be.true;
      expect(service.enableCategoryDetection).to.be.true;
    });
  });

  describe('enhanceMetadata', () => {
    const sampleMetadata = {
      title: 'Amazing Productivity App',
      description: 'This is an amazing productivity application that helps you manage tasks efficiently and boost your workflow.',
      url: 'https://example.com/app'
    };

    it('should enhance metadata with all AI features', async () => {
      const enhanced = await aiService.enhanceMetadata(sampleMetadata);
      
      expect(enhanced).to.have.property('title');
      expect(enhanced).to.have.property('description');
      expect(enhanced).to.have.property('tags');
      expect(enhanced).to.have.property('original');
      expect(enhanced).to.have.property('aiEnhancements');
      
      expect(enhanced.title).to.include('Enhanced');
      expect(enhanced.original).to.deep.equal(sampleMetadata);
      expect(enhanced.aiEnhancements).to.have.property('timestamp');
      expect(enhanced.aiEnhancements).to.have.property('contentAnalysis');
      expect(enhanced.aiEnhancements).to.have.property('seoOptimization');
      expect(enhanced.aiEnhancements).to.have.property('sentiment');
      expect(enhanced.aiEnhancements).to.have.property('category');
    });

    it('should allow selective enhancement features', async () => {
      const enhanced = await aiService.enhanceMetadata(sampleMetadata, {
        includeAnalysis: true,
        includeSEO: false,
        includeSentiment: false,
        includeCategory: false
      });
      
      expect(enhanced.aiEnhancements).to.have.property('contentAnalysis');
      expect(enhanced.aiEnhancements).to.not.have.property('seoOptimization');
      expect(enhanced.aiEnhancements).to.not.have.property('sentiment');
      expect(enhanced.aiEnhancements).to.not.have.property('category');
    });
  });

  describe('analyzeContent', () => {
    it('should analyze content readability and keywords', async () => {
      const metadata = {
        title: 'Test App',
        description: 'This is a comprehensive test application designed to help developers create amazing software solutions.'
      };

      const analysis = await aiService.analyzeContent(metadata);
      
      expect(analysis).to.have.property('readabilityScore');
      expect(analysis).to.have.property('keywordDensity');
      expect(analysis).to.have.property('contentLength');
      expect(analysis).to.have.property('uniquenessScore');
      expect(analysis).to.have.property('completeness');
      
      expect(analysis.readabilityScore).to.have.property('score');
      expect(analysis.readabilityScore).to.have.property('level');
      expect(analysis.keywordDensity).to.have.property('keywords');
      expect(analysis.contentLength.title).to.be.a('number');
      expect(analysis.contentLength.description).to.be.a('number');
    });

    it('should handle empty content gracefully', async () => {
      const metadata = { title: '', description: '' };
      const analysis = await aiService.analyzeContent(metadata);
      
      expect(analysis.readabilityScore.score).to.equal(0);
      expect(analysis.keywordDensity.keywords).to.be.an('array').that.is.empty;
      expect(analysis.contentLength.title).to.equal(0);
      expect(analysis.contentLength.description).to.equal(0);
    });
  });

  describe('optimizeForSEO', () => {
    it('should provide SEO optimization suggestions', async () => {
      const metadata = {
        title: 'Great App',
        description: 'This app is great for productivity and helps users manage their tasks effectively.'
      };

      const seo = await aiService.optimizeForSEO(metadata);
      
      expect(seo).to.have.property('titleOptimization');
      expect(seo).to.have.property('descriptionOptimization');
      expect(seo).to.have.property('keywordSuggestions');
      expect(seo).to.have.property('metaTagSuggestions');
      expect(seo).to.have.property('structuredDataSuggestions');
      
      expect(seo.titleOptimization).to.have.property('suggestions');
      expect(seo.titleOptimization).to.have.property('score');
      expect(seo.descriptionOptimization).to.have.property('suggestions');
      expect(seo.keywordSuggestions).to.be.an('array');
    });

    it('should suggest improvements for short titles', async () => {
      const metadata = { title: 'App', description: 'Short description' };
      const seo = await aiService.optimizeForSEO(metadata);
      
      expect(seo.titleOptimization.suggestions).to.include.members([
        'Consider making the title longer (30-60 characters optimal)'
      ]);
    });

    it('should suggest improvements for long titles', async () => {
      const metadata = { 
        title: 'This is a very long title that exceeds the recommended length for SEO optimization and should be shortened',
        description: 'Description'
      };
      const seo = await aiService.optimizeForSEO(metadata);
      
      expect(seo.titleOptimization.suggestions).to.include.members([
        'Consider shortening the title (30-60 characters optimal)'
      ]);
    });
  });

  describe('analyzeSentiment', () => {
    it('should analyze positive sentiment', async () => {
      const metadata = {
        title: 'Amazing Fantastic App',
        description: 'This is an excellent and wonderful application that users love and find incredible.'
      };

      const sentiment = await aiService.analyzeSentiment(metadata);
      
      expect(sentiment).to.have.property('overall');
      expect(sentiment).to.have.property('confidence');
      expect(sentiment).to.have.property('emotions');
      expect(sentiment).to.have.property('tone');
      expect(sentiment).to.have.property('recommendations');
      
      expect(sentiment.overall).to.equal('positive');
      expect(sentiment.confidence).to.be.a('number');
      expect(sentiment.emotions).to.have.property('positive');
      expect(sentiment.emotions).to.have.property('negative');
    });

    it('should analyze negative sentiment', async () => {
      const metadata = {
        title: 'Terrible Awful App',
        description: 'This is a horrible and disappointing application that users hate and find useless.'
      };

      const sentiment = await aiService.analyzeSentiment(metadata);
      
      expect(sentiment.overall).to.equal('negative');
      expect(sentiment.emotions.negative).to.be.greaterThan(0);
    });

    it('should handle neutral content', async () => {
      const metadata = {
        title: 'Standard App',
        description: 'This is a regular application for managing data and information.'
      };

      const sentiment = await aiService.analyzeSentiment(metadata);
      
      expect(sentiment.overall).to.equal('neutral');
    });
  });

  describe('detectCategory', () => {
    it('should detect productivity category', async () => {
      const metadata = {
        title: 'Task Manager Pro',
        description: 'Organize your tasks and boost productivity with efficient workflow management.'
      };

      const category = await aiService.detectCategory(metadata);
      
      expect(category).to.have.property('primary');
      expect(category).to.have.property('secondary');
      expect(category).to.have.property('confidence');
      expect(category).to.have.property('tags');
      expect(category).to.have.property('industry');
      
      expect(category.primary).to.equal('productivity');
      expect(category.tags).to.include('productivity');
    });

    it('should detect development category', async () => {
      const metadata = {
        title: 'Code Editor Plus',
        description: 'Advanced code editor for developers with API integration and framework support.'
      };

      const category = await aiService.detectCategory(metadata);
      
      expect(category.primary).to.equal('development');
    });

    it('should handle unknown categories', async () => {
      const metadata = {
        title: 'Random Thing',
        description: 'Something completely unrelated to any known category.'
      };

      const category = await aiService.detectCategory(metadata);
      
      expect(category.primary).to.equal('general');
    });
  });

  describe('calculateReadabilityScore', () => {
    it('should calculate readability for simple text', () => {
      const text = 'This is a simple sentence. It is easy to read.';
      const score = aiService.calculateReadabilityScore(text);
      
      expect(score).to.have.property('score');
      expect(score).to.have.property('level');
      expect(score).to.have.property('avgWordsPerSentence');
      expect(score.score).to.be.a('number');
      expect(score.level).to.be.a('string');
    });

    it('should handle empty text', () => {
      const score = aiService.calculateReadabilityScore('');
      
      expect(score.score).to.equal(0);
      expect(score.level).to.equal('unknown');
    });

    it('should calculate readability for complex text', () => {
      const text = 'This is an extraordinarily complicated sentence with multisyllabic words that significantly increases the complexity and difficulty of comprehension for average readers.';
      const score = aiService.calculateReadabilityScore(text);
      
      expect(score.score).to.be.lessThan(70); // Should be more difficult
    });
  });

  describe('countSyllables', () => {
    it('should count syllables correctly', () => {
      expect(aiService.countSyllables('cat')).to.equal(1);
      expect(aiService.countSyllables('hello')).to.equal(2);
      expect(aiService.countSyllables('beautiful')).to.equal(3);
      expect(aiService.countSyllables('application')).to.equal(4);
    });

    it('should handle edge cases', () => {
      expect(aiService.countSyllables('a')).to.equal(1);
      expect(aiService.countSyllables('the')).to.equal(1);
      expect(aiService.countSyllables('queue')).to.equal(1);
    });
  });

  describe('analyzeKeywordDensity', () => {
    it('should analyze keyword frequency', () => {
      const text = 'productivity app helps productivity users manage productivity tasks efficiently';
      const analysis = aiService.analyzeKeywordDensity(text);
      
      expect(analysis).to.have.property('keywords');
      expect(analysis).to.have.property('totalWords');
      expect(analysis).to.have.property('uniqueWords');
      
      expect(analysis.keywords).to.be.an('array');
      expect(analysis.keywords[0]).to.have.property('word');
      expect(analysis.keywords[0]).to.have.property('count');
      expect(analysis.keywords[0]).to.have.property('density');
    });

    it('should handle empty text', () => {
      const analysis = aiService.analyzeKeywordDensity('');
      
      expect(analysis.keywords).to.be.an('array').that.is.empty;
      expect(analysis.totalWords).to.equal(0);
      expect(analysis.uniqueWords).to.equal(0);
    });
  });

  describe('estimateUniqueness', () => {
    it('should calculate uniqueness ratio', () => {
      const metadata = {
        title: 'Unique Title',
        description: 'This description has many different words without repetition.'
      };
      
      const uniqueness = aiService.estimateUniqueness(metadata);
      
      expect(uniqueness).to.have.property('score');
      expect(uniqueness).to.have.property('level');
      expect(uniqueness).to.have.property('uniqueWords');
      expect(uniqueness).to.have.property('totalWords');
      
      expect(uniqueness.score).to.be.a('number');
      expect(['high', 'medium', 'low']).to.include(uniqueness.level);
    });

    it('should detect low uniqueness with repetitive text', () => {
      const metadata = {
        title: 'Test Test Test',
        description: 'Test test test test test test test test.'
      };
      
      const uniqueness = aiService.estimateUniqueness(metadata);
      
      expect(uniqueness.level).to.equal('low');
    });
  });

  describe('assessCompleteness', () => {
    it('should assess complete metadata', () => {
      const metadata = {
        title: 'Complete App',
        description: 'Full description',
        url: 'https://example.com',
        image: 'https://example.com/image.jpg',
        favicon: 'https://example.com/favicon.ico',
        openGraph: { title: 'OG Title' },
        twitter: { card: 'summary' }
      };
      
      const completeness = aiService.assessCompleteness(metadata);
      
      expect(completeness).to.have.property('score');
      expect(completeness).to.have.property('fields');
      expect(completeness).to.have.property('completedFields');
      expect(completeness).to.have.property('totalFields');
      
      expect(completeness.score).to.equal(100);
      expect(completeness.completedFields).to.equal(completeness.totalFields);
    });

    it('should assess incomplete metadata', () => {
      const metadata = {
        title: 'Incomplete App'
      };
      
      const completeness = aiService.assessCompleteness(metadata);
      
      expect(completeness.score).to.be.lessThan(100);
      expect(completeness.completedFields).to.be.lessThan(completeness.totalFields);
    });
  });

  describe('optimizeTitle', () => {
    it('should optimize title length', () => {
      const shortTitle = 'App';
      const optimization = aiService.optimizeTitle(shortTitle);
      
      expect(optimization.suggestions).to.include('Consider making the title longer (30-60 characters optimal)');
      expect(optimization.optimal).to.be.false;
    });

    it('should approve optimal title', () => {
      const optimalTitle = 'Amazing Productivity App for Task Management';
      const optimization = aiService.optimizeTitle(optimalTitle);
      
      expect(optimization.optimal).to.be.true;
      expect(optimization.score).to.be.at.least(80);
    });
  });

  describe('optimizeDescription', () => {
    it('should optimize description length', () => {
      const shortDesc = 'Short description';
      const optimization = aiService.optimizeDescription(shortDesc);
      
      expect(optimization.suggestions).to.include('Consider making the description longer (120-160 characters optimal)');
      expect(optimization.optimal).to.be.false;
    });

    it('should approve optimal description', () => {
      const optimalDesc = 'This is an optimal description that falls within the recommended character range for SEO purposes and provides clear value.';
      const optimization = aiService.optimizeDescription(optimalDesc);
      
      expect(optimization.optimal).to.be.true;
      expect(optimization.score).to.be.at.least(75);
    });
  });

  describe('generateKeywordSuggestions', () => {
    it('should generate relevant keywords', () => {
      const metadata = {
        title: 'Productivity Task Manager',
        description: 'Manage your tasks and boost productivity with this amazing application.'
      };
      
      const keywords = aiService.generateKeywordSuggestions(metadata);
      
      expect(keywords).to.be.an('array');
      expect(keywords.length).to.be.at.most(5);
      expect(keywords).to.include('productivity');
    });
  });

  describe('calculateSentiment', () => {
    it('should detect positive sentiment', () => {
      const text = 'This is amazing and excellent and fantastic';
      const sentiment = aiService.calculateSentiment(text);
      
      expect(sentiment.overall).to.equal('positive');
      expect(sentiment.confidence).to.be.greaterThan(0);
    });

    it('should detect negative sentiment', () => {
      const text = 'This is terrible and awful and horrible';
      const sentiment = aiService.calculateSentiment(text);
      
      expect(sentiment.overall).to.equal('negative');
      expect(sentiment.confidence).to.be.greaterThan(0);
    });

    it('should handle neutral text', () => {
      const text = 'This is a regular application for data management';
      const sentiment = aiService.calculateSentiment(text);
      
      expect(sentiment.overall).to.equal('neutral');
    });
  });

  describe('classifyContent', () => {
    it('should classify productivity content', () => {
      const metadata = {
        title: 'Task Manager',
        description: 'Organize tasks and manage workflow efficiently'
      };
      
      const classification = aiService.classifyContent(metadata);
      
      expect(classification.primary).to.equal('productivity');
      expect(classification.suggestedTags).to.include('productivity');
    });

    it('should classify development content', () => {
      const metadata = {
        title: 'Code Editor',
        description: 'Programming tool for developers with API support'
      };
      
      const classification = aiService.classifyContent(metadata);
      
      expect(classification.primary).to.equal('development');
    });

    it('should handle unclassifiable content', () => {
      const metadata = {
        title: 'Random Thing',
        description: 'Something unrelated to any category'
      };
      
      const classification = aiService.classifyContent(metadata);
      
      expect(classification.primary).to.equal('general');
      expect(classification.confidence).to.equal(0);
    });
  });

  describe('cleanup', () => {
    it('should cleanup without errors', async () => {
      try {
        await aiService.cleanup();
        expect(true).to.be.true; // Test passes if no error is thrown
      } catch (error) {
        expect.fail(`Cleanup should not throw errors: ${error.message}`);
      }
    });
  });
});