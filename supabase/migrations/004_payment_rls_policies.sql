-- Row Level Security Policies for Payment Tables
-- Ensures users can only access their own payment data

-- Enable RLS on payment tables
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;

-- Payments table policies
-- Users can view their own payments
CREATE POLICY "Users can view own payments" ON payments
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own payments (for API endpoints)
CREATE POLICY "Users can insert own payments" ON payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role can update payments (for webhooks and confirmations)
CREATE POLICY "Service role can update payments" ON payments
  FOR UPDATE USING (
    auth.jwt() ->> 'role' = 'service_role' OR 
    auth.uid() = user_id
  );

-- Service role can delete payments (for cleanup/refunds)
CREATE POLICY "Service role can delete payments" ON payments
  FOR DELETE USING (auth.jwt() ->> 'role' = 'service_role');

-- Stripe customers table policies
-- Users can view their own customer record
CREATE POLICY "Users can view own customer record" ON stripe_customers
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own customer record
CREATE POLICY "Users can insert own customer record" ON stripe_customers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own customer record
CREATE POLICY "Users can update own customer record" ON stripe_customers
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role can manage all customer records
CREATE POLICY "Service role can manage customer records" ON stripe_customers
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT ON payments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON stripe_customers TO authenticated;

-- Grant full access to service role
GRANT ALL ON payments TO service_role;
GRANT ALL ON stripe_customers TO service_role;

-- Create a function to check if user owns a payment
CREATE OR REPLACE FUNCTION user_owns_payment(payment_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM payments 
    WHERE id = payment_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to get user's payment history with pagination
CREATE OR REPLACE FUNCTION get_user_payment_history(
  user_uuid UUID DEFAULT auth.uid(),
  page_limit INTEGER DEFAULT 10,
  page_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  payment_intent_id TEXT,
  amount INTEGER,
  currency TEXT,
  status TEXT,
  submission_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.payment_intent_id,
    p.amount,
    p.currency,
    p.status,
    p.submission_type,
    p.metadata,
    p.created_at,
    p.confirmed_at
  FROM payments p
  WHERE p.user_id = user_uuid
  ORDER BY p.created_at DESC
  LIMIT page_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to get payment statistics for a user
CREATE OR REPLACE FUNCTION get_user_payment_stats(user_uuid UUID DEFAULT auth.uid())
RETURNS TABLE (
  total_payments BIGINT,
  total_amount INTEGER,
  successful_payments BIGINT,
  failed_payments BIGINT,
  pending_payments BIGINT,
  last_payment_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_payments,
    COALESCE(SUM(amount), 0)::INTEGER as total_amount,
    COUNT(*) FILTER (WHERE status = 'succeeded') as successful_payments,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_payments,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_payments,
    MAX(created_at) as last_payment_date
  FROM payments
  WHERE user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION user_owns_payment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_payment_history(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_payment_stats(UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON POLICY "Users can view own payments" ON payments IS 'Allow users to view their own payment records';
COMMENT ON POLICY "Service role can update payments" ON payments IS 'Allow service role to update payments for webhooks';

COMMENT ON FUNCTION user_owns_payment(UUID) IS 'Check if the current user owns a specific payment';
COMMENT ON FUNCTION get_user_payment_history(UUID, INTEGER, INTEGER) IS 'Get paginated payment history for a user';
COMMENT ON FUNCTION get_user_payment_stats(UUID) IS 'Get payment statistics summary for a user';