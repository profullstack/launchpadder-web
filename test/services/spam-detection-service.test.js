/**
 * Spam Detection Service Tests
 * Tests for content analysis and spam pattern detection
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { spamDetectionService } from '../../src/lib/services/spam-detection-service.js';

describe('Spam Detection Service', () => {
  let supabaseStub;

  beforeEach(() => {
    // Mock Supabase client
    supabaseStub = {
      from: sinon.stub().returnsThis(),
      select: sinon.stub().returnsThis(),
      insert: sinon.stub().returnsThis(),
      update: sinon.stub().returnsThis(),
      eq: sinon.stub().returnsThis(),
      gte: sinon.stub().returnsThis(),
      single: sinon.stub(),
      data: null,
      error: null
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('analyzeContent', () => {
    it('should detect excessive capital letters', async () => {
      const content = 'THIS IS DEFINITELY SPAM WITH LOTS OF CAPS!!!';
      
      // Mock spam rules
      supabaseStub.data = [
        {
          id: 'rule-1',
          name: 'excessive_caps',
          rule_type: 'content',
          pattern: '[A-Z]{10,}',
          threshold: 70.0,
          action: 'flag',
          weight: 1
        }
      ];
      supabaseStub.error = null;

      const result = await spamDetectionService.analyzeContent(content);

      expect(result.isSpam).to.be.true;
      expect(result.confidence).to.be.greaterThan(70);
      expect(result.detections).to.have.length(1);
      expect(result.detections[0].ruleName).to.equal('excessive_caps');
    });

    it('should detect repeated character patterns', async () => {
      const content = 'Hellooooooo world!!!!!!';
      
      supabaseStub.data = [
        {
          id: 'rule-2',
          name: 'repeated_chars',
          rule_type: 'content',
          pattern: '(.)\\1{5,}',
          threshold: 80.0,
          action: 'flag',
          weight: 2
        }
      ];
      supabaseStub.error = null;

      const result = await spamDetectionService.analyzeContent(content);

      expect(result.isSpam).to.be.true;
      expect(result.confidence).to.be.greaterThan(80);
      expect(result.detections[0].matchedContent).to.include('ooooooo');
    });

    it('should detect spam keywords', async () => {
      const content = 'Congratulations! You have won the lottery! Act now!';
      
      supabaseStub.data = [
        {
          id: 'rule-3',
          name: 'spam_keywords',
          rule_type: 'content',
          pattern: '(?i)(viagra|casino|lottery|winner|congratulations|urgent|act now)',
          threshold: 85.0,
          action: 'block',
          weight: 3
        }
      ];
      supabaseStub.error = null;

      const result = await spamDetectionService.analyzeContent(content);

      expect(result.isSpam).to.be.true;
      expect(result.confidence).to.be.greaterThan(85);
      expect(result.action).to.equal('block');
    });

    it('should handle clean content without false positives', async () => {
      const content = 'This is a normal, clean piece of content about technology.';
      
      supabaseStub.data = [
        {
          id: 'rule-1',
          name: 'excessive_caps',
          rule_type: 'content',
          pattern: '[A-Z]{10,}',
          threshold: 70.0,
          action: 'flag',
          weight: 1
        }
      ];
      supabaseStub.error = null;

      const result = await spamDetectionService.analyzeContent(content);

      expect(result.isSpam).to.be.false;
      expect(result.confidence).to.equal(0);
      expect(result.detections).to.have.length(0);
    });

    it('should calculate weighted confidence scores', async () => {
      const content = 'URGENT!!! Congratulations winner!!!!!!';
      
      supabaseStub.data = [
        {
          id: 'rule-1',
          name: 'excessive_caps',
          rule_type: 'content',
          pattern: '[A-Z]{10,}',
          threshold: 70.0,
          action: 'flag',
          weight: 1
        },
        {
          id: 'rule-2',
          name: 'spam_keywords',
          rule_type: 'content',
          pattern: '(?i)(urgent|congratulations|winner)',
          threshold: 85.0,
          action: 'block',
          weight: 3
        },
        {
          id: 'rule-3',
          name: 'repeated_chars',
          rule_type: 'content',
          pattern: '(.)\\1{5,}',
          threshold: 80.0,
          action: 'flag',
          weight: 2
        }
      ];
      supabaseStub.error = null;

      const result = await spamDetectionService.analyzeContent(content);

      expect(result.isSpam).to.be.true;
      expect(result.detections).to.have.length(3);
      expect(result.confidence).to.be.greaterThan(90);
    });
  });

  describe('analyzeUrl', () => {
    it('should detect suspicious URL patterns', async () => {
      const url = 'https://bit.ly/abc123';
      
      supabaseStub.data = [
        {
          id: 'rule-4',
          name: 'suspicious_urls',
          rule_type: 'url',
          pattern: '(?i)(bit\\.ly|tinyurl|t\\.co)/[a-z0-9]+$',
          threshold: 60.0,
          action: 'flag',
          weight: 2
        }
      ];
      supabaseStub.error = null;

      const result = await spamDetectionService.analyzeUrl(url);

      expect(result.isSpam).to.be.true;
      expect(result.confidence).to.be.greaterThan(60);
      expect(result.detections[0].ruleName).to.equal('suspicious_urls');
    });

    it('should allow legitimate URLs', async () => {
      const url = 'https://example.com/product/awesome-tool';
      
      supabaseStub.data = [
        {
          id: 'rule-4',
          name: 'suspicious_urls',
          rule_type: 'url',
          pattern: '(?i)(bit\\.ly|tinyurl|t\\.co)/[a-z0-9]+$',
          threshold: 60.0,
          action: 'flag',
          weight: 2
        }
      ];
      supabaseStub.error = null;

      const result = await spamDetectionService.analyzeUrl(url);

      expect(result.isSpam).to.be.false;
      expect(result.confidence).to.equal(0);
    });
  });

  describe('checkDuplicateSubmission', () => {
    it('should detect duplicate URLs', async () => {
      const url = 'https://example.com/product';
      
      supabaseStub.data = [
        { id: 'sub-1', url: 'https://example.com/product' }
      ];
      supabaseStub.error = null;

      const result = await spamDetectionService.checkDuplicateSubmission(url);

      expect(result.isDuplicate).to.be.true;
      expect(result.existingSubmissionId).to.equal('sub-1');
    });

    it('should detect similar content duplicates', async () => {
      const metadata = {
        title: 'Amazing Product Launch',
        description: 'This is an amazing product that will change your life'
      };
      
      supabaseStub.data = [
        {
          id: 'sub-2',
          rewritten_meta: {
            title: 'Amazing Product Launch',
            description: 'This is an amazing product that will change your life'
          }
        }
      ];
      supabaseStub.error = null;

      const result = await spamDetectionService.checkDuplicateSubmission(
        'https://different-url.com',
        metadata
      );

      expect(result.isDuplicate).to.be.true;
      expect(result.similarity).to.be.greaterThan(0.9);
    });

    it('should allow unique submissions', async () => {
      const url = 'https://unique-product.com';
      
      supabaseStub.data = [];
      supabaseStub.error = null;

      const result = await spamDetectionService.checkDuplicateSubmission(url);

      expect(result.isDuplicate).to.be.false;
    });
  });

  describe('analyzeBehaviorPattern', () => {
    it('should detect rapid submission patterns', async () => {
      const userId = 'user-123';
      
      // Mock recent submissions
      supabaseStub.data = [
        { created_at: new Date(Date.now() - 30000).toISOString() }, // 30 seconds ago
        { created_at: new Date(Date.now() - 60000).toISOString() }, // 1 minute ago
        { created_at: new Date(Date.now() - 90000).toISOString() }  // 1.5 minutes ago
      ];
      supabaseStub.error = null;

      const result = await spamDetectionService.analyzeBehaviorPattern(userId);

      expect(result.isSpam).to.be.true;
      expect(result.pattern).to.equal('rapid_submission');
      expect(result.confidence).to.be.greaterThan(70);
    });

    it('should detect suspicious voting patterns', async () => {
      const userId = 'user-456';
      
      // Mock rapid voting behavior
      supabaseStub.data = Array(20).fill().map((_, i) => ({
        created_at: new Date(Date.now() - (i * 5000)).toISOString() // Every 5 seconds
      }));
      supabaseStub.error = null;

      const result = await spamDetectionService.analyzeBehaviorPattern(userId, 'voting');

      expect(result.isSpam).to.be.true;
      expect(result.pattern).to.equal('rapid_voting');
    });

    it('should allow normal user behavior', async () => {
      const userId = 'user-789';
      
      // Mock normal submission pattern
      supabaseStub.data = [
        { created_at: new Date(Date.now() - 3600000).toISOString() }, // 1 hour ago
        { created_at: new Date(Date.now() - 7200000).toISOString() }  // 2 hours ago
      ];
      supabaseStub.error = null;

      const result = await spamDetectionService.analyzeBehaviorPattern(userId);

      expect(result.isSpam).to.be.false;
      expect(result.confidence).to.equal(0);
    });
  });

  describe('recordSpamDetection', () => {
    it('should record spam detection results', async () => {
      const submissionId = 'sub-123';
      const detections = [
        {
          ruleId: 'rule-1',
          confidence: 85.5,
          matchedContent: 'SPAM CONTENT',
          action: 'flag'
        }
      ];

      supabaseStub.data = [{ id: 'detection-1' }];
      supabaseStub.error = null;

      const result = await spamDetectionService.recordSpamDetection(submissionId, detections);

      expect(result.success).to.be.true;
      expect(result.recordedCount).to.equal(1);
    });

    it('should handle recording errors gracefully', async () => {
      const submissionId = 'sub-456';
      const detections = [{ ruleId: 'rule-1', confidence: 75 }];

      supabaseStub.data = null;
      supabaseStub.error = { message: 'Database error' };

      try {
        await spamDetectionService.recordSpamDetection(submissionId, detections);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to record spam detection');
      }
    });
  });

  describe('getSpamRules', () => {
    it('should retrieve active spam detection rules', async () => {
      const mockRules = [
        {
          id: 'rule-1',
          name: 'excessive_caps',
          rule_type: 'content',
          pattern: '[A-Z]{10,}',
          threshold: 70.0,
          is_active: true
        },
        {
          id: 'rule-2',
          name: 'spam_keywords',
          rule_type: 'content',
          pattern: '(?i)(spam|scam)',
          threshold: 90.0,
          is_active: true
        }
      ];

      supabaseStub.data = mockRules;
      supabaseStub.error = null;

      const result = await spamDetectionService.getSpamRules('content');

      expect(result).to.have.length(2);
      expect(result[0].name).to.equal('excessive_caps');
    });

    it('should filter rules by type', async () => {
      const mockRules = [
        {
          id: 'rule-4',
          name: 'suspicious_urls',
          rule_type: 'url',
          pattern: 'bit\\.ly',
          threshold: 60.0,
          is_active: true
        }
      ];

      supabaseStub.data = mockRules;
      supabaseStub.error = null;

      const result = await spamDetectionService.getSpamRules('url');

      expect(result).to.have.length(1);
      expect(result[0].rule_type).to.equal('url');
    });
  });

  describe('updateSpamRule', () => {
    it('should update spam detection rule', async () => {
      const ruleId = 'rule-1';
      const updates = {
        threshold: 80.0,
        is_active: false
      };

      supabaseStub.single.resolves({
        data: { id: ruleId, ...updates },
        error: null
      });

      const result = await spamDetectionService.updateSpamRule(ruleId, updates);

      expect(result.threshold).to.equal(80.0);
      expect(result.is_active).to.be.false;
    });

    it('should validate rule updates', async () => {
      const ruleId = 'rule-1';
      const invalidUpdates = {
        threshold: 150.0 // Invalid threshold > 100
      };

      try {
        await spamDetectionService.updateSpamRule(ruleId, invalidUpdates);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid threshold');
      }
    });
  });

  describe('getSpamStatistics', () => {
    it('should return spam detection statistics', async () => {
      const mockStats = [
        {
          detection_date: '2024-01-01',
          rule_name: 'excessive_caps',
          detection_count: 15,
          avg_confidence: 75.5
        },
        {
          detection_date: '2024-01-01',
          rule_name: 'spam_keywords',
          detection_count: 8,
          avg_confidence: 90.2
        }
      ];

      supabaseStub.data = mockStats;
      supabaseStub.error = null;

      const result = await spamDetectionService.getSpamStatistics();

      expect(result).to.have.length(2);
      expect(result[0].rule_name).to.equal('excessive_caps');
      expect(result[0].detection_count).to.equal(15);
    });
  });
});