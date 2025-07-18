#!/bin/bash

# Legacy Migration Runner (Deprecated)
# This script is deprecated in favor of run-supabase-migrations.sh
# It's kept for backward compatibility but should not be used for new deployments

echo "⚠️  WARNING: This script is deprecated!"
echo "Please use 'bin/run-supabase-migrations.sh' instead for proper Supabase CLI migration support."
echo ""
echo "The new script provides:"
echo "  - Official Supabase CLI integration"
echo "  - Better migration management"
echo "  - Improved error handling"
echo "  - Fallback to manual migration if CLI fails"
echo ""
echo "Redirecting to the new Supabase CLI migration script..."
echo ""

# Redirect to the new script
exec "$(dirname "$0")/run-supabase-migrations.sh" "$@"