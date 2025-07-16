# Nginx Configuration Documentation

This directory contains production-ready Nginx configurations for multiple domains with SSL termination and www redirect functionality.

## Domains Configured

- **devvelocity.com** - [`devvelocity.com.conf`](devvelocity.com.conf)
- **autolaunchr.com** - [`autolaunchr.com.conf`](autolaunchr.com.conf)
- **launchpadder.com** - [`launchpadder.com.conf`](launchpadder.com.conf)

## Features

### SSL/TLS Configuration
- **Modern SSL protocols**: TLS 1.2 and 1.3 only
- **Strong cipher suites**: ECDHE and ChaCha20-Poly1305 ciphers
- **OCSP stapling**: Enabled for improved SSL performance
- **HSTS**: Strict Transport Security with preload
- **Perfect Forward Secrecy**: Ensured through cipher selection

### Security Headers
- `Strict-Transport-Security`: Forces HTTPS for 2 years with subdomains
- `X-Content-Type-Options`: Prevents MIME type sniffing
- `X-Frame-Options`: Prevents clickjacking attacks
- `X-XSS-Protection`: Enables XSS filtering
- `Referrer-Policy`: Controls referrer information
- `Content-Security-Policy`: Restricts resource loading

### Redirects
- **HTTP to HTTPS**: All HTTP traffic redirected to HTTPS
- **www to non-www**: Canonical domain without www prefix
- **301 redirects**: SEO-friendly permanent redirects

### Performance Optimizations
- **HTTP/2**: Enabled for all HTTPS connections
- **Gzip compression**: Optimized for web assets
- **Static asset caching**: 1-year cache for static files
- **Proxy optimizations**: Configured for Node.js application

## Installation Instructions

### 1. Copy Configuration Files
```bash
# Copy configurations to Nginx sites-available
sudo cp etc/*.conf /etc/nginx/sites-available/

# Enable sites
sudo ln -s /etc/nginx/sites-available/devvelocity.com.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/autolaunchr.com.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/launchpadder.com.conf /etc/nginx/sites-enabled/
```

### 2. SSL Certificate Setup
Each domain requires SSL certificates. Use Let's Encrypt:

```bash
# Install Certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Obtain certificates for each domain
sudo certbot --nginx -d devvelocity.com -d www.devvelocity.com
sudo certbot --nginx -d autolaunchr.com -d www.autolaunchr.com
sudo certbot --nginx -d launchpadder.com -d www.launchpadder.com
```

### 3. Create Required Directories
```bash
# Create web roots
sudo mkdir -p /var/www/devvelocity.com
sudo mkdir -p /var/www/autolaunchr.com
sudo mkdir -p /var/www/launchpadder.com

# Create certbot directory for challenges
sudo mkdir -p /var/www/certbot

# Set permissions
sudo chown -R www-data:www-data /var/www/
```

### 4. Test and Reload Nginx
```bash
# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

## Configuration Details

### Proxy Settings
All configurations proxy requests to `http://localhost:3000` where the Node.js application runs:

```nginx
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
    proxy_read_timeout 86400;
}
```

### Static Asset Optimization
Static files are cached for optimal performance:

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### Security Blocks
Sensitive files and directories are blocked:

```nginx
location ~ /\. {
    deny all;
    access_log off;
    log_not_found off;
}
```

## Monitoring and Logs

### Log Files
Each domain has dedicated log files:
- Access logs: `/var/log/nginx/{domain}.access.log`
- Error logs: `/var/log/nginx/{domain}.error.log`

### Health Checks
Health check endpoint available at `/health` for monitoring:

```nginx
location /health {
    proxy_pass http://localhost:3000/health;
    proxy_set_header Host $host;
    access_log off;
}
```

## SSL Certificate Renewal

Certificates auto-renew via cron job:

```bash
# Check renewal status
sudo certbot renew --dry-run

# Manual renewal if needed
sudo certbot renew
sudo systemctl reload nginx
```

## Troubleshooting

### Common Issues

1. **SSL Certificate Errors**
   ```bash
   # Check certificate status
   sudo certbot certificates
   
   # Renew specific certificate
   sudo certbot renew --cert-name domain.com
   ```

2. **Nginx Configuration Errors**
   ```bash
   # Test configuration
   sudo nginx -t
   
   # Check error logs
   sudo tail -f /var/log/nginx/error.log
   ```

3. **Proxy Connection Issues**
   ```bash
   # Verify Node.js app is running on port 3000
   sudo netstat -tlnp | grep :3000
   
   # Check application logs
   sudo journalctl -u your-app-service -f
   ```

### Performance Testing

Test SSL configuration:
```bash
# SSL Labs test (online)
# https://www.ssllabs.com/ssltest/

# Local SSL test
openssl s_client -connect domain.com:443 -servername domain.com
```

Test redirects:
```bash
# Test HTTP to HTTPS redirect
curl -I http://domain.com

# Test www to non-www redirect
curl -I https://www.domain.com
```

## Security Considerations

1. **Regular Updates**: Keep Nginx and SSL certificates updated
2. **Monitoring**: Monitor access logs for suspicious activity
3. **Firewall**: Ensure only ports 80 and 443 are open
4. **Rate Limiting**: Consider adding rate limiting for production
5. **DDoS Protection**: Use CloudFlare or similar service for additional protection

## Customization

To modify configurations for specific needs:

1. **Change backend port**: Update `proxy_pass http://localhost:PORT`
2. **Add rate limiting**: Include `limit_req` directives
3. **Custom headers**: Add domain-specific headers as needed
4. **Caching**: Adjust cache settings for different file types

## Support

For issues or questions regarding these configurations:
1. Check Nginx error logs first
2. Verify SSL certificate status
3. Test configuration with `nginx -t`
4. Consult Nginx documentation for advanced features