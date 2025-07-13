# LaunchPadder Production Deployment Guide

This comprehensive guide covers the complete production deployment of LaunchPadder, including infrastructure setup, security configuration, monitoring, and maintenance procedures.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup](#infrastructure-setup)
3. [SSL/TLS Configuration](#ssltls-configuration)
4. [Environment Configuration](#environment-configuration)
5. [Database Setup](#database-setup)
6. [Application Deployment](#application-deployment)
7. [Monitoring and Observability](#monitoring-and-observability)
8. [Security Configuration](#security-configuration)
9. [Backup and Recovery](#backup-and-recovery)
10. [Maintenance Procedures](#maintenance-procedures)
11. [Troubleshooting](#troubleshooting)
12. [Scaling Guide](#scaling-guide)

## Prerequisites

### System Requirements

- **Operating System**: Ubuntu 20.04+ or CentOS 8+
- **CPU**: Minimum 4 cores (8+ recommended for production)
- **Memory**: Minimum 8GB RAM (16GB+ recommended)
- **Storage**: Minimum 100GB SSD (500GB+ recommended)
- **Network**: Static IP address and domain name

### Required Software

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Node.js and pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pnpm

# Install additional tools
sudo apt install -y git curl wget openssl certbot nginx-utils
```

### Domain and DNS Setup

1. **Domain Configuration**:
   - Point your domain A record to your server's IP address
   - Configure CNAME for `www` subdomain (optional)
   - Set up CAA records for SSL certificate validation

2. **Firewall Configuration**:
   ```bash
   # Configure UFW firewall
   sudo ufw allow ssh
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw --force enable
   ```

## Infrastructure Setup

### 1. Server Preparation

```bash
# Create application directory
sudo mkdir -p /opt/launchpadder
sudo chown $USER:$USER /opt/launchpadder
cd /opt/launchpadder

# Clone repository
git clone https://github.com/your-org/launchpadder-web.git .
git checkout main
```

### 2. Directory Structure

```bash
# Create necessary directories
mkdir -p docker/volumes/{db,storage,logs,ssl}
mkdir -p backups
chmod 755 docker/volumes/*
```

## SSL/TLS Configuration

### Option 1: Let's Encrypt (Recommended)

```bash
# Generate SSL certificates
./scripts/setup-ssl.sh \
  --domain your-domain.com \
  --email admin@your-domain.com \
  --type letsencrypt
```

### Option 2: Self-Signed (Development/Testing)

```bash
# Generate self-signed certificates
./scripts/setup-ssl.sh \
  --domain your-domain.com \
  --type selfsigned
```

### SSL Certificate Renewal

```bash
# Set up automatic renewal (Let's Encrypt only)
sudo crontab -e

# Add this line for automatic renewal at 2 AM daily
0 2 * * * /opt/launchpadder/scripts/renew-ssl.sh >> /var/log/ssl-renewal.log 2>&1
```

## Environment Configuration

### 1. Production Environment File

```bash
# Copy and configure production environment
cp .env.production.example .env.production

# Edit with your production values
nano .env.production
```

### 2. Required Environment Variables

```bash
# Application
SITE_URL=https://your-domain.com
API_EXTERNAL_URL=https://your-domain.com
NODE_ENV=production

# Database
POSTGRES_PASSWORD=your-secure-password
JWT_SECRET=your-jwt-secret-32-chars-min

# External Services
OPENAI_API_KEY=your-openai-key
STRIPE_SECRET_KEY=sk_live_your-stripe-key
SMTP_HOST=your-smtp-host
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password

# Security
REDIS_PASSWORD=your-redis-password
ENCRYPTION_KEY=your-32-character-encryption-key
```

### 3. Generate Secure Secrets

```bash
# Generate secure passwords and keys
./scripts/generate-secrets.sh
```

## Database Setup

### 1. Database Migration

```bash
# Run database migrations
pnpm install
pnpm run db:migrate
```

### 2. Database Optimization

```bash
# Apply production database configuration
docker-compose -f docker-compose.production.yml exec db psql -U postgres -d launchpadder -c "
  -- Optimize for production
  ALTER SYSTEM SET shared_buffers = '256MB';
  ALTER SYSTEM SET effective_cache_size = '1GB';
  ALTER SYSTEM SET work_mem = '4MB';
  ALTER SYSTEM SET maintenance_work_mem = '64MB';
  ALTER SYSTEM SET max_connections = '200';
  SELECT pg_reload_conf();
"
```

### 3. Database Indexing

```bash
# Create performance indexes
pnpm run db:optimize-indexes
```

## Application Deployment

### 1. Build and Deploy

```bash
# Build production images
docker-compose -f docker-compose.production.yml build

# Start services
docker-compose -f docker-compose.production.yml up -d

# Verify deployment
docker-compose -f docker-compose.production.yml ps
```

### 2. Health Check

```bash
# Wait for services to start
sleep 60

# Check application health
curl -f https://your-domain.com/api/health?detailed=true

# Check individual services
curl -f https://your-domain.com/api/health
```

### 3. Load Balancer Verification

```bash
# Test load balancing
for i in {1..10}; do
  curl -s https://your-domain.com/api/health | jq '.system.instanceId'
done
```

## Monitoring and Observability

### 1. Access Monitoring Dashboards

- **Grafana**: `https://your-domain.com/grafana/`
- **Prometheus**: `https://your-domain.com/prometheus/`
- **Application Metrics**: `https://your-domain.com/api/metrics`

### 2. Configure Alerting

```bash
# Set up Prometheus alerting rules
cp docker/prometheus/alert_rules.example.yml docker/prometheus/alert_rules.yml
nano docker/prometheus/alert_rules.yml

# Restart Prometheus to load rules
docker-compose -f docker-compose.production.yml restart prometheus
```

### 3. Log Aggregation

```bash
# Configure log retention
echo "LOG_RETENTION_DAYS=30" >> .env.production

# Restart logging services
docker-compose -f docker-compose.production.yml restart loki promtail
```

## Security Configuration

### 1. Firewall Rules

```bash
# Configure application-specific firewall rules
sudo ufw allow from 10.0.0.0/8 to any port 3001 comment "Grafana internal"
sudo ufw allow from 172.16.0.0/12 to any port 9090 comment "Prometheus internal"
```

### 2. Security Headers Verification

```bash
# Test security headers
curl -I https://your-domain.com | grep -E "(Strict-Transport-Security|X-Frame-Options|X-Content-Type-Options)"
```

### 3. Rate Limiting Test

```bash
# Test rate limiting
for i in {1..20}; do
  curl -w "%{http_code}\n" -o /dev/null -s https://your-domain.com/api/submissions
done
```

## Backup and Recovery

### 1. Automated Backups

```bash
# Set up daily backups
sudo crontab -e

# Add backup schedule (daily at 2 AM)
0 2 * * * /opt/launchpadder/scripts/backup-production.sh >> /var/log/backup.log 2>&1
```

### 2. Manual Backup

```bash
# Create immediate backup
./scripts/backup-production.sh

# Backup with S3 upload
BACKUP_S3_BUCKET=your-backup-bucket ./scripts/backup-production.sh
```

### 3. Disaster Recovery

```bash
# Restore from backup
./scripts/restore-production.sh /path/to/backup.tar.gz

# Verify restoration
curl -f https://your-domain.com/api/health?detailed=true
```

## Maintenance Procedures

### 1. Application Updates

```bash
# Update application
git pull origin main
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml up -d --no-deps web-1

# Wait and verify
sleep 30
curl -f https://your-domain.com/api/health

# Update second instance
docker-compose -f docker-compose.production.yml up -d --no-deps web-2
```

### 2. Database Maintenance

```bash
# Database vacuum and analyze
docker-compose -f docker-compose.production.yml exec db psql -U postgres -d launchpadder -c "
  VACUUM ANALYZE;
  REINDEX DATABASE launchpadder;
"
```

### 3. Log Rotation

```bash
# Configure log rotation
sudo tee /etc/logrotate.d/launchpadder << EOF
/opt/launchpadder/docker/volumes/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
    postrotate
        docker-compose -f /opt/launchpadder/docker-compose.production.yml restart promtail
    endscript
}
EOF
```

## Troubleshooting

### Common Issues

#### 1. Service Won't Start

```bash
# Check service logs
docker-compose -f docker-compose.production.yml logs web-1

# Check resource usage
docker stats

# Restart specific service
docker-compose -f docker-compose.production.yml restart web-1
```

#### 2. Database Connection Issues

```bash
# Check database status
docker-compose -f docker-compose.production.yml exec db pg_isready -U postgres

# Check database logs
docker-compose -f docker-compose.production.yml logs db

# Reset database connections
docker-compose -f docker-compose.production.yml restart db
```

#### 3. SSL Certificate Issues

```bash
# Check certificate validity
openssl x509 -in docker/ssl/launchpadder.crt -text -noout | grep -E "(Not Before|Not After)"

# Renew certificate
./scripts/renew-ssl.sh

# Restart nginx
docker-compose -f docker-compose.production.yml restart nginx
```

#### 4. High Memory Usage

```bash
# Check memory usage by service
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# Restart memory-intensive services
docker-compose -f docker-compose.production.yml restart web-1 web-2
```

### Performance Optimization

#### 1. Database Performance

```bash
# Analyze slow queries
docker-compose -f docker-compose.production.yml exec db psql -U postgres -d launchpadder -c "
  SELECT query, mean_time, calls 
  FROM pg_stat_statements 
  ORDER BY mean_time DESC 
  LIMIT 10;
"
```

#### 2. Application Performance

```bash
# Monitor application metrics
curl -s https://your-domain.com/api/metrics | grep -E "(http_request_duration|memory_usage)"

# Check response times
curl -w "@curl-format.txt" -o /dev/null -s https://your-domain.com/
```

## Scaling Guide

### Horizontal Scaling

#### 1. Add More Application Instances

```yaml
# In docker-compose.production.yml, add more web instances
web-3:
  container_name: launchpadder-web-3
  # ... same configuration as web-1
```

#### 2. Update Load Balancer

```nginx
# In docker/nginx/nginx.conf, add new upstream
upstream launchpadder_backend {
    least_conn;
    server web-1:3000 max_fails=3 fail_timeout=30s;
    server web-2:3000 max_fails=3 fail_timeout=30s;
    server web-3:3000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}
```

### Vertical Scaling

#### 1. Increase Resource Limits

```yaml
# In docker-compose.production.yml
services:
  web-1:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
```

#### 2. Database Scaling

```bash
# Increase database resources
docker-compose -f docker-compose.production.yml exec db psql -U postgres -d launchpadder -c "
  ALTER SYSTEM SET shared_buffers = '512MB';
  ALTER SYSTEM SET effective_cache_size = '2GB';
  SELECT pg_reload_conf();
"
```

## Security Checklist

- [ ] SSL/TLS certificates configured and auto-renewing
- [ ] Firewall rules properly configured
- [ ] Security headers implemented
- [ ] Rate limiting enabled
- [ ] Database access restricted
- [ ] Environment variables secured
- [ ] Regular security updates scheduled
- [ ] Backup encryption enabled
- [ ] Access logs monitored
- [ ] Vulnerability scanning automated

## Performance Checklist

- [ ] Database indexes optimized
- [ ] Caching strategies implemented
- [ ] CDN configured for static assets
- [ ] Image optimization enabled
- [ ] Gzip compression active
- [ ] Database connection pooling configured
- [ ] Application metrics monitored
- [ ] Load balancing verified
- [ ] Resource limits set appropriately
- [ ] Performance tests passing

## Monitoring Checklist

- [ ] Health checks responding
- [ ] Prometheus metrics collecting
- [ ] Grafana dashboards configured
- [ ] Log aggregation working
- [ ] Alerting rules active
- [ ] Backup monitoring enabled
- [ ] Uptime monitoring configured
- [ ] Error tracking functional
- [ ] Performance monitoring active
- [ ] Security monitoring enabled

---

For additional support or questions, please refer to the [troubleshooting section](#troubleshooting) or contact the development team.