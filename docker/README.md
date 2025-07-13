# LaunchPadder Self-Hosted Docker Setup

This guide provides complete instructions for self-hosting LaunchPadder using Docker Compose with the official Supabase stack. This setup gives you full control over your data and infrastructure.

## 🏗️ Architecture Overview

The Docker setup includes:

- **PostgreSQL** - Primary database with LaunchPadder schema
- **Supabase Studio** - Web UI for database management
- **GoTrue** - Authentication service
- **PostgREST** - Auto-generated REST API
- **Realtime** - WebSocket server for real-time features
- **Storage** - File storage with image processing
- **Kong** - API gateway with CORS and routing
- **Analytics** - Logging and analytics service
- **Vector** - Log aggregation and monitoring
- **LaunchPadder Web** - SvelteKit application

## 📋 Prerequisites

- Docker Engine 20.10+ and Docker Compose 2.0+
- At least 4GB RAM and 20GB disk space
- Domain name (optional, for production)

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone <repository-url>
cd launchpadder-web
```

### 2. Generate JWT Keys

Generate secure JWT keys for authentication:

```bash
# Generate JWT secret (32 characters)
openssl rand -base64 32

# Generate anon key (use online JWT generator with above secret)
# Payload: {"role": "anon", "iss": "supabase", "iat": 1640995200, "exp": 1956441600}

# Generate service role key (use online JWT generator with above secret)  
# Payload: {"role": "service_role", "iss": "supabase", "iat": 1640995200, "exp": 1956441600}
```

### 3. Configure Environment

Copy and customize the environment file:

```bash
cp .env.example .env
```

**Required Configuration:**

```bash
# Database Configuration
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=launchpadder
POSTGRES_HOST=db
POSTGRES_PORT=5432

# JWT Configuration (use generated keys from step 2)
JWT_SECRET=your_jwt_secret_here
ANON_KEY=your_anon_key_here
SERVICE_ROLE_KEY=your_service_role_key_here
JWT_EXPIRY=3600

# Application URLs
SITE_URL=http://localhost:3000
API_EXTERNAL_URL=http://localhost:8000
SUPABASE_PUBLIC_URL=http://localhost:8000

# Email Configuration (required for auth)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_ADMIN_EMAIL=admin@yourdomain.com
SMTP_SENDER_NAME=LaunchPadder

# External API Keys
OPENAI_API_KEY=your_openai_key_here
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
COINGECKO_API_KEY=your_coingecko_key_here

# Optional: Analytics
LOGFLARE_API_KEY=your_logflare_key_here

# Optional: Dashboard Credentials
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=change_this_password
```

### 4. Start Services

```bash
# Start all services in background
docker-compose up -d

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

### 5. Initialize Database

Wait for services to start, then run migrations:

```bash
# Install dependencies
pnpm install

# Run database migrations
pnpm run db:migrate

# Optional: Seed with sample data
pnpm run db:seed
```

### 6. Access Applications

- **LaunchPadder Web**: http://localhost:3000
- **Supabase Studio**: http://localhost:3001
- **API Gateway**: http://localhost:8000
- **Vector Logs**: http://localhost:9001

## 🔧 Configuration Details

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `POSTGRES_PASSWORD` | Database password | ✅ | - |
| `POSTGRES_DB` | Database name | ✅ | `launchpadder` |
| `JWT_SECRET` | JWT signing secret | ✅ | - |
| `ANON_KEY` | Anonymous user JWT | ✅ | - |
| `SERVICE_ROLE_KEY` | Service role JWT | ✅ | - |
| `SITE_URL` | Frontend URL | ✅ | `http://localhost:3000` |
| `API_EXTERNAL_URL` | API base URL | ✅ | `http://localhost:8000` |
| `SMTP_HOST` | Email server host | ✅ | - |
| `SMTP_USER` | Email username | ✅ | - |
| `SMTP_PASS` | Email password | ✅ | - |
| `OPENAI_API_KEY` | OpenAI API key | ✅ | - |
| `STRIPE_SECRET_KEY` | Stripe secret key | ❌ | - |
| `COINGECKO_API_KEY` | CoinGecko API key | ❌ | - |

### Port Configuration

| Service | Internal Port | External Port | Environment Variable |
|---------|---------------|---------------|---------------------|
| Web App | 3000 | 3000 | `WEB_PORT` |
| Studio | 3000 | 3001 | `STUDIO_PORT` |
| Kong Gateway | 8000 | 8000 | `KONG_HTTP_PORT` |
| PostgreSQL | 5432 | 5432 | `POSTGRES_PORT` |
| Vector API | 9001 | 9001 | - |

