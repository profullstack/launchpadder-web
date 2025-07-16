-- Create the auth.factor_type enum if it doesn't exist
DO $$ 
BEGIN
    -- Check if the auth schema exists, if not create it
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
        CREATE SCHEMA auth;
    END IF;

    -- Check if the type exists
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = 'factor_type' AND n.nspname = 'auth') THEN
        -- Create the enum type
        CREATE TYPE auth.factor_type AS ENUM ('totp', 'webauthn', 'phone');
    END IF;
END $$;

-- Make sure the mfa_factors table exists with the required columns
CREATE TABLE IF NOT EXISTS auth.mfa_factors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status text NOT NULL,
    secret text,
    phone text UNIQUE DEFAULT NULL
);

-- Make sure the mfa_challenges table exists with the required columns
CREATE TABLE IF NOT EXISTS auth.mfa_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    factor_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    verified_at timestamp with time zone,
    ip_address inet,
    otp_code text NULL
);

-- Create the unique index if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS unique_verified_phone_factor ON auth.mfa_factors (user_id, phone);

-- Create the _supavisor schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS _supavisor;
