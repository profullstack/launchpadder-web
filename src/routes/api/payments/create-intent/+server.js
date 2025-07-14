/**
 * Payment Intent Creation API
 * Creates Stripe payment intents for submissions
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
    const { submissionType, directories = [], metadata = {} } = await request.json();
    
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
    
    // Calculate submission fee
    const feeCalculation = getPaymentService().calculateSubmissionFee(submissionType, directories);
    
    // Create payment intent
    const paymentIntent = await getPaymentService().createPaymentIntent({
      amount: feeCalculation.amount,
      currency: feeCalculation.currency,
      submissionType,
      userId: user.id,
      metadata: {
        ...metadata,
        directories: directories.join(','),
        breakdown: JSON.stringify(feeCalculation.breakdown || {})
      }
    });
    
    return json({
      success: true,
      paymentIntent,
      feeCalculation
    });
    
  } catch (error) {
    console.error('Payment intent creation error:', error);
    
    return json({
      error: error.message || 'Failed to create payment intent'
    }, { status: 500 });
  }
}