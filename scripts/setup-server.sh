#!/bin/bash

# LaunchPadder - Server Setup Script
# This script prepares a fresh server for LaunchPadder deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NODE_VERSION="20"
APP_USER="launchpadder"
APP_DIR="/opt/launchpadder"
REPO_URL="${REPO_URL:-https://github.com/your-username/launchpadder-web.git}"

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

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Update system
update_system() {
    log_info "Updating system packages..."
    apt update && apt upgrade -y
    log_success "System updated"
}

# Install Node.js
install_nodejs() {
    log_info "Installing Node.js $NODE_VERSION..."
    
    # Remove existing Node.js if any
    apt remove -y nodejs npm || true
    
    # Install Node.js from NodeSource
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
    
    # Verify installation
    NODE_INSTALLED_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $NODE_INSTALLED_VERSION -ge $NODE_VERSION ]]; then
        log_success "Node.js $(node --version) installed successfully"
    else
        log_error "Node.js installation failed"
        exit 1
    fi
}

# Install pnpm
install_pnpm() {
    log_info "Installing pnpm..."
    npm install -g pnpm
    log_success "pnpm $(pnpm --version) installed"
}

# Install PM2
install_pm2() {
    log_info "Installing PM2..."
    npm install -g pm2
    log_success "PM2 $(pm2 --version) installed"
}

# Install nginx
install_nginx() {
    log_info "Installing nginx..."
    apt install -y nginx
    systemctl enable nginx
    systemctl start nginx
    log_success "nginx installed and started"
}

# Install PostgreSQL
install_postgresql() {
    if [[ "${INSTALL_POSTGRES:-true}" == "true" ]]; then
        log_info "Installing PostgreSQL..."
        apt install -y postgresql postgresql-contrib
        systemctl enable postgresql
        systemctl start postgresql
        log_success "PostgreSQL installed and started"
        
        # Create database and user
        log_info "Setting up database..."
        sudo -u postgres psql << EOF
CREATE DATABASE launchpadder;
CREATE USER launchpadder WITH ENCRYPTED PASSWORD 'launchpadder_password';
GRANT ALL PRIVILEGES ON DATABASE launchpadder TO launchpadder;
ALTER USER launchpadder CREATEDB;
\q
EOF
        log_success "Database setup completed"
    else
        log_info "Skipping PostgreSQL installation (using external database)"
    fi
}

# Install Redis
install_redis() {
    log_info "Installing Redis..."
    apt install -y redis-server
    systemctl enable redis-server
    systemctl start redis-server
    log_success "Redis installed and started"
}

# Install additional tools
install_tools() {
    log_info "Installing additional tools..."
    apt install -y curl wget git unzip htop ufw fail2ban certbot python3-certbot-nginx
    log_success "Additional tools installed"
}

# Setup firewall
setup_firewall() {
    log_info "Setting up firewall..."
    
    # Reset UFW to defaults
    ufw --force reset
    
    # Default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH
    ufw allow ssh
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Enable firewall
    ufw --force enable
    
    log_success "Firewall configured"
}

# Create application user
create_app_user() {
    log_info "Creating application user..."
    
    if id "$APP_USER" &>/dev/null; then
        log_warning "User $APP_USER already exists"
    else
        useradd -m -s /bin/bash "$APP_USER"
        usermod -aG sudo "$APP_USER"
        log_success "User $APP_USER created"
    fi
}