## 🛠️ Management Commands

### Service Management

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Restart specific service
docker-compose restart web

# View service logs
docker-compose logs -f [service_name]

# Scale web service
docker-compose up -d --scale web=3
```

### Database Management

```bash
# Connect to database
docker-compose exec db psql -U postgres -d launchpadder

# Backup database
docker-compose exec db pg_dump -U postgres launchpadder > backup.sql

# Restore database
docker-compose exec -T db psql -U postgres launchpadder < backup.sql

# Run migrations
pnpm run db:migrate

# Reset database
pnpm run db:reset
```

### Monitoring

```bash
# View system resources
docker stats

# Check service health
docker-compose ps

# View aggregated logs
curl http://localhost:9001/health

# Access Supabase Studio
open http://localhost:3001
```

## 🔒 Security Considerations

### Production Deployment

1. **Change Default Passwords**
   ```bash
   # Generate secure passwords
   POSTGRES_PASSWORD=$(openssl rand -base64 32)
   DASHBOARD_PASSWORD=$(openssl rand -base64 16)
   ```

2. **Use HTTPS**
   ```bash
   # Update URLs for HTTPS
   SITE_URL=https://yourdomain.com
   API_EXTERNAL_URL=https://api.yourdomain.com
   ```

3. **Firewall Configuration**
   ```bash
   # Only expose necessary ports
   # 80, 443 for web traffic
   # 22 for SSH (if needed)
   ```

4. **SSL Certificates**
   - Use Let's Encrypt or your certificate provider
   - Configure Kong for SSL termination

### Environment Security

- Store sensitive variables in Docker secrets
- Use read-only file systems where possible
- Regular security updates for base images
- Monitor logs for suspicious activity

## 🚀 Production Deployment

### Using Docker Swarm

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml launchpadder

# Scale services
docker service scale launchpadder_web=3
```

### Using Kubernetes

```bash
# Convert to Kubernetes manifests
kompose convert

# Apply manifests
kubectl apply -f .
```

### Reverse Proxy Setup (Nginx)

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🔍 Troubleshooting

### Common Issues

1. **Services won't start**
   ```bash
   # Check logs
   docker-compose logs
   
   # Verify environment variables
   docker-compose config
   ```

2. **Database connection errors**
   ```bash
   # Check database status
   docker-compose exec db pg_isready -U postgres
   
   # Verify credentials
   docker-compose exec db psql -U postgres -d launchpadder -c "SELECT 1;"
   ```

3. **Authentication issues**
   ```bash
   # Verify JWT configuration
   echo $JWT_SECRET | base64 -d
   
   # Check GoTrue logs
   docker-compose logs auth
   ```

4. **Storage issues**
   ```bash
   # Check storage permissions
   docker-compose exec storage ls -la /var/lib/storage
   
   # Verify bucket configuration
   docker-compose logs storage
   ```

### Performance Optimization

1. **Database Tuning**
   ```sql
   -- Optimize PostgreSQL settings
   ALTER SYSTEM SET shared_buffers = '256MB';
   ALTER SYSTEM SET effective_cache_size = '1GB';
   SELECT pg_reload_conf();
   ```

2. **Resource Limits**
   ```yaml
   # Add to docker-compose.yml
   services:
     db:
       deploy:
         resources:
           limits:
             memory: 1G
             cpus: '0.5'
   ```

## 📊 Monitoring and Logs

### Log Aggregation

Logs are collected by Vector and available at:
- Console output: `docker-compose logs`
- File logs: `./docker/volumes/logs/`
- Vector API: http://localhost:9001

### Health Checks

All services include health checks:
```bash
# Check all service health
docker-compose ps

# Individual service health
curl http://localhost:8000/health
curl http://localhost:9001/health
```

### Metrics

Monitor system metrics:
```bash
# Resource usage
docker stats

# Service metrics
curl http://localhost:9001/metrics
```

## 🆘 Support

### Getting Help

1. Check logs: `docker-compose logs [service]`
2. Verify configuration: `docker-compose config`
3. Review documentation: [Supabase Self-Hosting](https://supabase.com/docs/guides/self-hosting)
4. Community support: [GitHub Issues](https://github.com/your-repo/issues)

### Backup Strategy

```bash
# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec -T db pg_dump -U postgres launchpadder | gzip > "backup_${DATE}.sql.gz"
```

This completes your self-hosted LaunchPadder setup! You now have a fully functional, production-ready deployment with complete control over your data and infrastructure.