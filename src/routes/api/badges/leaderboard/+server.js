/**
 * Badge Leaderboard API Endpoint
 * 
 * Provides leaderboard data for badges, showing top users by badge count
 * and recent badge achievements.
 */

import { json } from '@sveltejs/kit';
import { supabase } from '$lib/config/supabase.js';
import { BadgeService } from '$lib/services/badge-service.js';

const badgeService = new BadgeService(supabase);

/**
 * GET /api/badges/leaderboard
 * Get badge leaderboard data
 */
export async function GET({ url }) {
  try {
    const badgeSlug = url.searchParams.get('badge');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const timeframe = url.searchParams.get('timeframe') || 'all'; // 'all', 'week', 'month', 'year'

    // Get overall leaderboard
    const leaderboardResult = await badgeService.getBadgeLeaderboard(badgeSlug, limit);
    
    if (!leaderboardResult.success) {
      return json(
        { error: leaderboardResult.error },
        { status: 400 }
      );
    }

    const response = {
      success: true,
      data: {
        leaderboard: leaderboardResult.data,
        meta: {
          badgeSlug,
          limit,
          timeframe,
          total: leaderboardResult.data.length
        }
      }
    };

    // Add timeframe-specific data if requested
    if (timeframe !== 'all') {
      let timeFilter = new Date();
      switch (timeframe) {
        case 'week':
          timeFilter.setDate(timeFilter.getDate() - 7);
          break;
        case 'month':
          timeFilter.setMonth(timeFilter.getMonth() - 1);
          break;
        case 'year':
          timeFilter.setFullYear(timeFilter.getFullYear() - 1);
          break;
      }

      // Get recent badge earners within timeframe
      let query = supabase
        .from('user_badges')
        .select(`
          user_id,
          earned_at,
          profiles!inner(username, full_name, avatar_url),
          badge_definitions!inner(slug, name, category, level, icon_url, color_hex)
        `)
        .eq('status', 'active')
        .gte('earned_at', timeFilter.toISOString())
        .order('earned_at', { ascending: false })
        .limit(limit);

      if (badgeSlug) {
        query = query.eq('badge_definitions.slug', badgeSlug);
      }

      const { data: recentEarners, error } = await query;

      if (!error && recentEarners) {
        response.data.recentEarners = recentEarners;
      }
    }

    // Add badge category breakdown
    const { data: categoryBreakdown } = await supabase
      .from('badge_definitions')
      .select(`
        category,
        level,
        user_badges!inner(id)
      `)
      .eq('is_active', true)
      .eq('user_badges.status', 'active');

    if (categoryBreakdown) {
      const breakdown = categoryBreakdown.reduce((acc, item) => {
        const key = `${item.category}-${item.level}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      response.data.categoryBreakdown = breakdown;
    }

    // Add top badges by popularity
    const { data: popularBadges } = await supabase
      .from('badge_definitions')
      .select(`
        slug,
        name,
        category,
        level,
        icon_url,
        color_hex,
        user_badges!inner(id)
      `)
      .eq('is_active', true)
      .eq('user_badges.status', 'active');

    if (popularBadges) {
      const badgePopularity = popularBadges.reduce((acc, badge) => {
        const existing = acc.find(b => b.slug === badge.slug);
        if (existing) {
          existing.count += 1;
        } else {
          acc.push({
            slug: badge.slug,
            name: badge.name,
            category: badge.category,
            level: badge.level,
            icon_url: badge.icon_url,
            color_hex: badge.color_hex,
            count: 1
          });
        }
        return acc;
      }, []);

      response.data.popularBadges = badgePopularity
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    }

    return json(response);

  } catch (error) {
    console.error('Badge leaderboard error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}