# Setup application directory
setup_app_directory() {
    log_info "Setting up application directory..."
    
    # Create directory
    mkdir -p "$APP_DIR"
    chown "$APP_USER:$APP_USER" "$APP_DIR"
    
    # Clone repository as app user
    sudo -u "$APP_USER" bash << EOF
cd "$APP_DIR"
if [[ -d ".git" ]]; then
    git pull origin main
else
    git clone "$REPO_URL" .
fi
chmod +x scripts/*.sh
EOF
    
    log_success "Application directory setup completed"
}

# Setup SSH keys for deployment
setup_ssh_keys() {
    log_info "Setting up SSH keys for deployment..."
    
    APP_HOME="/home/$APP_USER"
    SSH_DIR="$APP_HOME/.ssh"
    
    # Create .ssh directory
    sudo -u "$APP_USER" mkdir -p "$SSH_DIR"
    sudo -u "$APP_USER" chmod 700 "$SSH_DIR"
    
    # Generate SSH key if it doesn't exist
    if [[ ! -f "$SSH_DIR/id_ed25519" ]]; then
        sudo -u "$APP_USER" ssh-keygen -t ed25519 -f "$SSH_DIR/id_ed25519" -N ""
        log_success "SSH key generated for $APP_USER"
        log_info "Public key for GitHub deployment:"
        echo "----------------------------------------"
        cat "$SSH_DIR/id_ed25519.pub"
        echo "----------------------------------------"
        log_warning "Add this public key to your GitHub repository's deploy keys"
    else
        log_info "SSH key already exists"
    fi
}

# Configure fail2ban
configure_fail2ban() {
    log_info "Configuring fail2ban..."
    
    cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 3

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 3
EOF
    
    systemctl enable fail2ban
    systemctl restart fail2ban
    log_success "fail2ban configured"
}

# Setup log rotation
setup_log_rotation() {
    log_info "Setting up log rotation..."
    
    cat > /etc/logrotate.d/launchpadder << EOF
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 644 $APP_USER $APP_USER
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
    
    log_success "Log rotation configured"
}

# Create environment template
create_env_template() {
    log_info "Creating environment template..."
    
    sudo -u "$APP_USER" bash << EOF
cd "$APP_DIR"
if [[ ! -f ".env.production" ]]; then
    cp .env.production.example .env.production
    log_warning "Created .env.production from template. Please update with your values."
fi
EOF
    
    log_success "Environment template created"
}

# Display next steps
display_next_steps() {
    log_success "Server setup completed!"
    echo ""
    echo "🎉 LaunchPadder server is ready for deployment!"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Update environment variables in $APP_DIR/.env.production"
    echo "2. Configure your domain DNS to point to this server"
    echo "3. Add the SSH public key to your GitHub repository deploy keys"
    echo "4. Run the deployment:"
    echo "   cd $APP_DIR"
    echo "   sudo -u $APP_USER DOMAIN=your-domain.com SETUP_NGINX=true ./scripts/deploy-to-server.sh"
    echo ""
    echo "🔧 Useful Commands:"
    echo "   sudo -u $APP_USER pm2 status          # Check application status"
    echo "   sudo -u $APP_USER pm2 logs launchpadder  # View logs"
    echo "   sudo systemctl status nginx           # Check nginx status"
    echo "   sudo ufw status                       # Check firewall status"
    echo ""
    echo "📚 Documentation: $APP_DIR/docs/dedicated-server-deployment.md"
    echo ""
    echo "🔐 Security Notes:"
    echo "   - Change default passwords"
    echo "   - Setup SSL certificates with certbot"
    echo "   - Configure monitoring and backups"
    echo "   - Review firewall rules"
}

# Main setup function
main() {
    log_info "Starting LaunchPadder server setup..."
    
    check_root
    update_system
    install_nodejs
    install_pnpm
    install_pm2
    install_nginx
    install_postgresql
    install_redis
    install_tools
    setup_firewall
    create_app_user
    setup_app_directory
    setup_ssh_keys
    configure_fail2ban
    setup_log_rotation
    create_env_template
    display_next_steps
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "LaunchPadder Server Setup Script"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Environment Variables:"
        echo "  REPO_URL=https://github.com/...  Repository URL"
        echo "  INSTALL_POSTGRES=false          Skip PostgreSQL installation"
        echo ""
        echo "Examples:"
        echo "  $0                               # Full setup"
        echo "  INSTALL_POSTGRES=false $0       # Skip PostgreSQL"
        echo "  REPO_URL=https://github.com/user/repo.git $0  # Custom repo"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac