import { json } from '@sveltejs/kit';
import { supabase } from '../../../../../lib/config/supabase.js';
import { FederationDiscoveryService } from '../../../../../lib/services/federation-discovery-service.js';
import { FederatedSubmissionService } from '../../../../../lib/services/federated-submission-service.js';

/**
 * GET /api/federated-submissions/[id]/status
 * Get federated submission status and results
 */
export async function GET({ request, params }) {
  try {
    const { id } = params;

    if (!id) {
      return json(
        { success: false, error: 'Federated submission ID is required' },
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

    // Get federated submission status
    const status = await federatedSubmissionService.getFederatedSubmissionStatus(id);

    if (!status) {
      return json(
        { success: false, error: 'Federated submission not found' },
        { status: 404 }
      );
    }

    // Verify user owns the submission
    if (status.user_id !== user.id) {
      return json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    return json({
      success: true,
      status
    });

  } catch (error) {
    console.error('Error fetching federated submission status:', error);
    return json(
      { 
        success: false, 
        error: `Failed to fetch status: ${error.message}` 
      },
      { status: 500 }
    );
  }
}