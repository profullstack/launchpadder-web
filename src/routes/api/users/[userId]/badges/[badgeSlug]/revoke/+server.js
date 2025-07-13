/**
 * Badge Revocation API Endpoint
 * 
 * Handles revoking badges from users with proper authorization and logging.
 */

import { json } from '@sveltejs/kit';
import { supabase } from '$lib/config/supabase.js';
import { BadgeService } from '$lib/services/badge-service.js';

const badgeService = new BadgeService(supabase);

/**
 * POST /api/users/[userId]/badges/[badgeSlug]/revoke
 * Revoke a specific badge from a user
 */
export async function POST({ params, request, locals }) {
  try {
    const { userId, badgeSlug } = params;

    // Check authentication
    if (!locals.user) {
      return json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Only admins can revoke badges
    const isAdmin = locals.user.email?.endsWith('@admin.com') || false;
    if (!isAdmin) {
      return json(
        { error: 'Admin privileges required to revoke badges' },
        { status: 403 }
      );
    }

    const requestData = await request.json();
    const { reason } = requestData;

    if (!reason) {
      return json(
        { error: 'Revocation reason is required' },
        { status: 400 }
      );
    }

    const result = await badgeService.revokeBadge(
      userId,
      badgeSlug,
      locals.user.id,
      reason
    );

    if (!result.success) {
      return json(
        { error: result.error },
        { status: 400 }
      );
    }

    return json({
      success: true,
      message: 'Badge revoked successfully',
      data: {
        userId,
        badgeSlug,
        revokedBy: locals.user.id,
        reason,
        revokedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Badge revocation error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}