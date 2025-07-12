/**
 * Enhanced AI Service
 * Provides comprehensive AI-powered features for the launch platform
 * including content generation, analysis, and optimization
 */

import { createAIRewriter } from './ai-rewriter.js';

export class EnhancedAIService {
  constructor(options = {}) {
    this.aiRewriter = options.aiRewriter || createAIRewriter(options);
    this.enableContentAnalysis = options.enableContentAnalysis ?? true;
    this.enableSEOOptimization = options.enableSEOOptimization ?? true;
    this.enableSentimentAnalysis = options.enableSentimentAnalysis ?? true;
    this.enableCategoryDetection = options.enableCategoryDetection ?? true;
  }

  /**
   * Comprehensive metadata enhancement with AI
   * @param {Object} originalMetadata - The original metadata
   * @param {Object} options - Enhancement options
   * @returns {Promise<Object>} Enhanced metadata with AI insights
   */
  async enhanceMetadata(originalMetadata, options = {}) {
    const {
      includeAnalysis = true,
      includeSEO = true,
      includeSentiment = true,
      includeCategory = true
    } = options;

    // Start with basic AI rewriting
    const rewrittenMetadata = await this.aiRewriter.rewriteMetadata(originalMetadata);

    const enhanced = {
      ...rewrittenMetadata,
      original: originalMetadata,
      aiEnhancements: {
        timestamp: new Date().toISOString(),
        version: '1.0'
      }
    };

    // Add content analysis
    if (includeAnalysis && this.enableContentAnalysis) {
      enhanced.aiEnhancements.contentAnalysis = await this.analyzeContent(originalMetadata);
    }

    // Add SEO optimization
    if (includeSEO && this.enableSEOOptimization) {
      enhanced.aiEnhancements.seoOptimization = await this.optimizeForSEO(enhanced);
    }

    // Add sentiment analysis
    if (includeSentiment && this.enableSentimentAnalysis) {
      enhanced.aiEnhancements.sentiment = await this.analyzeSentiment(originalMetadata);
    }

    // Add category detection
    if (includeCategory && this.enableCategoryDetection) {
      enhanced.aiEnhancements.category = await this.detectCategory(originalMetadata);
    }

    return enhanced;
  }

  /**
   * Analyzes content for key insights
   * @param {Object} metadata - The metadata to analyze
   * @returns {Promise<Object>} Content analysis results
   */
  async analyzeContent(metadata) {
    try {
      const analysis = {
        readabilityScore: this.calculateReadabilityScore(metadata.description || ''),
        keywordDensity: this.analyzeKeywordDensity(metadata.description || ''),
        contentLength: {
          title: metadata.title?.length || 0,
          description: metadata.description?.length || 0
        },
        uniquenessScore: this.estimateUniqueness(metadata),
        completeness: this.assessCompleteness(metadata)
      };

      return analysis;
    } catch (error) {
      console.warn('Content analysis failed:', error.message);
      return { error: 'Analysis unavailable' };
    }
  }

  /**
   * Optimizes content for SEO
   * @param {Object} metadata - The metadata to optimize
   * @returns {Promise<Object>} SEO optimization suggestions
   */
  async optimizeForSEO(metadata) {
    try {
      const seo = {
        titleOptimization: this.optimizeTitle(metadata.title),
        descriptionOptimization: this.optimizeDescription(metadata.description),
        keywordSuggestions: this.generateKeywordSuggestions(metadata),
        metaTagSuggestions: this.generateMetaTags(metadata),
        structuredDataSuggestions: this.generateStructuredData(metadata)
      };

      return seo;
    } catch (error) {
      console.warn('SEO optimization failed:', error.message);
      return { error: 'SEO analysis unavailable' };
    }
  }

