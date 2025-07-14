-- Realtime schema initialization
CREATE SCHEMA IF NOT EXISTS _realtime;

-- Grant permissions
GRANT USAGE ON SCHEMA _realtime TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA _realtime TO supabase_realtime_admin;

-- Create realtime tables
CREATE TABLE IF NOT EXISTS _realtime.subscription (
    id BIGSERIAL PRIMARY KEY,
    subscription_id UUID NOT NULL,
    entity REGCLASS NOT NULL,
    filters JSONB NOT NULL DEFAULT '[]',
    claims JSONB NOT NULL,
    claims_role REGROLE NOT NULL GENERATED ALWAYS AS (CASE WHEN claims->>'role' IS NULL THEN 'anon' ELSE claims->>'role' END::REGROLE) STORED,
    created_at TIMESTAMP DEFAULT timezone('utc', now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_subscription_id_entity_filters_idx 
ON _realtime.subscription (subscription_id, entity, filters);

-- Grant permissions
GRANT ALL ON _realtime.subscription TO supabase_realtime_admin;