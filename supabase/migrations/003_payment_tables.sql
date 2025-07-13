-- Payment Tables Migration
-- Creates tables for payment processing and Stripe integration

-- Payments table to track all payment transactions
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_intent_id TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled', 'refunded')),
  submission_type TEXT NOT NULL CHECK (submission_type IN ('basic', 'federated')),
  metadata JSONB DEFAULT '{}',
  confirmed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refund_amount INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stripe customers table to store customer information
CREATE TABLE IF NOT EXISTS stripe_customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add payment_status and payment_intent_id to submissions table
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
ADD COLUMN IF NOT EXISTS payment_intent_id TEXT,
ADD COLUMN IF NOT EXISTS amount_paid INTEGER,
ADD COLUMN IF NOT EXISTS currency_paid TEXT DEFAULT 'usd';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_payment_intent_id ON payments(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id ON stripe_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe_id ON stripe_customers(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_submissions_payment_status ON submissions(payment_status);
CREATE INDEX IF NOT EXISTS idx_submissions_payment_intent_id ON submissions(payment_intent_id);

-- Create updated_at trigger for payments table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_payments_updated_at 
  BEFORE UPDATE ON payments 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stripe_customers_updated_at 
  BEFORE UPDATE ON stripe_customers 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE payments IS 'Stores payment transaction records from Stripe';
COMMENT ON TABLE stripe_customers IS 'Stores Stripe customer information linked to users';

COMMENT ON COLUMN payments.payment_intent_id IS 'Stripe payment intent ID';
COMMENT ON COLUMN payments.amount IS 'Payment amount in cents';
COMMENT ON COLUMN payments.currency IS 'Payment currency code (e.g., usd, eur)';
COMMENT ON COLUMN payments.status IS 'Payment status from Stripe';
COMMENT ON COLUMN payments.submission_type IS 'Type of submission (basic or federated)';
COMMENT ON COLUMN payments.metadata IS 'Additional payment metadata (directories, etc.)';

COMMENT ON COLUMN stripe_customers.stripe_customer_id IS 'Stripe customer ID';
COMMENT ON COLUMN submissions.payment_status IS 'Payment status for the submission';
COMMENT ON COLUMN submissions.payment_intent_id IS 'Associated Stripe payment intent ID';
COMMENT ON COLUMN submissions.amount_paid IS 'Amount paid for this submission in cents';
COMMENT ON COLUMN submissions.currency_paid IS 'Currency used for payment';