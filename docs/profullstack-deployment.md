# LaunchPadder - profullstack Server Deployment

Quick deployment guide for your profullstack server setup.

## 🚀 Quick Start

### Option 1: GitHub Actions (Recommended)

#### Setup GitHub Secrets
In your GitHub repository, go to Settings > Secrets and variables > Actions, and add:

```
PROFULLSTACK_SSH_KEY=<your-private-ssh-key-for-profullstack>
APP_PORT=3000
DOMAIN=launchpadder.com
SETUP_NGINX=true
SLACK_WEBHOOK=<optional-slack-webhook>
```

#### Automatic Deployment
- Push to `main` branch triggers automatic deployment
- Manual deployment via GitHub Actions workflow dispatch
- Uses workflow: [`.github/workflows/deploy-profullstack.yml`](.github/workflows/deploy-profullstack.yml)

### Option 2: Manual Deployment

#### Direct SSH Deployment
```bash
# Deploy directly from your local machine
./scripts/deploy-to-profullstack.sh

# With custom settings
DOMAIN=launchpadder.com SETUP_NGINX=true ./scripts/deploy-to-profullstack.sh
```

#### SSH into Server and Deploy
```bash
# SSH into your server
ssh ubuntu@profullstack

# Navigate to app directory
cd /home/ubuntu/www/launchpadder.com/launchpadder-web

# Pull latest code
git pull origin main

# Run deployment
./scripts/deploy-to-profullstack.sh
```

## 🔧 Server Configuration

### Your Server Details
- **Host**: `profullstack`
- **User**: `ubuntu`
- **App Directory**: `/home/ubuntu/www/launchpadder.com/launchpadder-web`
- **Default Port**: `3000`
- **Domain**: `launchpadder.com`

### Environment Setup
```bash
# On your server, edit environment variables
nano /home/ubuntu/www/launchpadder.com/launchpadder-web/.env.production
```

**Required Environment Variables:**
```env
# Application
NODE_ENV=production
PORT=3000
PUBLIC_APP_URL=https://launchpadder.com

# Supabase Configuration (Cloud recommended)
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Redis (for caching and sessions)
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key
NEXTAUTH_SECRET=your-nextauth-secret

# Email Configuration (Mailgun)
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=mg.your-domain.com
MAILGUN_FROM_EMAIL=noreply@your-domain.com
MAILGUN_FROM_NAME=LaunchPadder

# SMS Configuration (Twilio)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Payment Processing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# AI Services
OPENAI_API_KEY=sk-...
```

## 🌐 Nginx Configuration

The deployment script automatically configures nginx to proxy to your app on localhost:3000.

### Manual Nginx Setup (if needed)
```bash
# On your server
sudo nano /etc/nginx/sites-available/launchpadder

# Add the configuration (see deploy script for full config)
# Then enable it
sudo ln -sf /etc/nginx/sites-available/launchpadder /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL Certificate Setup
```bash
# Install certbot if not already installed
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d launchpadder.com -d www.launchpadder.com
```

## 📊 Process Management

### PM2 Commands
```bash
# Check status
pm2 status

# View logs
pm2 logs launchpadder

# Restart app
pm2 restart launchpadder

# Monitor resources
pm2 monit

# Stop app
pm2 stop launchpadder
```

### Application Logs
```bash
# Real-time logs
pm2 logs launchpadder --lines 50

# Log files location
ls -la /home/ubuntu/www/launchpadder.com/launchpadder-web/logs/
```

## 🔍 Health Checks

### Application Health
```bash
# Basic health check
curl http://localhost:3000/api/health

# Detailed health check
curl http://localhost:3000/api/health?detailed=true

# External health check
curl https://launchpadder.com/api/health
```

### System Health
```bash
# Check nginx
sudo systemctl status nginx

# Check disk space
df -h

# Check memory usage
free -h

# Check PM2 processes
pm2 status
```

## 🚨 Troubleshooting

### Common Issues

#### App Won't Start
```bash
# Check PM2 logs
pm2 logs launchpadder

# Check if port is in use
sudo netstat -tulpn | grep :3000

# Restart PM2 process
pm2 restart launchpadder
```

#### Nginx Issues
```bash
# Test nginx config
sudo nginx -t

# Check nginx logs
sudo tail -f /var/log/nginx/error.log

# Restart nginx
sudo systemctl restart nginx
```

#### Database Connection Issues
```bash
# Test Supabase connection
curl -H "apikey: $SUPABASE_ANON_KEY" "$PUBLIC_SUPABASE_URL/rest/v1/"
```

### Performance Monitoring
```bash
# Monitor system resources
htop

# Monitor PM2 processes
pm2 monit

# Check application performance
curl -w "@curl-format.txt" -o /dev/null -s https://launchpadder.com/
```

## 📈 Deployment Workflow

### Automated Deployment (GitHub Actions)
1. Push code to `main` branch
2. GitHub Actions runs tests and quality checks
3. Deploys to profullstack server automatically
4. Performs health checks
5. Sends notifications (if configured)

### Manual Deployment Steps
1. SSH into server: `ssh ubuntu@profullstack`
2. Navigate to app: `cd /home/ubuntu/www/launchpadder.com/launchpadder-web`
3. Pull latest code: `git pull origin main`
4. Run deployment: `./scripts/deploy-to-profullstack.sh`
5. Verify deployment: `curl http://localhost:3000/api/health`

## 🔐 Security Notes

- Ensure SSH key authentication is properly configured
- Keep environment variables secure and never commit them
- Regularly update system packages: `sudo apt update && sudo apt upgrade`
- Monitor application logs for suspicious activity
- Use strong passwords for database and external services
- Keep SSL certificates up to date with certbot auto-renewal

## 📞 Quick Commands Reference

```bash
# Deploy application
./scripts/deploy-to-profullstack.sh

# Check app status
pm2 status

# View logs
pm2 logs launchpadder

# Restart app
pm2 restart launchpadder

# Check health
curl http://localhost:3000/api/health

# Update SSL certificate
sudo certbot renew

# Check nginx status
sudo systemctl status nginx
```

---

**Your LaunchPadder platform is ready to launch on profullstack!** 🚀

For any deployment issues, check the logs first, then refer to the troubleshooting section above.