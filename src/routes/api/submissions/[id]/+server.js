/**
 * Individual submission API endpoint
 * Handles GET /api/submissions/[id], PUT /api/submissions/[id], DELETE /api/submissions/[id]
 */

import { json, error } from '@sveltejs/kit';
import { createSubmissionService } from '$lib/services/submission-service.js';
import { supabase } from '$lib/config/supabase.js';

// Initialize submission service lazily
let submissionService;
function getSubmissionService() {
  if (!submissionService) {
    submissionService = createSubmissionService({ supabase });
  }
  return submissionService;
}

/**
 * GET /api/submissions/[id] - Get a specific submission by ID
 */
export async function GET({ params }) {
  try {
    const { id } = params;
    
    if (!id) {
      throw error(400, 'Submission ID is required');
    }

    const submission = await getSubmissionService().getSubmissionById(id);
    
    return json({
      success: true,
      data: submission
    });

  } catch (err) {
    console.error('Submission fetch error:', err);
    
    if (err.message.includes('Submission not found')) {
      throw error(404, 'Submission not found');
    }
    
    throw error(500, 'Failed to fetch submission');
  }
}

/**
 * PUT /api/submissions/[id] - Update a submission (owner only)
 */
export async function PUT({ params, request, locals }) {
  try {
    const { id } = params;
    
    if (!id) {
      throw error(400, 'Submission ID is required');
    }

    // Get user from session
    const user = locals.user;
    if (!user?.id) {
      throw error(401, 'Authentication required');
    }

    // Parse request body
    const updateData = await request.json();
    
    // Validate update data
    const allowedFields = ['rewritten_meta', 'tags', 'images'];
    const filteredData = {};
    
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    }

    if (Object.keys(filteredData).length === 0) {
      throw error(400, 'No valid fields to update');
    }

    const submission = await getSubmissionService().updateSubmission(id, filteredData, user.id);
    
    return json({
      success: true,
      data: submission
    });

  } catch (err) {
    console.error('Submission update error:', err);
    
    if (err.message.includes('Authentication required')) {
      throw error(401, err.message);
    }
    
    if (err.message.includes('not found or cannot be updated')) {
      throw error(404, 'Submission not found or you do not have permission to update it');
    }
    
    if (err.message.includes('No valid fields')) {
      throw error(400, err.message);
    }
    
    throw error(500, 'Failed to update submission');
  }
}

/**
 * DELETE /api/submissions/[id] - Delete a submission (owner only)
 */
export async function DELETE({ params, locals }) {
  try {
    const { id } = params;
    
    if (!id) {
      throw error(400, 'Submission ID is required');
    }

    // Get user from session
    const user = locals.user;
    if (!user?.id) {
      throw error(401, 'Authentication required');
    }

    await getSubmissionService().deleteSubmission(id, user.id);
    
    return json({
      success: true,
      message: 'Submission deleted successfully'
    });

  } catch (err) {
    console.error('Submission deletion error:', err);
    
    if (err.message.includes('Authentication required')) {
      throw error(401, err.message);
    }
    
    if (err.message.includes('Failed to delete submission')) {
      throw error(404, 'Submission not found or you do not have permission to delete it');
    }
    
    throw error(500, 'Failed to delete submission');
  }
}