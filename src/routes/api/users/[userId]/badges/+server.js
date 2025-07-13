/**
 * User Badge Management API Endpoints
 * 
 * Handles user-specific badge operations including getting user badges,
 * awarding badges, revoking badges, and checking badge criteria.
 */

import { json } from '@sveltejs/kit';
import { supabase } from '$lib/config/supabase.js';
import { BadgeService } from '$lib/services/badge-service.js';

const badgeService = new BadgeService(supabase);

/**
 * GET /api/users/[userId]/badges
 * Get all badges for a specific user
 */
export async function GET({ params, url, locals }) {
  try {
    const { userId } = params;
    const includeHistory = url.searchParams.get('history') === 'true';
    const includeRevoked = url.searchParams.get('revoked') === 'true';

    // Check if user can view these badges (self or admin)
    const canView = locals.user?.id === userId || 
                   locals.user?.email?.endsWith('@admin.com') || 
                   false;

    if (!canView) {
      return json(
        { error: 'Unauthorized to view these badges' },
        { status: 403 }
      );
    }

    const result = await badgeService.getUserBadges(userId, { includeRevoked });

    if (!result.success) {
      return json(
        { error: result.error },
        { status: 400 }
      );
    }

    const response = {
      success: true,
      data: result.data,
      meta: {
        userId,
        total: result.data.length,
        includeRevoked
      }
    };

    // Include earning history if requested
    if (includeHistory) {
      const historyResult = await badgeService.getBadgeEarningHistory(userId, { limit: 50 });
      if (historyResult.success) {
        response.data.history = historyResult.data;
      }
    }

    return json(response);
  } catch (error) {
    console.error('User badges fetch error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users/[userId]/badges
 * Award a badge to a user
 */
export async function POST({ params, request, locals }) {
  try {
    const { userId } = params;

    // Check authentication
    if (!locals.user) {
      return json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const requestData = await request.json();
    const { badgeSlug, assignmentType = 'manual', reason, context = {} } = requestData;

    if (!badgeSlug) {
      return json(
        { error: 'Badge slug is required' },
        { status: 400 }
      );
    }

    // Check if user can award badges (admin or self for automatic awards)
    const isAdmin = locals.user.email?.endsWith('@admin.com') || false;
    const isSelf = locals.user.id === userId;
    const isAutomatic = assignmentType === 'automatic';

    if (!isAdmin && !(isSelf && isAutomatic)) {
      return json(
        { error: 'Insufficient privileges to award badges' },
        { status: 403 }
      );
    }

    const result = await badgeService.awardBadge(
      userId,
      badgeSlug,
      assignmentType,
      locals.user.id,
      reason,
      context
    );

    if (!result.success) {
      return json(
        { error: result.error },
        { status: 400 }
      );
    }

    return json({
      success: true,
      data: { userBadgeId: result.data },
      message: 'Badge awarded successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Badge award error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/[userId]/badges
 * Update user badge display preferences
 */
export async function PUT({ params, request, locals }) {
  try {
    const { userId } = params;

    // Check if user can update these preferences (self only)
    if (!locals.user || locals.user.id !== userId) {
      return json(
        { error: 'Unauthorized to update badge preferences' },
        { status: 403 }
      );
    }

    const requestData = await request.json();
    const { badgeSlug, preferences } = requestData;

    if (!badgeSlug || !preferences) {
      return json(
        { error: 'Badge slug and preferences are required' },
        { status: 400 }
      );
    }

    const result = await badgeService.updateBadgeDisplayPreferences(
      userId,
      badgeSlug,
      preferences
    );

    if (!result.success) {
      return json(
        { error: result.error },
        { status: 400 }
      );
    }

    return json({
      success: true,
      data: result.data,
      message: 'Badge preferences updated successfully'
    });

  } catch (error) {
    console.error('Badge preferences update error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}