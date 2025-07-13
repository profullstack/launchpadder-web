/**
 * Individual Badge API Endpoints
 * 
 * Handles operations for specific badges by slug.
 * Supports getting badge details, updating badge definitions, and deleting badges.
 */

import { json } from '@sveltejs/kit';
import { supabase } from '$lib/config/supabase.js';
import { BadgeService } from '$lib/services/badge-service.js';

const badgeService = new BadgeService(supabase);

/**
 * GET /api/badges/[slug]
 * Get specific badge definition by slug
 */
export async function GET({ params, url }) {
  try {
    const { slug } = params;
    const includeStats = url.searchParams.get('stats') === 'true';

    const result = await badgeService.getBadgeDefinition(slug);

    if (!result.success) {
      return json(
        { error: result.error },
        { status: 404 }
      );
    }

    const response = {
      success: true,
      data: result.data
    };

    // Include statistics if requested
    if (includeStats) {
      const statsResult = await badgeService.getBadgeStats(slug);
      if (statsResult.success) {
        response.data.stats = statsResult.data;
      }
    }

    return json(response);
  } catch (error) {
    console.error('Badge fetch error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/badges/[slug]
 * Update badge definition (admin only)
 */
export async function PUT({ params, request, locals }) {
  try {
    const { slug } = params;

    // Check authentication and admin privileges
    if (!locals.user) {
      return json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const isAdmin = locals.user.email?.endsWith('@admin.com') || false;
    if (!isAdmin) {
      return json(
        { error: 'Admin privileges required' },
        { status: 403 }
      );
    }

    const updateData = await request.json();

    // Remove fields that shouldn't be updated via API
    const { id, slug: newSlug, created_at, updated_at, ...allowedUpdates } = updateData;

    const { data, error } = await supabase
      .from('badge_definitions')
      .update(allowedUpdates)
      .eq('slug', slug)
      .select()
      .single();

    if (error) {
      return json(
        { error: `Failed to update badge: ${error.message}` },
        { status: 400 }
      );
    }

    return json({
      success: true,
      data,
      message: 'Badge definition updated successfully'
    });

  } catch (error) {
    console.error('Badge update error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/badges/[slug]
 * Delete badge definition (admin only)
 */
export async function DELETE({ params, locals }) {
  try {
    const { slug } = params;

    // Check authentication and admin privileges
    if (!locals.user) {
      return json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const isAdmin = locals.user.email?.endsWith('@admin.com') || false;
    if (!isAdmin) {
      return json(
        { error: 'Admin privileges required' },
        { status: 403 }
      );
    }

    // Soft delete by setting is_active to false
    const { data, error } = await supabase
      .from('badge_definitions')
      .update({ is_active: false })
      .eq('slug', slug)
      .select()
      .single();

    if (error) {
      return json(
        { error: `Failed to delete badge: ${error.message}` },
        { status: 400 }
      );
    }

    return json({
      success: true,
      message: 'Badge definition deleted successfully'
    });

  } catch (error) {
    console.error('Badge deletion error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}