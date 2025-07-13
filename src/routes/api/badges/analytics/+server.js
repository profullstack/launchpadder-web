/**
 * Badge Analytics API Endpoints
 * 
 * Provides analytics data for badges including statistics, leaderboards,
 * and insights for the badge system.
 */

import { json } from '@sveltejs/kit';
import { supabase } from '$lib/config/supabase.js';
import { BadgeService } from '$lib/services/badge-service.js';

const badgeService = new BadgeService(supabase);

/**
 * GET /api/badges/analytics
 * Get overall badge system analytics
 */
export async function GET({ url, locals }) {
  try {
    const period = url.searchParams.get('period') || 'monthly';
    const badgeSlug = url.searchParams.get('badge');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    // Check if user has access to analytics (admin only for detailed analytics)
    const isAdmin = locals.user?.email?.endsWith('@admin.com') || false;
    
    if (!isAdmin) {
      return json(
        { error: 'Admin privileges required for detailed analytics' },
        { status: 403 }
      );
    }

    const analytics = {};

    // Get overall badge statistics
    if (badgeSlug) {
      const statsResult = await badgeService.getBadgeStats(badgeSlug);
      if (statsResult.success) {
        analytics.badgeStats = statsResult.data;
      }
    } else {
      // Get stats for all badges
      const { data: allBadges } = await supabase
        .from('badge_definitions')
        .select('slug')
        .eq('is_active', true);

      if (allBadges) {
        analytics.allBadgeStats = {};
        for (const badge of allBadges) {
          const statsResult = await badgeService.getBadgeStats(badge.slug);
          if (statsResult.success) {
            analytics.allBadgeStats[badge.slug] = statsResult.data;
          }
        }
      }
    }

    // Get badge distribution by category
    const { data: categoryStats } = await supabase
      .from('badge_definitions')
      .select(`
        category,
        user_badges!inner(id)
      `)
      .eq('is_active', true)
      .eq('user_badges.status', 'active');

    if (categoryStats) {
      analytics.categoryDistribution = categoryStats.reduce((acc, badge) => {
        acc[badge.category] = (acc[badge.category] || 0) + 1;
        return acc;
      }, {});
    }

    // Get recent badge awards
    const { data: recentAwards } = await supabase
      .from('badge_earning_history')
      .select(`
        *,
        badge_definitions!inner(slug, name, category),
        profiles!inner(username, full_name)
      `)
      .eq('event_type', 'earned')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (recentAwards) {
      analytics.recentAwards = recentAwards;
    }

    // Get badge earning trends
    const { data: earningTrends } = await supabase
      .from('badge_analytics')
      .select('*')
      .eq('period_type', period)
      .order('period_start', { ascending: false })
      .limit(12);

    if (earningTrends) {
      analytics.earningTrends = earningTrends;
    }

    return json({
      success: true,
      data: analytics,
      meta: {
        period,
        badgeSlug,
        limit,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Badge analytics error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}