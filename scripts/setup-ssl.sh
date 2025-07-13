#!/bin/bash

# SSL Certificate Setup Script for LaunchPadder Production
# Supports both Let's Encrypt and self-signed certificates

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SSL_DIR="$PROJECT_DIR/docker/ssl"
DOMAIN="${DOMAIN:-localhost}"
EMAIL="${EMAIL:-admin@localhost}"
CERT_TYPE="${CERT_TYPE:-letsencrypt}"

# Functions
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

check_dependencies() {
    log_info "Checking dependencies..."
    
    if [[ "$CERT_TYPE" == "letsencrypt" ]]; then
        if ! command -v certbot &> /dev/null; then
            log_error "Certbot is not installed. Please install certbot first."
            log_info "Ubuntu/Debian: sudo apt-get install certbot"
            log_info "CentOS/RHEL: sudo yum install certbot"
            log_info "macOS: brew install certbot"
            exit 1
        fi
    fi
    
    if ! command -v openssl &> /dev/null; then
        log_error "OpenSSL is not installed. Please install OpenSSL first."
        exit 1
    fi
    
    log_success "All dependencies are available"
}

create_ssl_directory() {
    log_info "Creating SSL directory structure..."
    
    mkdir -p "$SSL_DIR"
    chmod 755 "$SSL_DIR"
    
    log_success "SSL directory created: $SSL_DIR"
}

generate_dhparam() {
    log_info "Generating Diffie-Hellman parameters (this may take a while)..."
    
    if [[ ! -f "$SSL_DIR/dhparam.pem" ]]; then
        openssl dhparam -out "$SSL_DIR/dhparam.pem" 2048
        chmod 644 "$SSL_DIR/dhparam.pem"
        log_success "DH parameters generated"
    else
        log_info "DH parameters already exist, skipping..."
    fi
}

generate_self_signed_cert() {
    log_info "Generating self-signed SSL certificate for $DOMAIN..."
    
    # Create certificate configuration
    cat > "$SSL_DIR/cert.conf" << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=US
ST=State
L=City
O=Organization
OU=IT Department
CN=$DOMAIN

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = *.$DOMAIN
DNS.3 = localhost
IP.1 = 127.0.0.1
EOF

    # Generate private key
    openssl genrsa -out "$SSL_DIR/launchpadder.key" 2048
    chmod 600 "$SSL_DIR/launchpadder.key"
    
    # Generate certificate
    openssl req -new -x509 -key "$SSL_DIR/launchpadder.key" \
        -out "$SSL_DIR/launchpadder.crt" \
        -days 365 \
        -config "$SSL_DIR/cert.conf" \
        -extensions v3_req
    
    chmod 644 "$SSL_DIR/launchpadder.crt"
    
    # Clean up
    rm "$SSL_DIR/cert.conf"
    
    log_success "Self-signed certificate generated for $DOMAIN"
    log_warning "Self-signed certificates are not trusted by browsers by default"
    log_warning "For production, consider using Let's Encrypt certificates"
}

setup_letsencrypt() {
    log_info "Setting up Let's Encrypt certificate for $DOMAIN..."
    
    # Check if domain is accessible
    if ! ping -c 1 "$DOMAIN" &> /dev/null; then
        log_error "Domain $DOMAIN is not accessible. Please ensure DNS is configured correctly."
        exit 1
    fi
    
    # Create webroot directory for challenges
    mkdir -p "$PROJECT_DIR/docker/volumes/certbot"
    
    # Generate certificate
    certbot certonly \
        --webroot \
        --webroot-path="$PROJECT_DIR/docker/volumes/certbot" \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        --domains "$DOMAIN" \
        --non-interactive
    
    # Copy certificates to SSL directory
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/launchpadder.crt"
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/launchpadder.key"
    
    chmod 644 "$SSL_DIR/launchpadder.crt"
    chmod 600 "$SSL_DIR/launchpadder.key"
    
    log_success "Let's Encrypt certificate generated for $DOMAIN"
}

create_renewal_script() {
    log_info "Creating certificate renewal script..."
    
    cat > "$PROJECT_DIR/scripts/renew-ssl.sh" << 'EOF'
#!/bin/bash

# SSL Certificate Renewal Script
# Run this script periodically to renew Let's Encrypt certificates

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SSL_DIR="$PROJECT_DIR/docker/ssl"
DOMAIN="${DOMAIN:-localhost}"

log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1"
}