  /**
   * Analyzes sentiment of the content
   * @param {Object} metadata - The metadata to analyze
   * @returns {Promise<Object>} Sentiment analysis results
   */
  async analyzeSentiment(metadata) {
    try {
      const text = `${metadata.title || ''} ${metadata.description || ''}`;
      const sentiment = this.calculateSentiment(text);
      
      return {
        overall: sentiment.overall,
        confidence: sentiment.confidence,
        emotions: sentiment.emotions,
        tone: sentiment.tone,
        recommendations: this.generateSentimentRecommendations(sentiment)
      };
    } catch (error) {
      console.warn('Sentiment analysis failed:', error.message);
      return { error: 'Sentiment analysis unavailable' };
    }
  }

  /**
   * Detects the category/industry of the product
   * @param {Object} metadata - The metadata to analyze
   * @returns {Promise<Object>} Category detection results
   */
  async detectCategory(metadata) {
    try {
      const categories = this.classifyContent(metadata);
      
      return {
        primary: categories.primary,
        secondary: categories.secondary,
        confidence: categories.confidence,
        tags: categories.suggestedTags,
        industry: categories.industry
      };
    } catch (error) {
      console.warn('Category detection failed:', error.message);
      return { error: 'Category detection unavailable' };
    }
  }

  /**
   * Calculates readability score using simplified metrics
   * @param {string} text - Text to analyze
   * @returns {Object} Readability metrics
   */
  calculateReadabilityScore(text) {
    if (!text) return { score: 0, level: 'unknown' };

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);
    const avgSyllablesPerWord = words.reduce((sum, word) => sum + this.countSyllables(word), 0) / Math.max(words.length, 1);

