# Production Security Guide

## 🚨 CRITICAL: Environment Variables Security

### ❌ NEVER commit `.env` to production repositories

The current `.env` file contains **SENSITIVE SECRETS** that must be kept private:

```bash
# These are INSECURE and must be changed for production:
POSTGRES_PASSWORD=your-super-secret-and-long-postgres-password
JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long
DASHBOARD_PASSWORD=this_password_is_insecure_and_should_be_updated
LOGFLARE_PUBLIC_ACCESS_TOKEN=your-super-secret-logflare-public-token
LOGFLARE_PRIVATE_ACCESS_TOKEN=your-super-secret-logflare-private-token
VAULT_ENC_KEY=supabase_vault_key
SECRET_KEY_BASE=api-jwt-secret-super-secret-jwt-token-with-at-least-32-characters-long
```

## ✅ Production Deployment Strategy

### 1. Use `.env.example` for Repository
- ✅ Commit `.env.example` (template with placeholder values)
- ❌ Never commit `.env` (contains real secrets)
- ✅ `.env` is already in `.gitignore`

### 2. Generate Secure Production Secrets

```bash
# Generate secure random passwords/secrets
openssl rand -base64 32  # For JWT_SECRET
openssl rand -base64 64  # For SECRET_KEY_BASE
openssl rand -base64 32  # For POSTGRES_PASSWORD
openssl rand -base64 32  # For VAULT_ENC_KEY
```

### 3. Production Environment Setup Options

#### Option A: Docker Secrets (Recommended)
```yaml
# docker-compose.prod.yml
services:
  db:
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
    secrets:
      - postgres_password

secrets:
  postgres_password:
    file: ./secrets/postgres_password.txt
```

#### Option B: Environment Variables (CI/CD)
```bash
# Set in your deployment platform (Vercel, Netlify, etc.)
export POSTGRES_PASSWORD="$(openssl rand -base64 32)"
export JWT_SECRET="$(openssl rand -base64 32)"
export DASHBOARD_PASSWORD="$(openssl rand -base64 32)"
```

#### Option C: External Secret Management
- AWS Secrets Manager
- HashiCorp Vault
- Azure Key Vault
- Google Secret Manager

### 4. Production URLs & Configuration

Update these for production deployment:

```bash
# Change from localhost to your domain
PUBLIC_SUPABASE_URL=https://your-domain.com
API_EXTERNAL_URL=https://your-domain.com
SITE_URL=https://your-domain.com
SUPABASE_PUBLIC_URL=https://your-domain.com

# Use production SMTP
SMTP_HOST=smtp.your-provider.com
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password

# Production API keys
OPENAI_API_KEY=your-production-openai-key
STRIPE_SECRET_KEY=your-production-stripe-key
```

## 🔒 Security Checklist

### Before Production Deployment:

- [ ] Generate new secure passwords for all services
- [ ] Update all `CHANGE_ME_IN_PRODUCTION` values
- [ ] Use HTTPS URLs for all external endpoints
- [ ] Configure proper SMTP settings
- [ ] Set up SSL certificates
- [ ] Enable proper firewall rules
- [ ] Use production API keys (not test keys)
- [ ] Set `FUNCTIONS_VERIFY_JWT=true` for production
- [ ] Configure proper CORS settings
- [ ] Set up monitoring and logging
- [ ] Enable database backups
- [ ] Test disaster recovery procedures

### Database Security:
- [ ] Use strong, unique passwords
- [ ] Enable SSL connections
- [ ] Restrict database access to application only
- [ ] Regular security updates
- [ ] Monitor for suspicious activity

### Application Security:
- [ ] Enable JWT verification
- [ ] Configure proper CORS policies
- [ ] Use HTTPS everywhere
- [ ] Implement rate limiting
- [ ] Set up proper authentication flows
- [ ] Validate all user inputs
- [ ] Enable audit logging

## 📝 Deployment Commands

### Local Development:
```bash
# Copy example and customize
cp .env.example .env
# Edit .env with your local values
docker-compose up -d
```

### Production Deployment:
```bash
# Never copy .env to production!
# Instead, set environment variables directly:
export POSTGRES_PASSWORD="$(openssl rand -base64 32)"
export JWT_SECRET="$(openssl rand -base64 32)"
# ... set all other production values

# Deploy with production configuration
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 🚨 Emergency Response

If secrets are accidentally committed:
1. **Immediately** rotate all exposed secrets
2. Update production environment variables
3. Restart all services with new secrets
4. Review access logs for potential breaches
5. Consider using `git filter-branch` to remove from history

## 📚 Additional Resources

- [Docker Secrets Documentation](https://docs.docker.com/engine/swarm/secrets/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/security)
- [OWASP Security Guidelines](https://owasp.org/www-project-top-ten/)