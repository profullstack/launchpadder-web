/**
 * Daily Submission Status API endpoint
 * Handles GET /api/submissions/daily-status
 */

import { json, error } from '@sveltejs/kit';
import { supabase } from '$lib/config/supabase.js';

/**
 * GET /api/submissions/daily-status - Get user's daily submission count and admin status
 */
export async function GET({ locals }) {
  try {
    // Get user from session
    const user = locals.user;
    if (!user?.id) {
      throw error(401, 'Authentication required');
    }

    // Get today's date range (start and end of day in UTC)
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Count today's submissions for this user
    const { data: submissions, error: submissionError } = await supabase
      .from('submissions')
      .select('id')
      .eq('user_id', user.id)
      .gte('created_at', startOfDay.toISOString())
      .lt('created_at', endOfDay.toISOString());

    if (submissionError) {
      console.error('Error counting daily submissions:', submissionError);
      throw error(500, 'Failed to check daily submissions');
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.error('Error checking admin status:', userError);
      // Default to non-admin if we can't check
    }

    const dailyCount = submissions?.length || 0;
    const isAdmin = userData?.is_admin || false;

    return json({
      success: true,
      daily_count: dailyCount,
      is_admin: isAdmin,
      can_use_free: isAdmin || dailyCount < 1
    });

  } catch (err) {
    console.error('Daily status check error:', err);
    
    // Handle specific error types
    if (err.message.includes('Authentication required')) {
      throw error(401, err.message);
    }
    
    // Generic server error
    throw error(500, 'Failed to check daily status');
  }
}