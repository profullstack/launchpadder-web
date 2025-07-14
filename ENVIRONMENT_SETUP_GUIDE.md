# Environment Setup Guide

## 📋 Environment Files Overview

After the Supabase Docker upgrade, we now have three environment template files:

- **[`.env.example`](.env.example)** - Local development (self-hosted Supabase)
- **[`.env.production.example`](.env.production.example)** - Production deployment
- **[`.env.test.example`](.env.test.example)** - Testing environment

## 🔄 What Changed During Supabase Upgrade

### ✅ New Variables Added
All environment files now include the complete Supabase configuration:

```bash
# New Supabase service configuration
POSTGRES_USER=postgres
ANON_KEY=...
SERVICE_ROLE_KEY=...
API_EXTERNAL_URL=...
SITE_URL=...

# Auth configuration
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
ENABLE_ANONYMOUS_USERS=false
ENABLE_PHONE_SIGNUP=false
ENABLE_PHONE_AUTOCONFIRM=false
DISABLE_SIGNUP=false
ADDITIONAL_REDIRECT_URLS=""

# Mailer URLs
MAILER_URLPATHS_INVITE=/auth/v1/verify
MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
MAILER_URLPATHS_RECOVERY=/auth/v1/verify
MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify

# PostgREST Configuration
PGRST_DB_SCHEMAS=public,storage,graphql_public

# Logflare Configuration (Analytics)
LOGFLARE_PUBLIC_ACCESS_TOKEN=...
LOGFLARE_PRIVATE_ACCESS_TOKEN=...

# Functions Configuration
FUNCTIONS_VERIFY_JWT=false

# Kong Configuration
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443

# Dashboard Configuration
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=...

# Studio Configuration
STUDIO_DEFAULT_ORGANIZATION=...
STUDIO_DEFAULT_PROJECT=...
SUPABASE_PUBLIC_URL=...

# Pooler Configuration
POOLER_DEFAULT_POOL_SIZE=20
POOLER_MAX_CLIENT_CONN=100
POOLER_TENANT_ID=tenant1
POOLER_DB_POOL_SIZE=10
POOLER_PROXY_PORT_TRANSACTION=6543

# Vault Configuration
VAULT_ENC_KEY=...
SECRET_KEY_BASE=...

# Storage Configuration
IMGPROXY_ENABLE_WEBP_DETECTION=true
```

## 🚀 Setup Instructions

### 1. Local Development Setup

```bash
# Copy the local development template
cp .env.example .env

# Edit .env with your local values (most defaults work for local development)
# Only change these if needed:
# - POSTGRES_PASSWORD (if you want a custom password)
# - OPENAI_API_KEY (if using AI features)
# - STRIPE_SECRET_KEY (if testing payments)
```

### 2. Production Setup

```bash
# DO NOT copy .env.production.example to .env.production
# Instead, set environment variables directly in your deployment platform

# Generate secure secrets:
export POSTGRES_PASSWORD="$(openssl rand -base64 32)"
export JWT_SECRET="$(openssl rand -base64 32)"
export SECRET_KEY_BASE="$(openssl rand -base64 64)"
export VAULT_ENC_KEY="$(openssl rand -base64 32)"
export DASHBOARD_PASSWORD="$(openssl rand -base64 32)"
export LOGFLARE_PUBLIC_ACCESS_TOKEN="$(openssl rand -base64 32)"
export LOGFLARE_PRIVATE_ACCESS_TOKEN="$(openssl rand -base64 32)"

# Update URLs for your domain:
export PUBLIC_SUPABASE_URL="https://your-domain.com"
export API_EXTERNAL_URL="https://your-domain.com"
export SITE_URL="https://your-domain.com"
export SUPABASE_PUBLIC_URL="https://your-domain.com"

# Set production API keys:
export OPENAI_API_KEY="sk-your-production-key"
export STRIPE_SECRET_KEY="sk_live_your-production-key"
export STRIPE_WEBHOOK_SECRET="whsec_your-webhook-secret"

# Configure SMTP for production:
export SMTP_HOST="smtp.your-provider.com"
export SMTP_USER="your-smtp-user"
export SMTP_PASS="your-smtp-password"

# Enable JWT verification for production:
export FUNCTIONS_VERIFY_JWT="true"
export ENABLE_EMAIL_AUTOCONFIRM="false"
```

### 3. Test Environment Setup

```bash
# Copy the test template
cp .env.test.example .env.test

# Most test values are pre-configured and safe to use
# Only customize if you have specific test requirements
```

