/**
 * IP Protection Service Tests
 * Tests for IP-based protection, geolocation, and VPN/proxy detection
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { ipProtectionService } from '../../src/lib/services/ip-protection-service.js';

describe('IP Protection Service', () => {
  let supabaseStub;
  let fetchStub;

  beforeEach(() => {
    // Mock Supabase client
    supabaseStub = {
      from: sinon.stub().returnsThis(),
      select: sinon.stub().returnsThis(),
      insert: sinon.stub().returnsThis(),
      update: sinon.stub().returnsThis(),
      upsert: sinon.stub().returnsThis(),
      eq: sinon.stub().returnsThis(),
      in: sinon.stub().returnsThis(),
      gte: sinon.stub().returnsThis(),
      single: sinon.stub(),
      data: null,
      error: null
    };

    // Mock fetch for external IP services
    fetchStub = sinon.stub(global, 'fetch');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('analyzeIpAddress', () => {
    it('should analyze new IP address and detect VPN', async () => {
      const ipAddress = '192.168.1.100';

      // Mock IP not in database
      supabaseStub.single.resolves({
        data: null,
        error: null
      });

      // Mock external IP analysis
      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve({
          country: 'US',
          countryCode: 'US',
          region: 'CA',
          city: 'San Francisco',
          isp: 'VPN Provider',
          proxy: true,
          vpn: true,
          tor: false,
          threat: 'medium'
        })
      });

      const result = await ipProtectionService.analyzeIpAddress(ipAddress);

      expect(result.ipAddress).to.equal(ipAddress);
      expect(result.isVpn).to.be.true;
      expect(result.isProxy).to.be.true;
      expect(result.countryCode).to.equal('US');
      expect(result.reputation).to.equal('suspicious');
    });

    it('should analyze legitimate IP address', async () => {
      const ipAddress = '8.8.8.8';

      supabaseStub.single.resolves({
        data: null,
        error: null
      });

      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve({
          country: 'United States',
          countryCode: 'US',
          region: 'CA',
          city: 'Mountain View',
          isp: 'Google LLC',
          proxy: false,
          vpn: false,
          tor: false,
          threat: 'low'
        })
      });

      const result = await ipProtectionService.analyzeIpAddress(ipAddress);

      expect(result.isVpn).to.be.false;
      expect(result.isProxy).to.be.false;
      expect(result.reputation).to.equal('neutral');
      expect(result.abuseScore).to.be.lessThan(30);
    });

    it('should detect Tor exit nodes', async () => {
      const ipAddress = '192.168.1.101';

      supabaseStub.single.resolves({
        data: null,
        error: null
      });

      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve({
          country: 'Unknown',
          countryCode: 'XX',
          proxy: false,
          vpn: false,
          tor: true,
          threat: 'high'
        })
      });

      const result = await ipProtectionService.analyzeIpAddress(ipAddress);

      expect(result.isTor).to.be.true;
      expect(result.reputation).to.equal('blocked');
      expect(result.abuseScore).to.be.greaterThan(80);
    });

    it('should return cached data for existing IP', async () => {
      const ipAddress = '192.168.1.102';

      supabaseStub.single.resolves({
        data: {
          ip_address: ipAddress,
          country_code: 'US',
          is_vpn: false,
          is_proxy: false,
          is_tor: false,
          reputation: 'trusted',
          abuse_score: 10,
          last_seen_at: new Date().toISOString()
        },
        error: null
      });

      const result = await ipProtectionService.analyzeIpAddress(ipAddress);

      expect(result.reputation).to.equal('trusted');
      expect(result.fromCache).to.be.true;
      expect(fetchStub.called).to.be.false; // Should not call external API
    });

    it('should handle external API failures gracefully', async () => {
      const ipAddress = '192.168.1.103';

      supabaseStub.single.resolves({
        data: null,
        error: null
      });

      fetchStub.rejects(new Error('API unavailable'));

      const result = await ipProtectionService.analyzeIpAddress(ipAddress);

      expect(result.reputation).to.equal('neutral');
      expect(result.abuseScore).to.equal(0);
      expect(result.error).to.include('Failed to analyze IP');
    });
  });

  describe('checkIpBlacklist', () => {
    it('should detect blacklisted IP', async () => {
      const ipAddress = '192.168.1.200';

      supabaseStub.single.resolves({
        data: {
          ip_address: ipAddress,
          reputation: 'blocked',
          abuse_score: 95
        },
        error: null
      });

      const result = await ipProtectionService.checkIpBlacklist(ipAddress);

      expect(result.isBlocked).to.be.true;
      expect(result.reason).to.include('blacklisted');
      expect(result.severity).to.equal('high');
    });

    it('should allow whitelisted IP', async () => {
      const ipAddress = '192.168.1.201';

      supabaseStub.single.resolves({
        data: {
          ip_address: ipAddress,
          reputation: 'trusted',
          abuse_score: 5
        },
        error: null
      });

      const result = await ipProtectionService.checkIpBlacklist(ipAddress);

      expect(result.isBlocked).to.be.false;
      expect(result.reason).to.include('trusted');
    });

    it('should handle unknown IP addresses', async () => {
      const ipAddress = '192.168.1.202';

      supabaseStub.single.resolves({
        data: null,
        error: null
      });

      const result = await ipProtectionService.checkIpBlacklist(ipAddress);

      expect(result.isBlocked).to.be.false;
      expect(result.reason).to.include('not in database');
    });
  });

  describe('checkGeolocationRestrictions', () => {
    it('should block restricted countries', async () => {
      const ipAddress = '192.168.1.300';
      const restrictedCountries = ['CN', 'RU', 'KP'];

      supabaseStub.single.resolves({
        data: {
          ip_address: ipAddress,
          country_code: 'CN'
        },
        error: null
      });

      const result = await ipProtectionService.checkGeolocationRestrictions(
        ipAddress,
        restrictedCountries
      );

      expect(result.isRestricted).to.be.true;
      expect(result.countryCode).to.equal('CN');
      expect(result.reason).to.include('restricted country');
    });

    it('should allow permitted countries', async () => {
      const ipAddress = '192.168.1.301';
      const restrictedCountries = ['CN', 'RU'];

      supabaseStub.single.resolves({
        data: {
          ip_address: ipAddress,
          country_code: 'US'
        },
        error: null
      });

      const result = await ipProtectionService.checkGeolocationRestrictions(
        ipAddress,
        restrictedCountries
      );

      expect(result.isRestricted).to.be.false;
      expect(result.countryCode).to.equal('US');
    });

    it('should handle unknown country codes', async () => {
      const ipAddress = '192.168.1.302';
      const restrictedCountries = ['CN'];

      supabaseStub.single.resolves({
        data: {
          ip_address: ipAddress,
          country_code: null
        },
        error: null
      });

      const result = await ipProtectionService.checkGeolocationRestrictions(
        ipAddress,
        restrictedCountries
      );

      expect(result.isRestricted).to.be.false;
      expect(result.reason).to.include('unknown location');
    });
  });

  describe('updateIpReputation', () => {
    it('should update IP reputation and abuse score', async () => {
      const ipAddress = '192.168.1.400';
      const updates = {
        reputation: 'suspicious',
        abuse_score: 75,
        notes: 'Multiple spam attempts'
      };

      supabaseStub.single.resolves({
        data: {
          ip_address: ipAddress,
          ...updates,
          updated_at: new Date().toISOString()
        },
        error: null
      });

      const result = await ipProtectionService.updateIpReputation(ipAddress, updates);

      expect(result.reputation).to.equal('suspicious');
      expect(result.abuse_score).to.equal(75);
      expect(result.notes).to.equal('Multiple spam attempts');
    });

    it('should validate reputation values', async () => {
      const ipAddress = '192.168.1.401';
      const invalidUpdates = {
        reputation: 'invalid_reputation'
      };

      try {
        await ipProtectionService.updateIpReputation(ipAddress, invalidUpdates);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid reputation');
      }
    });

    it('should validate abuse score range', async () => {
      const ipAddress = '192.168.1.402';
      const invalidUpdates = {
        abuse_score: 150 // Invalid score > 100
      };

      try {
        await ipProtectionService.updateIpReputation(ipAddress, invalidUpdates);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid abuse score');
      }
    });
  });

  describe('addToBlacklist', () => {
    it('should add IP to blacklist with reason', async () => {
      const ipAddress = '192.168.1.500';
      const reason = 'Repeated spam attempts';

      supabaseStub.single.resolves({
        data: {
          ip_address: ipAddress,
          reputation: 'blocked',
          abuse_score: 100,
          notes: reason
        },
        error: null
      });

      const result = await ipProtectionService.addToBlacklist(ipAddress, reason);

      expect(result.success).to.be.true;
      expect(result.ipAddress).to.equal(ipAddress);
      expect(result.reputation).to.equal('blocked');
    });

    it('should handle already blacklisted IPs', async () => {
      const ipAddress = '192.168.1.501';

      supabaseStub.single.resolves({
        data: {
          ip_address: ipAddress,
          reputation: 'blocked'
        },
        error: null
      });

      const result = await ipProtectionService.addToBlacklist(ipAddress, 'Test');

      expect(result.success).to.be.true;
      expect(result.message).to.include('already blacklisted');
    });
  });

  describe('removeFromBlacklist', () => {
    it('should remove IP from blacklist', async () => {
      const ipAddress = '192.168.1.600';

      supabaseStub.single.resolves({
        data: {
          ip_address: ipAddress,
          reputation: 'neutral',
          abuse_score: 0
        },
        error: null
      });

      const result = await ipProtectionService.removeFromBlacklist(ipAddress);

      expect(result.success).to.be.true;
      expect(result.ipAddress).to.equal(ipAddress);
      expect(result.reputation).to.equal('neutral');
    });

    it('should handle non-blacklisted IPs', async () => {
      const ipAddress = '192.168.1.601';

      supabaseStub.single.resolves({
        data: null,
        error: null
      });

      const result = await ipProtectionService.removeFromBlacklist(ipAddress);

      expect(result.success).to.be.false;
      expect(result.message).to.include('not found');
    });
  });

  describe('getIpStatistics', () => {
    it('should return IP protection statistics', async () => {
      const mockStats = [
        { reputation: 'trusted', count: 1000 },
        { reputation: 'neutral', count: 5000 },
        { reputation: 'suspicious', count: 200 },
        { reputation: 'blocked', count: 50 }
      ];

      supabaseStub.data = mockStats;
      supabaseStub.error = null;

      const result = await ipProtectionService.getIpStatistics();

      expect(result.totalIps).to.equal(6250);
      expect(result.trustedIps).to.equal(1000);
      expect(result.blockedIps).to.equal(50);
      expect(result.suspiciousIps).to.equal(200);
    });

    it('should include VPN/proxy statistics', async () => {
      supabaseStub.data = [
        { is_vpn: true, count: 100 },
        { is_proxy: true, count: 50 },
        { is_tor: true, count: 10 }
      ];
      supabaseStub.error = null;

      const result = await ipProtectionService.getIpStatistics();

      expect(result.vpnCount).to.equal(100);
      expect(result.proxyCount).to.equal(50);
      expect(result.torCount).to.equal(10);
    });
  });

  describe('bulkUpdateIpReputations', () => {
    it('should update multiple IP reputations', async () => {
      const updates = [
        { ip_address: '192.168.1.700', reputation: 'blocked' },
        { ip_address: '192.168.1.701', reputation: 'suspicious' }
      ];

      supabaseStub.data = updates.map(update => ({
        ...update,
        updated_at: new Date().toISOString()
      }));
      supabaseStub.error = null;

      const result = await ipProtectionService.bulkUpdateIpReputations(updates);

      expect(result.success).to.be.true;
      expect(result.updatedCount).to.equal(2);
    });

    it('should validate bulk update data', async () => {
      const invalidUpdates = [
        { ip_address: 'invalid-ip', reputation: 'blocked' }
      ];

      try {
        await ipProtectionService.bulkUpdateIpReputations(invalidUpdates);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid IP address');
      }
    });
  });

  describe('getTopAbusiveIps', () => {
    it('should return top abusive IP addresses', async () => {
      const mockAbusiveIps = [
        {
          ip_address: '192.168.1.800',
          abuse_score: 95,
          reputation: 'blocked',
          request_count: 1000
        },
        {
          ip_address: '192.168.1.801',
          abuse_score: 85,
          reputation: 'suspicious',
          request_count: 500
        }
      ];

      supabaseStub.data = mockAbusiveIps;
      supabaseStub.error = null;

      const result = await ipProtectionService.getTopAbusiveIps(10);

      expect(result).to.have.length(2);
      expect(result[0].abuse_score).to.equal(95);
      expect(result[1].abuse_score).to.equal(85);
    });

    it('should limit results to specified count', async () => {
      const mockData = Array(20).fill().map((_, i) => ({
        ip_address: `192.168.1.${800 + i}`,
        abuse_score: 90 - i,
        reputation: 'suspicious'
      }));

      supabaseStub.data = mockData;
      supabaseStub.error = null;

      const result = await ipProtectionService.getTopAbusiveIps(5);

      expect(result).to.have.length(5);
    });
  });
});