if [[ "$CERT_TYPE" == "letsencrypt" ]]; then
    log_info "Renewing Let's Encrypt certificate for $DOMAIN..."
    
    # Renew certificate
    certbot renew --quiet
    
    # Copy renewed certificates
    if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
        cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/launchpadder.crt"
        cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/launchpadder.key"
        
        # Reload nginx
        docker-compose exec nginx nginx -s reload
        
        log_info "Certificate renewed and nginx reloaded"
    else
        log_error "Certificate files not found after renewal"
        exit 1
    fi
else
    log_info "Self-signed certificates don't need renewal"
fi
EOF

    chmod +x "$PROJECT_DIR/scripts/renew-ssl.sh"
    
    log_success "Renewal script created: $PROJECT_DIR/scripts/renew-ssl.sh"
    
    if [[ "$CERT_TYPE" == "letsencrypt" ]]; then
        log_info "To automate renewal, add this to your crontab:"
        echo "0 2 * * * $PROJECT_DIR/scripts/renew-ssl.sh >> /var/log/ssl-renewal.log 2>&1"
    fi
}

verify_certificates() {
    log_info "Verifying SSL certificates..."
    
    if [[ -f "$SSL_DIR/launchpadder.crt" && -f "$SSL_DIR/launchpadder.key" ]]; then
        # Check certificate validity
        if openssl x509 -in "$SSL_DIR/launchpadder.crt" -text -noout &> /dev/null; then
            log_success "Certificate is valid"
            
            # Show certificate details
            echo ""
            log_info "Certificate Details:"
            openssl x509 -in "$SSL_DIR/launchpadder.crt" -text -noout | grep -E "(Subject:|Issuer:|Not Before:|Not After:|DNS:|IP Address:)"
            echo ""
        else
            log_error "Certificate is invalid"
            exit 1
        fi
        
        # Check private key
        if openssl rsa -in "$SSL_DIR/launchpadder.key" -check &> /dev/null; then
            log_success "Private key is valid"
        else
            log_error "Private key is invalid"
            exit 1
        fi
        
        # Verify key and certificate match
        cert_hash=$(openssl x509 -noout -modulus -in "$SSL_DIR/launchpadder.crt" | openssl md5)
        key_hash=$(openssl rsa -noout -modulus -in "$SSL_DIR/launchpadder.key" | openssl md5)
        
        if [[ "$cert_hash" == "$key_hash" ]]; then
            log_success "Certificate and private key match"
        else
            log_error "Certificate and private key do not match"
            exit 1
        fi
    else
        log_error "Certificate files not found"
        exit 1
    fi
}

show_usage() {
    echo "SSL Certificate Setup Script for LaunchPadder"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -d, --domain DOMAIN     Domain name for the certificate (default: localhost)"
    echo "  -e, --email EMAIL       Email for Let's Encrypt registration (default: admin@localhost)"
    echo "  -t, --type TYPE         Certificate type: letsencrypt or selfsigned (default: letsencrypt)"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  DOMAIN                  Domain name for the certificate"
    echo "  EMAIL                   Email for Let's Encrypt registration"
    echo "  CERT_TYPE               Certificate type (letsencrypt or selfsigned)"
    echo ""
    echo "Examples:"
    echo "  $0 --domain example.com --email admin@example.com --type letsencrypt"
    echo "  $0 --domain localhost --type selfsigned"
    echo "  DOMAIN=example.com EMAIL=admin@example.com $0"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--domain)
            DOMAIN="$2"
            shift 2
            ;;
        -e|--email)
            EMAIL="$2"
            shift 2
            ;;
        -t|--type)
            CERT_TYPE="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate certificate type
if [[ "$CERT_TYPE" != "letsencrypt" && "$CERT_TYPE" != "selfsigned" ]]; then
    log_error "Invalid certificate type: $CERT_TYPE. Must be 'letsencrypt' or 'selfsigned'"
    exit 1
fi

# Main execution
main() {
    echo ""
    log_info "🔒 SSL Certificate Setup for LaunchPadder"
    log_info "Domain: $DOMAIN"
    log_info "Email: $EMAIL"
    log_info "Type: $CERT_TYPE"
    echo ""
    
    check_dependencies
    create_ssl_directory
    generate_dhparam
    
    if [[ "$CERT_TYPE" == "letsencrypt" ]]; then
        setup_letsencrypt
    else
        generate_self_signed_cert
    fi
    
    create_renewal_script
    verify_certificates
    
    log_success "🎉 SSL certificate setup completed successfully!"
    echo ""
    log_info "Next steps:"
    echo "  1. Update your .env.production file with the correct domain"
    echo "  2. Start the production services: docker-compose -f docker-compose.production.yml up -d"
    echo "  3. Test HTTPS access: https://$DOMAIN"
    
    if [[ "$CERT_TYPE" == "letsencrypt" ]]; then
        echo "  4. Set up automatic renewal with cron"
    fi
}

main "$@"