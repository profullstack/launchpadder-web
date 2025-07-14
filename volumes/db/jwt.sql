-- JWT helper functions for Supabase
CREATE OR REPLACE FUNCTION auth.jwt() 
RETURNS jsonb 
LANGUAGE sql STABLE
AS $$
  SELECT 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.role() 
RETURNS text 
LANGUAGE sql STABLE
AS $$
  SELECT 
    coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        (auth.jwt() ->> 'role')
    )
$$;

CREATE OR REPLACE FUNCTION auth.uid() 
RETURNS uuid 
LANGUAGE sql STABLE
AS $$
  SELECT 
    coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (auth.jwt() ->> 'sub')
    )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.email() 
RETURNS text 
LANGUAGE sql STABLE
AS $$
  SELECT 
    coalesce(
        nullif(current_setting('request.jwt.claim.email', true), ''),
        (auth.jwt() ->> 'email')
    )
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.email() TO anon, authenticated, service_role;