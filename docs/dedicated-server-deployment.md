# LaunchPadder - Dedicated Server Deployment Guide

This guide covers deploying LaunchPadder to a dedicated server with nginx proxy setup.

## 📋 Prerequisites

### Server Requirements
- **OS**: Ubuntu 20.04+ or similar Linux distribution
- **RAM**: Minimum 2GB, recommended 4GB+
- **Storage**: Minimum 20GB available space
- **Node.js**: Version 20 or higher
- **nginx**: For reverse proxy
- **PostgreSQL**: For database (or Supabase Cloud)
- **Redis**: For caching and sessions

### Required Software
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install PM2 for process management
npm install -g pm2

# Install nginx
sudo apt install nginx

# Install PostgreSQL (if not using Supabase Cloud)
sudo apt install postgresql postgresql-contrib

# Install Redis
sudo apt install redis-server
```

## 🔧 Server Setup

### 1. Create Application User
```bash
# Create dedicated user for the application
sudo useradd -m -s /bin/bash launchpadder
sudo usermod -aG sudo launchpadder

# Switch to application user
sudo su - launchpadder
```

### 2. Setup Application Directory
```bash
# Create application directory
sudo mkdir -p /opt/launchpadder
sudo chown launchpadder:launchpadder /opt/launchpadder

# Clone repository
cd /opt/launchpadder
git clone https://github.com/your-username/launchpadder-web.git .

# Make deployment script executable
chmod +x scripts/deploy-to-server.sh
```

### 3. Configure Environment
```bash
# Copy environment template
cp .env.production.example .env.production

# Edit environment variables
nano .env.production
```

**Required Environment Variables:**
```env
# Application
NODE_ENV=production
PORT=3000
PUBLIC_APP_URL=https://your-domain.com

# Database (Supabase Cloud or local PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/launchpadder
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key
NEXTAUTH_SECRET=your-nextauth-secret

# Email (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Payment Processing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# AI Services
OPENAI_API_KEY=sk-...

# Monitoring (optional)
SENTRY_DSN=https://...
```

## 🚀 Deployment Options

### Option 1: Manual Deployment
```bash
# Navigate to application directory
cd /opt/launchpadder

# Run deployment script
APP_PORT=3000 \
DOMAIN=your-domain.com \
SETUP_NGINX=true \
./scripts/deploy-to-server.sh
```

### Option 2: GitHub Actions Deployment

#### Setup GitHub Secrets
In your GitHub repository, go to Settings > Secrets and variables > Actions, and add:

```
SERVER_SSH_KEY=<your-private-ssh-key>
SERVER_HOST=your-server-ip-or-domain
SERVER_USER=launchpadder
SERVER_APP_DIR=/opt/launchpadder
APP_PORT=3000
DOMAIN=your-domain.com
SETUP_NGINX=true
SLACK_WEBHOOK=<optional-slack-webhook>
```

#### SSH Key Setup
```bash
# On your local machine, generate SSH key pair
ssh-keygen -t ed25519 -C "github-actions@your-domain.com"

# Copy public key to server
ssh-copy-id -i ~/.ssh/id_ed25519.pub launchpadder@your-server

# Add private key to GitHub secrets as SERVER_SSH_KEY
cat ~/.ssh/id_ed25519
```

#### Automatic Deployment
- Push to `main` branch triggers automatic deployment
- Manual deployment via GitHub Actions workflow dispatch

## 🌐 Nginx Configuration

### Basic Configuration
The deployment script automatically creates nginx configuration, but you can customize it:

```nginx
# /etc/nginx/sites-available/launchpadder
server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;
    
    # Main application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # API rate limiting
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Auth endpoints with stricter rate limiting
    location ~ ^/api/(auth|login|register) {
        limit_req zone=login burst=5 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://localhost:3000;
    }
    
    # Health check endpoint
    location /api/health {
        access_log off;
        proxy_pass http://localhost:3000;
    }
}
```

### SSL Certificate Setup
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal (already setup by certbot)
sudo systemctl status certbot.timer
```

## 📊 Process Management with PM2

### Basic PM2 Commands
```bash
# Check application status
pm2 status

# View logs
pm2 logs launchpadder

# Restart application
pm2 restart launchpadder

# Stop application
pm2 stop launchpadder

# Monitor resources
pm2 monit

# Save PM2 configuration
pm2 save

# Setup startup script
pm2 startup
```

### PM2 Configuration
The deployment script creates `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'launchpadder',
    script: './build/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 5000
  }]
};
```

## 🔍 Monitoring and Maintenance

### Health Checks
```bash
# Application health
curl http://localhost:3000/api/health

# Detailed health check
curl http://localhost:3000/api/health?detailed=true

# Check nginx status
sudo systemctl status nginx

# Check PM2 processes
pm2 status
```

### Log Management
```bash
# Application logs
pm2 logs launchpadder

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log

# System logs
sudo journalctl -u nginx -f
```

### Backup and Recovery
```bash
# Manual backup
cd /opt/launchpadder
./scripts/backup-production.sh

# Automated backups (add to crontab)
crontab -e
# Add: 0 2 * * * cd /opt/launchpadder && ./scripts/backup-production.sh
```

## 🚨 Troubleshooting

### Common Issues

#### Application Won't Start
```bash
# Check logs
pm2 logs launchpadder

# Check environment variables
pm2 env 0

# Restart with fresh environment
pm2 delete launchpadder
pm2 start ecosystem.config.js
```

#### Database Connection Issues
```bash
# Test database connection
psql $DATABASE_URL -c "SELECT 1;"

# Check Supabase connection
curl -H "apikey: $SUPABASE_ANON_KEY" "$PUBLIC_SUPABASE_URL/rest/v1/"
```

#### Nginx Issues
```bash
# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Check nginx status
sudo systemctl status nginx
```

#### SSL Certificate Issues
```bash
# Check certificate status
sudo certbot certificates

# Renew certificates
sudo certbot renew --dry-run
```

### Performance Optimization

#### Database Optimization
```sql
-- Add indexes for better performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_created_at ON submissions(created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users(email);
```

#### Application Optimization
```bash
# Increase PM2 instances based on CPU cores
pm2 scale launchpadder 4

# Monitor memory usage
pm2 monit

# Optimize Node.js memory
# Edit ecosystem.config.js and adjust node_args
```

## 📈 Scaling Considerations

### Horizontal Scaling
- Use load balancer (nginx upstream)
- Multiple application servers
- Shared database and Redis

### Vertical Scaling
- Increase server resources
- Optimize PM2 cluster instances
- Database connection pooling

### CDN Integration
- CloudFlare for static assets
- Image optimization service
- Geographic distribution

## 🔐 Security Checklist

- [ ] SSL/TLS certificates configured
- [ ] Security headers implemented
- [ ] Rate limiting enabled
- [ ] Firewall configured (UFW)
- [ ] SSH key authentication only
- [ ] Regular security updates
- [ ] Database access restricted
- [ ] Environment variables secured
- [ ] Backup encryption enabled
- [ ] Monitoring and alerting setup

## 📞 Support

For deployment issues:
1. Check the troubleshooting section
2. Review application logs
3. Verify environment configuration
4. Test individual components
5. Contact support with detailed error logs

---

**Next Steps**: After successful deployment, configure monitoring, setup automated backups, and implement your content strategy.