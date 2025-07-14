#!/bin/bash

# Docker Services Individual Testing Script
# This script tests each Docker service individually to identify issues

set -e

echo "🔧 Docker Services Individual Testing Script"
echo "============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "SUCCESS") echo -e "${GREEN}✅ $message${NC}" ;;
        "ERROR") echo -e "${RED}❌ $message${NC}" ;;
        "WARNING") echo -e "${YELLOW}⚠️  $message${NC}" ;;
        "INFO") echo -e "${BLUE}ℹ️  $message${NC}" ;;
    esac
}

# Function to test a service
test_service() {
    local service=$1
    local timeout=${2:-30}
    
    print_status "INFO" "Testing service: $service"
    
    # Start the service
    if docker compose up -d $service; then
        print_status "SUCCESS" "$service started successfully"
        
        # Wait for service to be healthy or timeout
        local count=0
        while [ $count -lt $timeout ]; do
            if docker compose ps $service | grep -q "healthy\|Up"; then
                print_status "SUCCESS" "$service is running and healthy"
                
                # Show logs for debugging
                echo "Recent logs for $service:"
                docker compose logs --tail=10 $service
                echo "---"
                return 0
            fi
            sleep 1
            count=$((count + 1))
        done
        
        print_status "ERROR" "$service failed to become healthy within ${timeout}s"
        echo "Logs for $service:"
        docker compose logs --tail=20 $service
        echo "---"
        return 1
    else
        print_status "ERROR" "Failed to start $service"
        return 1
    fi
}

# Function to cleanup
cleanup() {
    print_status "INFO" "Cleaning up containers..."
    docker compose down -v --remove-orphans
}

# Main testing sequence
main() {
    print_status "INFO" "Starting individual service tests..."
    
    # Clean up first
    cleanup
    
    # Test services in dependency order
    local services=(
        "vector:10"
        "db:60"
        "migrations:30"
        "auth:20"
        "rest:20"
        "realtime:20"
        "storage:20"
        "imgproxy:10"
        "meta:15"
        "functions:20"
        "supavisor:20"
        "analytics:30"
        "kong:20"
        "studio:20"
    )
    
    local failed_services=()
    
    for service_config in "${services[@]}"; do
        IFS=':' read -r service timeout <<< "$service_config"
        
        if ! test_service "$service" "$timeout"; then
            failed_services+=("$service")
        fi
        
        # Stop the service after testing (except db which others depend on)
        if [ "$service" != "db" ] && [ "$service" != "vector" ]; then
            docker compose stop "$service"
        fi
        
        echo ""
    done
    
    # Summary
    echo "============================================="
    print_status "INFO" "Test Summary"
    echo "============================================="
    
    if [ ${#failed_services[@]} -eq 0 ]; then
        print_status "SUCCESS" "All services passed individual tests!"
    else
        print_status "ERROR" "Failed services: ${failed_services[*]}"
        
        echo ""
        print_status "INFO" "Common issues and fixes:"
        echo "1. Database authentication - Check .env passwords match init-db.sql"
        echo "2. Kong configuration - Check volumes/api/kong.yml syntax"
        echo "3. Missing environment variables - Verify .env file completeness"
        echo "4. Volume permissions - Check Docker volume mounts"
        echo "5. Network connectivity - Ensure services can reach dependencies"
    fi
    
    # Final cleanup
    cleanup
}

# Run main function
main "$@"