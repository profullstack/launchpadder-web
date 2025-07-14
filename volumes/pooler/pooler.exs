# Supavisor pooler configuration
# This file configures the connection pooler settings

# Create a tenant for the pooler
Supavisor.Tenants.create_tenant(%{
  "external_id" => System.get_env("POOLER_TENANT_ID", "tenant_1"),
  "db_host" => System.get_env("POSTGRES_HOST", "db"),
  "db_port" => String.to_integer(System.get_env("POSTGRES_PORT", "5432")),
  "db_database" => System.get_env("POSTGRES_DB", "postgres"),
  "db_user" => "supabase_admin",
  "db_password" => System.get_env("POSTGRES_PASSWORD"),
  "pool_size" => String.to_integer(System.get_env("POOLER_DEFAULT_POOL_SIZE", "15")),
  "max_client_conn" => String.to_integer(System.get_env("POOLER_MAX_CLIENT_CONN", "200")),
  "default_pool_size" => String.to_integer(System.get_env("POOLER_DEFAULT_POOL_SIZE", "15")),
  "max_db_conn_per_user" => String.to_integer(System.get_env("POOLER_DB_POOL_SIZE", "5"))
})