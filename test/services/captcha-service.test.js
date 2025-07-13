/**
 * CAPTCHA Service Tests
 * Tests for CAPTCHA integration and verification
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { captchaService } from '../../src/lib/services/captcha-service.js';

describe('CAPTCHA Service', () => {
  let supabaseStub;
  let fetchStub;

  beforeEach(() => {
    // Mock Supabase client
    supabaseStub = {
      from: sinon.stub().returnsThis(),
      select: sinon.stub().returnsThis(),
      insert: sinon.stub().returnsThis(),
      update: sinon.stub().returnsThis(),
      delete: sinon.stub().returnsThis(),
      eq: sinon.stub().returnsThis(),
      lt: sinon.stub().returnsThis(),
      single: sinon.stub(),
      data: null,
      error: null
    };

    // Mock fetch for external CAPTCHA verification
    fetchStub = sinon.stub(global, 'fetch');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('generateChallenge', () => {
    it('should generate CAPTCHA challenge for high-risk actions', async () => {
      const challengeData = {
        ip_address: '192.168.1.1',
        user_id: 'user-123',
        action_type: 'submission'
      };

      supabaseStub.single.resolves({
        data: {
          id: 'challenge-1',
          challenge_token: 'token-abc123',
          expires_at: new Date(Date.now() + 300000).toISOString()
        },
        error: null
      });

      const result = await captchaService.generateChallenge(challengeData);

      expect(result.success).to.be.true;
      expect(result.challengeToken).to.equal('token-abc123');
      expect(result.expiresAt).to.be.a('date');
      expect(result.challengeType).to.be.oneOf(['recaptcha', 'hcaptcha', 'turnstile']);
    });

    it('should handle different action types', async () => {
      const actionTypes = ['submission', 'registration', 'password_reset', 'voting'];

      for (const actionType of actionTypes) {
        supabaseStub.single.resolves({
          data: {
            id: `challenge-${actionType}`,
            challenge_token: `token-${actionType}`,
            expires_at: new Date(Date.now() + 300000).toISOString()
          },
          error: null
        });

        const result = await captchaService.generateChallenge({
          ip_address: '192.168.1.1',
          action_type: actionType
        });

        expect(result.success).to.be.true;
        expect(result.actionType).to.equal(actionType);
      }
    });

    it('should set appropriate expiration times', async () => {
      supabaseStub.single.resolves({
        data: {
          id: 'challenge-1',
          challenge_token: 'token-abc123',
          expires_at: new Date(Date.now() + 300000).toISOString()
        },
        error: null
      });

      const result = await captchaService.generateChallenge({
        ip_address: '192.168.1.1',
        action_type: 'submission'
      });

      const expirationTime = new Date(result.expiresAt).getTime();
      const now = Date.now();
      const timeDiff = expirationTime - now;

      expect(timeDiff).to.be.greaterThan(240000); // At least 4 minutes
      expect(timeDiff).to.be.lessThan(360000);    // At most 6 minutes
    });

    it('should handle database errors gracefully', async () => {
      supabaseStub.single.resolves({
        data: null,
        error: { message: 'Database connection failed' }
      });

      try {
        await captchaService.generateChallenge({
          ip_address: '192.168.1.1',
          action_type: 'submission'
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to generate CAPTCHA challenge');
      }
    });
  });

  describe('verifyChallenge', () => {
    it('should verify valid reCAPTCHA response', async () => {
      const challengeToken = 'token-abc123';
      const captchaResponse = 'recaptcha-response-token';

      // Mock challenge lookup
      supabaseStub.single.resolves({
        data: {
          id: 'challenge-1',
          challenge_token: challengeToken,
          challenge_type: 'recaptcha',
          action_type: 'submission',
          expires_at: new Date(Date.now() + 300000).toISOString(),
          is_solved: false
        },
        error: null
      });

      // Mock reCAPTCHA verification
      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          score: 0.9,
          action: 'submission'
        })
      });

      const result = await captchaService.verifyChallenge(challengeToken, captchaResponse);

      expect(result.success).to.be.true;
      expect(result.score).to.equal(0.9);
      expect(result.challengeType).to.equal('recaptcha');
    });

    it('should verify valid hCaptcha response', async () => {
      const challengeToken = 'token-def456';
      const captchaResponse = 'hcaptcha-response-token';

      supabaseStub.single.resolves({
        data: {
          id: 'challenge-2',
          challenge_token: challengeToken,
          challenge_type: 'hcaptcha',
          action_type: 'registration',
          expires_at: new Date(Date.now() + 300000).toISOString(),
          is_solved: false
        },
        error: null
      });

      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve({
          success: true
        })
      });

      const result = await captchaService.verifyChallenge(challengeToken, captchaResponse);

      expect(result.success).to.be.true;
      expect(result.challengeType).to.equal('hcaptcha');
    });

    it('should verify valid Turnstile response', async () => {
      const challengeToken = 'token-ghi789';
      const captchaResponse = 'turnstile-response-token';

      supabaseStub.single.resolves({
        data: {
          id: 'challenge-3',
          challenge_token: challengeToken,
          challenge_type: 'turnstile',
          action_type: 'password_reset',
          expires_at: new Date(Date.now() + 300000).toISOString(),
          is_solved: false
        },
        error: null
      });

      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve({
          success: true
        })
      });

      const result = await captchaService.verifyChallenge(challengeToken, captchaResponse);

      expect(result.success).to.be.true;
      expect(result.challengeType).to.equal('turnstile');
    });

    it('should reject invalid CAPTCHA responses', async () => {
      const challengeToken = 'token-invalid';
      const captchaResponse = 'invalid-response';

      supabaseStub.single.resolves({
        data: {
          id: 'challenge-4',
          challenge_token: challengeToken,
          challenge_type: 'recaptcha',
          action_type: 'submission',
          expires_at: new Date(Date.now() + 300000).toISOString(),
          is_solved: false
        },
        error: null
      });

      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          'error-codes': ['invalid-input-response']
        })
      });

      const result = await captchaService.verifyChallenge(challengeToken, captchaResponse);

      expect(result.success).to.be.false;
      expect(result.error).to.include('CAPTCHA verification failed');
    });

    it('should reject expired challenges', async () => {
      const challengeToken = 'token-expired';
      const captchaResponse = 'valid-response';

      supabaseStub.single.resolves({
        data: {
          id: 'challenge-5',
          challenge_token: challengeToken,
          challenge_type: 'recaptcha',
          action_type: 'submission',
          expires_at: new Date(Date.now() - 60000).toISOString(), // Expired 1 minute ago
          is_solved: false
        },
        error: null
      });

      const result = await captchaService.verifyChallenge(challengeToken, captchaResponse);

      expect(result.success).to.be.false;
      expect(result.error).to.include('expired');
    });

    it('should reject already solved challenges', async () => {
      const challengeToken = 'token-solved';
      const captchaResponse = 'valid-response';

      supabaseStub.single.resolves({
        data: {
          id: 'challenge-6',
          challenge_token: challengeToken,
          challenge_type: 'recaptcha',
          action_type: 'submission',
          expires_at: new Date(Date.now() + 300000).toISOString(),
          is_solved: true
        },
        error: null
      });

      const result = await captchaService.verifyChallenge(challengeToken, captchaResponse);

      expect(result.success).to.be.false;
      expect(result.error).to.include('already been solved');
    });

    it('should handle non-existent challenges', async () => {
      const challengeToken = 'token-nonexistent';
      const captchaResponse = 'valid-response';

      supabaseStub.single.resolves({
        data: null,
        error: null
      });

      const result = await captchaService.verifyChallenge(challengeToken, captchaResponse);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Challenge not found');
    });
  });

  describe('requiresCaptcha', () => {
    it('should require CAPTCHA for high-risk IPs', async () => {
      const ipAddress = '192.168.1.100';
      
      // Mock IP with high abuse score
      supabaseStub.single.resolves({
        data: {
          ip_address: ipAddress,
          abuse_score: 85,
          reputation: 'suspicious'
        },
        error: null
      });

      const result = await captchaService.requiresCaptcha(ipAddress, 'submission');

      expect(result.required).to.be.true;
      expect(result.reason).to.include('high abuse score');
    });

    it('should require CAPTCHA for rapid submissions', async () => {
      const ipAddress = '192.168.1.101';
      
      // Mock IP with normal reputation
      supabaseStub.single.resolves({
        data: {
          ip_address: ipAddress,
          abuse_score: 20,
          reputation: 'neutral'
        },
        error: null
      });

      // Mock recent submissions
      supabaseStub.data = Array(5).fill().map((_, i) => ({
        created_at: new Date(Date.now() - (i * 60000)).toISOString()
      }));
      supabaseStub.error = null;

      const result = await captchaService.requiresCaptcha(ipAddress, 'submission', 'user-123');

      expect(result.required).to.be.true;
      expect(result.reason).to.include('rapid submissions');
    });

    it('should not require CAPTCHA for trusted users', async () => {
      const ipAddress = '192.168.1.102';
      
      // Mock trusted IP
      supabaseStub.single.resolves({
        data: {
          ip_address: ipAddress,
          abuse_score: 5,
          reputation: 'trusted'
        },
        error: null
      });

      // Mock normal submission pattern
      supabaseStub.data = [
        { created_at: new Date(Date.now() - 3600000).toISOString() }
      ];
      supabaseStub.error = null;

      const result = await captchaService.requiresCaptcha(ipAddress, 'submission', 'user-456');

      expect(result.required).to.be.false;
    });

    it('should require CAPTCHA for anonymous users on sensitive actions', async () => {
      const ipAddress = '192.168.1.103';
      
      supabaseStub.single.resolves({
        data: {
          ip_address: ipAddress,
          abuse_score: 30,
          reputation: 'neutral'
        },
        error: null
      });

      const result = await captchaService.requiresCaptcha(ipAddress, 'registration');

      expect(result.required).to.be.true;
      expect(result.reason).to.include('anonymous registration');
    });
  });

  describe('cleanupExpiredChallenges', () => {
    it('should remove expired CAPTCHA challenges', async () => {
      supabaseStub.data = { count: 10 };
      supabaseStub.error = null;

      const result = await captchaService.cleanupExpiredChallenges();

      expect(result.deletedCount).to.equal(10);
      expect(supabaseStub.from.calledWith('captcha_challenges')).to.be.true;
    });

    it('should handle cleanup errors gracefully', async () => {
      supabaseStub.data = null;
      supabaseStub.error = { message: 'Cleanup failed' };

      try {
        await captchaService.cleanupExpiredChallenges();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to cleanup expired challenges');
      }
    });
  });

  describe('getCaptchaStats', () => {
    it('should return CAPTCHA usage statistics', async () => {
      const mockStats = {
        total_challenges: 1000,
        solved_challenges: 850,
        failed_challenges: 150,
        success_rate: 85
      };

      // Mock multiple database calls for stats
      supabaseStub.single
        .onFirstCall().resolves({ data: { count: 1000 }, error: null })
        .onSecondCall().resolves({ data: { count: 850 }, error: null })
        .onThirdCall().resolves({ data: { count: 150 }, error: null });

      const result = await captchaService.getCaptchaStats();

      expect(result.totalChallenges).to.equal(1000);
      expect(result.solvedChallenges).to.equal(850);
      expect(result.failedChallenges).to.equal(150);
      expect(result.successRate).to.equal(85);
    });
  });

  describe('updateCaptchaConfig', () => {
    it('should update CAPTCHA configuration', async () => {
      const config = {
        recaptcha_enabled: true,
        recaptcha_threshold: 0.5,
        hcaptcha_enabled: false
      };

      const result = await captchaService.updateCaptchaConfig(config);

      expect(result.success).to.be.true;
      expect(result.config.recaptcha_enabled).to.be.true;
      expect(result.config.recaptcha_threshold).to.equal(0.5);
    });

    it('should validate configuration values', async () => {
      const invalidConfig = {
        recaptcha_threshold: 1.5 // Invalid threshold > 1
      };

      try {
        await captchaService.updateCaptchaConfig(invalidConfig);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid threshold');
      }
    });
  });
});