    // Simplified Flesch Reading Ease approximation
    const score = Math.max(0, Math.min(100, 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord)));
    
    let level;
    if (score >= 90) level = 'very easy';
    else if (score >= 80) level = 'easy';
    else if (score >= 70) level = 'fairly easy';
    else if (score >= 60) level = 'standard';
    else if (score >= 50) level = 'fairly difficult';
    else if (score >= 30) level = 'difficult';
    else level = 'very difficult';

    return { score: Math.round(score), level, avgWordsPerSentence: Math.round(avgWordsPerSentence) };
  }

  /**
   * Counts syllables in a word (simplified)
   * @param {string} word - Word to count syllables for
   * @returns {number} Estimated syllable count
   */
  countSyllables(word) {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    
    const vowels = 'aeiouy';
    let count = 0;
    let previousWasVowel = false;
    
    for (let i = 0; i < word.length; i++) {
      const isVowel = vowels.includes(word[i]);
      if (isVowel && !previousWasVowel) count++;
      previousWasVowel = isVowel;
    }
    
    if (word.endsWith('e')) count--;
    return Math.max(1, count);
  }

  /**
   * Analyzes keyword density
   * @param {string} text - Text to analyze
   * @returns {Object} Keyword density analysis
   */
  analyzeKeywordDensity(text) {
    if (!text) return { keywords: [], totalWords: 0, uniqueWords: 0 };

    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);

    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    const sortedKeywords = Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word, count]) => ({
        word,
        count,
        density: ((count / words.length) * 100).toFixed(2)
      }));

    return {
      keywords: sortedKeywords,
      totalWords: words.length,
      uniqueWords: Object.keys(frequency).length
    };
  }

  /**
   * Estimates content uniqueness
   * @param {Object} metadata - Metadata to analyze
   * @returns {Object} Uniqueness assessment
   */
  estimateUniqueness(metadata) {
    const text = `${metadata.title || ''} ${metadata.description || ''}`;
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const uniqueWords = new Set(words);
    
    const uniquenessRatio = uniqueWords.size / Math.max(words.length, 1);
    const score = Math.round(uniquenessRatio * 100);
    
    let level;
    if (score >= 80) level = 'high';
    else if (score >= 60) level = 'medium';
    else level = 'low';

    return { score, level, uniqueWords: uniqueWords.size, totalWords: words.length };
  }

  /**
   * Assesses metadata completeness
   * @param {Object} metadata - Metadata to assess
   * @returns {Object} Completeness assessment
   */
  assessCompleteness(metadata) {
    const fields = {
      title: !!metadata.title,
      description: !!metadata.description,
      url: !!metadata.url,
      image: !!(metadata.image || metadata.images?.length),
      favicon: !!metadata.favicon,
      openGraph: !!metadata.openGraph,
      twitter: !!metadata.twitter
    };

    const completedFields = Object.values(fields).filter(Boolean).length;
    const totalFields = Object.keys(fields).length;
    const score = Math.round((completedFields / totalFields) * 100);

    return { score, fields, completedFields, totalFields };
  }

  /**
   * Optimizes title for SEO
   * @param {string} title - Title to optimize
   * @returns {Object} Title optimization suggestions
   */
  optimizeTitle(title) {
    if (!title) return { suggestions: ['Add a title'], score: 0 };

    const suggestions = [];
    const length = title.length;
    
    if (length < 30) suggestions.push('Consider making the title longer (30-60 characters optimal)');
    if (length > 60) suggestions.push('Consider shortening the title (30-60 characters optimal)');
    if (!title.match(/[A-Z]/)) suggestions.push('Consider capitalizing important words');
    if (!title.includes('|') && !title.includes('-')) suggestions.push('Consider adding brand or category separator');

    const score = Math.max(0, 100 - (suggestions.length * 20));
    return { suggestions, score, length, optimal: length >= 30 && length <= 60 };
  }

  /**
   * Optimizes description for SEO
   * @param {string} description - Description to optimize
   * @returns {Object} Description optimization suggestions
   */
  optimizeDescription(description) {
    if (!description) return { suggestions: ['Add a description'], score: 0 };

    const suggestions = [];
    const length = description.length;
    
    if (length < 120) suggestions.push('Consider making the description longer (120-160 characters optimal)');
    if (length > 160) suggestions.push('Consider shortening the description (120-160 characters optimal)');
    if (!description.includes('.')) suggestions.push('Consider adding proper punctuation');
    if (!description.match(/\b(get|try|discover|learn|find)\b/i)) suggestions.push('Consider adding action words');

    const score = Math.max(0, 100 - (suggestions.length * 25));
    return { suggestions, score, length, optimal: length >= 120 && length <= 160 };
  }

  /**
   * Generates keyword suggestions
   * @param {Object} metadata - Metadata to analyze
   * @returns {Array} Keyword suggestions
   */
  generateKeywordSuggestions(metadata) {
    const text = `${metadata.title || ''} ${metadata.description || ''}`;
    const analysis = this.analyzeKeywordDensity(text);
    
    return analysis.keywords.slice(0, 5).map(k => k.word);
  }

  /**
   * Generates meta tag suggestions
   * @param {Object} metadata - Metadata to analyze
   * @returns {Object} Meta tag suggestions
   */
  generateMetaTags(metadata) {
    return {
      'og:title': metadata.title,
      'og:description': metadata.description,
      'og:type': 'website',
      'twitter:card': 'summary_large_image',
      'twitter:title': metadata.title,
      'twitter:description': metadata.description
    };
  }

  /**
   * Generates structured data suggestions
   * @param {Object} metadata - Metadata to analyze
   * @returns {Object} Structured data suggestions
   */
  generateStructuredData(metadata) {
    return {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      'name': metadata.title,
      'description': metadata.description,
      'url': metadata.url,
      'applicationCategory': 'WebApplication'
    };
  }

  /**
   * Calculates sentiment (simplified implementation)
   * @param {string} text - Text to analyze
   * @returns {Object} Sentiment analysis
   */
  calculateSentiment(text) {
    if (!text) return { overall: 'neutral', confidence: 0, emotions: {}, tone: 'neutral' };

    const positiveWords = ['amazing', 'excellent', 'great', 'awesome', 'fantastic', 'wonderful', 'perfect', 'best', 'love', 'incredible'];
    const negativeWords = ['terrible', 'awful', 'bad', 'worst', 'hate', 'horrible', 'disappointing', 'poor', 'useless', 'broken'];
    
    const words = text.toLowerCase().split(/\s+/);
    let positiveCount = 0;
    let negativeCount = 0;
    
    words.forEach(word => {
      if (positiveWords.some(pw => word.includes(pw))) positiveCount++;
      if (negativeWords.some(nw => word.includes(nw))) negativeCount++;
    });

    const total = positiveCount + negativeCount;
    let overall, confidence;
    
    if (total === 0) {
      overall = 'neutral';
      confidence = 0.5;
    } else if (positiveCount > negativeCount) {
      overall = 'positive';
      confidence = positiveCount / total;
    } else if (negativeCount > positiveCount) {
      overall = 'negative';
      confidence = negativeCount / total;
    } else {
      overall = 'neutral';
      confidence = 0.5;
    }

    return {
      overall,
      confidence: Math.round(confidence * 100) / 100,
      emotions: { positive: positiveCount, negative: negativeCount },
      tone: overall
    };
  }

  /**
   * Generates sentiment-based recommendations
   * @param {Object} sentiment - Sentiment analysis results
   * @returns {Array} Recommendations
   */
  generateSentimentRecommendations(sentiment) {
    const recommendations = [];
    
    if (sentiment.overall === 'negative') {
      recommendations.push('Consider using more positive language');
      recommendations.push('Highlight benefits and value propositions');
    } else if (sentiment.overall === 'neutral') {
      recommendations.push('Consider adding more emotional appeal');
      recommendations.push('Use power words to create excitement');
    }
    
    if (sentiment.confidence < 0.7) {
      recommendations.push('Consider making the tone more consistent');
    }

    return recommendations;
  }

  /**
   * Classifies content into categories
   * @param {Object} metadata - Metadata to classify
   * @returns {Object} Classification results
   */
  classifyContent(metadata) {
    const text = `${metadata.title || ''} ${metadata.description || ''}`.toLowerCase();
    
    const categories = {
      'productivity': ['productivity', 'task', 'organize', 'manage', 'workflow', 'efficiency'],
      'development': ['code', 'developer', 'programming', 'api', 'framework', 'library'],
      'design': ['design', 'ui', 'ux', 'interface', 'visual', 'creative'],
      'business': ['business', 'startup', 'entrepreneur', 'marketing', 'sales', 'revenue'],
      'education': ['learn', 'education', 'course', 'tutorial', 'training', 'skill'],
      'entertainment': ['game', 'fun', 'entertainment', 'music', 'video', 'media'],
      'health': ['health', 'fitness', 'wellness', 'medical', 'exercise', 'nutrition'],
      'finance': ['finance', 'money', 'investment', 'banking', 'payment', 'crypto']
    };

    const scores = {};
    Object.entries(categories).forEach(([category, keywords]) => {
      scores[category] = keywords.reduce((score, keyword) => {
        return score + (text.includes(keyword) ? 1 : 0);
      }, 0);
    });

    const sortedCategories = Object.entries(scores)
      .sort(([,a], [,b]) => b - a)
      .filter(([,score]) => score > 0);

    const primary = sortedCategories[0]?.[0] || 'general';
    const secondary = sortedCategories[1]?.[0] || null;
    const confidence = sortedCategories[0]?.[1] || 0;

    return {
      primary,
      secondary,
      confidence: Math.min(confidence / 3, 1), // Normalize confidence
      suggestedTags: [primary, secondary].filter(Boolean),
      industry: primary
    };
  }

  /**
   * Cleanup method
   */
  async cleanup() {
    // No cleanup needed for this service
  }
}

// Export factory function
export function createEnhancedAIService(options = {}) {
  return new EnhancedAIService(options);
}

// Export default instance (only if API key is available)
export const enhancedAIService = process.env.OPENAI_API_KEY
  ? createEnhancedAIService()
  : null;