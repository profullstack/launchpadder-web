-- Webhooks schema for Supabase
CREATE SCHEMA IF NOT EXISTS supabase_functions;
GRANT USAGE ON SCHEMA supabase_functions TO postgres, anon, authenticated, service_role;

-- Create webhooks table
CREATE TABLE IF NOT EXISTS supabase_functions.hooks (
  id BIGSERIAL PRIMARY KEY,
  hook_table_id INTEGER NOT NULL,
  hook_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  request_id BIGINT
);

-- Create hook table id sequence
CREATE SEQUENCE IF NOT EXISTS supabase_functions.hooks_table_id_seq;

-- Grant permissions
GRANT ALL ON supabase_functions.hooks TO service_role;
GRANT ALL ON SEQUENCE supabase_functions.hooks_table_id_seq TO service_role;

-- Create function to handle webhook calls
CREATE OR REPLACE FUNCTION supabase_functions.http_request()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  request_id bigint;
  payload jsonb;
  url text := TG_ARGV[0];
  method text := TG_ARGV[1];
  headers jsonb DEFAULT '{}'::jsonb;
  params jsonb DEFAULT '{}'::jsonb;
  timeout_ms integer DEFAULT 1000;
BEGIN
  IF url IS NULL OR url = 'null' THEN
    RAISE EXCEPTION 'url argument is missing';
  END IF;

  IF method IS NULL OR method = 'null' THEN
    method := 'POST';
  END IF;

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'User-Agent', 'Supabase/Hooks'
  );

  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END,
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN OLD ELSE NULL END
  );

  -- Log the webhook call
  INSERT INTO supabase_functions.hooks
    (hook_table_id, hook_name, request_id)
  VALUES
    (TG_RELID, TG_NAME, request_id);

  RETURN COALESCE(NEW, OLD);
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the original operation
    RAISE WARNING 'Webhook failed: %', SQLERRM;
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION supabase_functions.http_request() TO service_role;