## ⚠️ Critical Changes When Copying

### 🔒 Security Variables (MUST CHANGE)

When copying to production, **ALWAYS** change these:

```bash
# From template values to secure production values:
POSTGRES_PASSWORD=CHANGE_ME_IN_PRODUCTION → $(openssl rand -base64 32)
JWT_SECRET=CHANGE_ME_TO_SECURE_32_CHAR_SECRET → $(openssl rand -base64 32)
SECRET_KEY_BASE=CHANGE_ME_TO_SECURE_64_CHAR_SECRET → $(openssl rand -base64 64)
VAULT_ENC_KEY=CHANGE_ME_IN_PRODUCTION → $(openssl rand -base64 32)
DASHBOARD_PASSWORD=CHANGE_ME_IN_PRODUCTION → $(openssl rand -base64 32)
LOGFLARE_PUBLIC_ACCESS_TOKEN=CHANGE_ME_IN_PRODUCTION → $(openssl rand -base64 32)
LOGFLARE_PRIVATE_ACCESS_TOKEN=CHANGE_ME_IN_PRODUCTION → $(openssl rand -base64 32)
ANON_KEY=CHANGE_ME_IN_PRODUCTION → Generate new JWT
SERVICE_ROLE_KEY=CHANGE_ME_IN_PRODUCTION → Generate new JWT
```

### 🌐 URL Variables (MUST CHANGE for Production)

```bash
# From localhost to your domain:
PUBLIC_SUPABASE_URL=http://localhost:54321 → https://your-domain.com
API_EXTERNAL_URL=http://localhost:54321 → https://your-domain.com
SITE_URL=http://localhost:54321 → https://your-domain.com
SUPABASE_PUBLIC_URL=http://localhost:54321 → https://your-domain.com
```

### 🔧 Configuration Variables (MAY CHANGE)

```bash
# Production optimizations:
FUNCTIONS_VERIFY_JWT=false → true (enable JWT verification)
ENABLE_EMAIL_AUTOCONFIRM=true → false (require email confirmation)
POOLER_DEFAULT_POOL_SIZE=20 → adjust based on load
POOLER_MAX_CLIENT_CONN=100 → adjust based on load
```

## 📊 Environment Comparison

| Variable | Local (.env) | Production | Test |
|----------|--------------|------------|------|
| `POSTGRES_PASSWORD` | `your-super-secret...` | **Generate new** | `test-postgres-password` |
| `JWT_SECRET` | `your-super-secret...` | **Generate new** | `test-jwt-secret...` |
| `FUNCTIONS_VERIFY_JWT` | `false` | **`true`** | `false` |
| `ENABLE_EMAIL_AUTOCONFIRM` | `true` | **`false`** | `true` |
| `PUBLIC_SUPABASE_URL` | `localhost:54321` | **your-domain.com** | `localhost:54321` |
| `LOG_LEVEL` | `info` | `info` | `error` |

## 🛡️ Security Checklist

Before deploying to production:

- [ ] All `CHANGE_ME_IN_PRODUCTION` values replaced
- [ ] All URLs updated to production domain
- [ ] HTTPS enabled for all external URLs
- [ ] JWT verification enabled (`FUNCTIONS_VERIFY_JWT=true`)
- [ ] Email autoconfirm disabled (`ENABLE_EMAIL_AUTOCONFIRM=false`)
- [ ] Production API keys configured
- [ ] SMTP settings configured
- [ ] SSL certificates installed
- [ ] Firewall rules configured

## 🔄 Migration Commands

### Generate New Secrets
```bash
# Generate all production secrets at once:
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "SECRET_KEY_BASE=$(openssl rand -base64 64)"
echo "VAULT_ENC_KEY=$(openssl rand -base64 32)"
echo "DASHBOARD_PASSWORD=$(openssl rand -base64 32)"
echo "LOGFLARE_PUBLIC_ACCESS_TOKEN=$(openssl rand -base64 32)"
echo "LOGFLARE_PRIVATE_ACCESS_TOKEN=$(openssl rand -base64 32)"
```

### Validate Configuration
```bash
# Check that all required variables are set:
docker-compose config
```

## 📚 Additional Resources

- [PRODUCTION_SECURITY.md](PRODUCTION_SECURITY.md) - Comprehensive security guide
- [Supabase Self-hosting Guide](https://supabase.com/docs/guides/self-hosting)
- [Docker Compose Environment Variables](https://docs.docker.com/compose/environment-variables/)