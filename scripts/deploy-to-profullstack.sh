#!/bin/bash

# LaunchPadder - Deploy to profullstack server
# Custom deployment script for profullstack:/home/ubuntu/www/launchpadder.com/launchpadder-web

set -euo pipefail

# Configuration
SERVER_HOST="profullstack"
SERVER_USER="ubuntu"
APP_DIR="/home/ubuntu/www/launchpadder.com/launchpadder-web"
APP_PORT="${APP_PORT:-3000}"
NODE_ENV="production"
DOMAIN="${DOMAIN:-launchpadder.com}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Test SSH connection
test_connection() {
    log_info "Testing SSH connection to $SERVER_HOST..."
    if ssh -o ConnectTimeout=10 "$SERVER_USER@$SERVER_HOST" "echo 'Connection successful'"; then
        log_success "SSH connection established"
    else
        log_error "Failed to connect to $SERVER_HOST"
        exit 1
    fi
}

# Deploy application
deploy_application() {
    log_info "Deploying LaunchPadder to $SERVER_HOST..."
    
    ssh "$SERVER_USER@$SERVER_HOST" << EOF
        set -e
        
        # Navigate to application directory
        cd "$APP_DIR"
        
        echo "📦 Pulling latest code..."
        git fetch origin
        git reset --hard origin/master
        
        echo "🔧 Installing dependencies..."
        pnpm install --frozen-lockfile --prod
        
        echo "🏗️ Building application..."
        pnpm run build
        
        echo "⚙️ Setting up environment..."
        if [[ ! -f ".env.production" ]]; then
            if [[ -f ".env.production.example" ]]; then
                cp .env.production.example .env.production
                echo "⚠️ Created .env.production from example. Please update with your values."
            fi
        fi
        
        # Set environment variables
        export NODE_ENV="$NODE_ENV"
        export PORT="$APP_PORT"
        
        echo "🚀 Setting up PM2 configuration..."
        cat > ecosystem.config.js << 'EOL'
module.exports = {
  apps: [{
    name: 'launchpadder',
    script: './build/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: $APP_PORT
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: $APP_PORT
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    watch: false,
    ignore_watch: ['node_modules', 'logs'],
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 5000
  }]
};
EOL
        
        echo "📁 Creating logs directory..."
        mkdir -p logs
        
        echo "🔄 Managing PM2 process..."
        # Stop existing application if running
        if pm2 list | grep -q "launchpadder"; then
            echo "Stopping existing application..."
            pm2 stop launchpadder
            pm2 delete launchpadder
        fi
        
        # Start application
        echo "Starting application..."
        pm2 start ecosystem.config.js --env production
        
        # Save PM2 configuration
        pm2 save
        
        echo "✅ Deployment completed!"
EOF
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    # Wait for application to start
    sleep 15
    
    # Check if application is responding
    if ssh "$SERVER_USER@$SERVER_HOST" "curl -f http://localhost:$APP_PORT/api/health" > /dev/null 2>&1; then
        log_success "Health check passed - application is running"
    else
        log_error "Health check failed - checking logs..."
        ssh "$SERVER_USER@$SERVER_HOST" "cd $APP_DIR && pm2 logs launchpadder --lines 20"
        exit 1
    fi
}

# Update nginx configuration
update_nginx() {
    if [[ "${SETUP_NGINX:-false}" == "true" ]]; then
        log_info "Updating nginx configuration..."
        
        ssh "$SERVER_USER@$SERVER_HOST" << EOF
            # Create nginx configuration
            sudo tee /etc/nginx/sites-available/launchpadder > /dev/null << 'EOL'
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Rate limiting
    limit_req_zone \\\$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \\\$binary_remote_addr zone=login:10m rate=1r/s;
    
    # Main application
    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_cache_bypass \\\$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # API rate limiting
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
    }
    
    # Auth endpoints with stricter rate limiting
    location ~ ^/api/(auth|login|register) {
        limit_req zone=login burst=5 nodelay;
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
    }
    
    # Static files caching
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\\\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://localhost:$APP_PORT;
    }
    
    # Health check endpoint
    location /api/health {
        access_log off;
        proxy_pass http://localhost:$APP_PORT;
    }
}
EOL
            
            # Enable the site
            sudo ln -sf /etc/nginx/sites-available/launchpadder /etc/nginx/sites-enabled/launchpadder
            
            # Test nginx configuration
            if sudo nginx -t; then
                sudo systemctl reload nginx
                echo "✅ Nginx configuration updated and reloaded"
            else
                echo "❌ Nginx configuration test failed"
                exit 1
            fi
EOF
        
        log_success "Nginx configuration updated"
    fi
}

# Display status
display_status() {
    log_info "Checking application status..."
    
    ssh "$SERVER_USER@$SERVER_HOST" << EOF
        cd "$APP_DIR"
        echo "📊 PM2 Status:"
        pm2 status
        echo ""
        echo "📋 Application Info:"
        echo "  URL: http://localhost:$APP_PORT"
        echo "  Domain: $DOMAIN"
        echo "  Directory: $APP_DIR"
        echo "  Logs: pm2 logs launchpadder"
        echo ""
        echo "🔧 Useful Commands:"
        echo "  pm2 restart launchpadder  # Restart app"
        echo "  pm2 logs launchpadder     # View logs"
        echo "  pm2 monit                 # Monitor resources"
EOF
}

# Main deployment function
main() {
    log_info "Starting deployment to profullstack server..."
    
    test_connection
    deploy_application
    health_check
    update_nginx
    display_status
    
    log_success "🎉 Deployment completed successfully!"
    log_info "Application is running at http://$DOMAIN"
    
    if [[ "${SETUP_NGINX:-false}" == "true" ]]; then
        log_info "Don't forget to setup SSL with: sudo certbot --nginx -d $DOMAIN"
    fi
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "LaunchPadder Deployment Script for profullstack"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Environment Variables:"
        echo "  APP_PORT=3000          Application port (default: 3000)"
        echo "  DOMAIN=launchpadder.com Domain name"
        echo "  SETUP_NGINX=true       Setup nginx configuration"
        echo ""
        echo "Examples:"
        echo "  $0                     # Basic deployment"
        echo "  DOMAIN=launchpadder.com SETUP_NGINX=true $0  # With nginx"
        echo "  APP_PORT=4000 $0       # Custom port"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac