/**
 * Stripe Webhook Handler
 * Handles Stripe webhook events for payment processing
 */

import { json } from '@sveltejs/kit';
import { PaymentService } from '$lib/services/payment-service.js';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const paymentService = new PaymentService({
  supabase,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY
});

export async function POST({ request }) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    
    if (!signature) {
      return json({ error: 'Missing Stripe signature' }, { status: 400 });
    }
    
    let event;
    
    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return json({ error: 'Invalid signature' }, { status: 400 });
    }
    
    // Handle the event
    const result = await paymentService.handleWebhook(event);
    
    if (result.processed) {
      console.log(`Webhook processed: ${event.type} for ${result.paymentIntentId}`);
      
      // Additional processing based on event type
      if (event.type === 'payment_intent.succeeded') {
        await handleSuccessfulPayment(event.data.object);
      }
      
      return json({ received: true, processed: true });
    } else {
      console.log(`Webhook ignored: ${event.type} - ${result.reason}`);
      return json({ received: true, processed: false, reason: result.reason });
    }
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    return json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

/**
 * Handle successful payment by updating submission status
 * @param {Object} paymentIntent - Stripe payment intent object
 */
async function handleSuccessfulPayment(paymentIntent) {
  try {
    const { userId, submissionType } = paymentIntent.metadata;
    
    if (!userId) {
      console.warn('No userId in payment intent metadata');
      return;
    }
    
    // Find pending submissions for this user that need payment
    const { data: submissions, error } = await supabase
      .from('submissions')
      .select('id, status, payment_status')
      .eq('user_id', userId)
      .eq('payment_status', 'pending')
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('Failed to find submissions for payment:', error);
      return;
    }
    
    if (submissions && submissions.length > 0) {
      const submission = submissions[0];
      
      // Update submission status to pending review
      const { error: updateError } = await supabase
        .from('submissions')
        .update({
          payment_status: 'paid',
          status: 'pending_review',
          updated_at: new Date().toISOString()
        })
        .eq('id', submission.id);
      
      if (updateError) {
        console.error('Failed to update submission after payment:', updateError);
      } else {
        console.log(`Submission ${submission.id} updated after successful payment`);
      }
    }
    
  } catch (error) {
    console.error('Error handling successful payment:', error);
  }
}