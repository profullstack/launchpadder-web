import { json } from '@sveltejs/kit';
import { supabase } from '../../../../lib/config/supabase.js';
import { FederationDiscoveryService } from '../../../../lib/services/federation-discovery-service.js';
import { FederatedSubmissionService } from '../../../../lib/services/federated-submission-service.js';

/**
 * POST /api/federated-submissions/calculate-cost
 * Calculate the total cost for submitting to multiple federated directories
 */
export async function POST({ request }) {
  try {
    // Get request body
    const { directories } = await request.json();

    // Validate required fields
    if (!directories || !Array.isArray(directories) || directories.length === 0) {
      return json(
        { success: false, error: 'directories array is required and cannot be empty' },
        { status: 400 }
      );
    }

    // Create Supabase client
    // Use imported supabase client directly

    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Initialize services
    const federationDiscoveryService = new FederationDiscoveryService(supabase);
    const federatedSubmissionService = new FederatedSubmissionService(
      supabase,
      federationDiscoveryService
    );

    // Calculate submission cost
    const costBreakdown = await federatedSubmissionService.calculateSubmissionCost(directories);

    return json({
      success: true,
      ...costBreakdown
    });

  } catch (error) {
    console.error('Error calculating federated submission cost:', error);
    
    // Handle specific validation errors
    if (error.message.includes('Directory list cannot be empty')) {
      return json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return json(
      { 
        success: false, 
        error: `Failed to calculate cost: ${error.message}` 
      },
      { status: 500 }
    );
  }
}