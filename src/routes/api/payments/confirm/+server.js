/**
 * Payment Confirmation API
 * Confirms Stripe payment intents and updates submission status
 */

import { json } from '@sveltejs/kit';
import { PaymentService } from '$lib/services/payment-service.js';
import { supabase } from '../../../../lib/config/supabase.js';

// Initialize payment service lazily
let paymentService;
function getPaymentService() {
  if (!paymentService) {
    paymentService = new PaymentService({
      supabase,
      stripeSecretKey: process.env.STRIPE_SECRET_KEY
    });
  }
  return paymentService;
}

export async function POST({ request, cookies }) {
  try {
    const { paymentIntentId, submissionId } = await request.json();
    
    if (!paymentIntentId) {
      return json({ error: 'Payment intent ID is required' }, { status: 400 });
    }
    
    // Get user from session
    const sessionToken = cookies.get('sb-access-token');
    if (!sessionToken) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Verify session and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(sessionToken);
    if (authError || !user) {
      return json({ error: 'Invalid session' }, { status: 401 });
    }
    
    // Confirm payment with Stripe
    const paymentResult = await getPaymentService().confirmPayment(paymentIntentId);
    
    if (paymentResult.status === 'succeeded') {
      // Update submission status if submissionId provided
      if (submissionId) {
        const { error: updateError } = await supabase
          .from('submissions')
          .update({
            payment_status: 'paid',
            status: 'pending_review',
            updated_at: new Date().toISOString()
          })
          .eq('id', submissionId)
          .eq('user_id', user.id);
        
        if (updateError) {
          console.error('Failed to update submission status:', updateError);
        }
      }
      
      return json({
        success: true,
        payment: paymentResult,
        submissionId
      });
    } else {
      return json({
        error: 'Payment was not successful',
        status: paymentResult.status
      }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Payment confirmation error:', error);
    
    return json({
      error: error.message || 'Failed to confirm payment'
    }, { status: 500 });
  }
}