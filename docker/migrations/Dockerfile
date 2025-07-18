# Supabase CLI Migration Container
FROM supabase/cli:1.200.3

# Install PostgreSQL client for database operations
RUN apk add --no-cache postgresql-client curl bash

# Set working directory
WORKDIR /app

# Copy migration files and scripts
COPY supabase/ ./supabase/
COPY bin/ ./bin/

# Make scripts executable
RUN chmod +x ./bin/*.sh

# Set default command
CMD ["/app/bin/run-supabase-migrations.sh"]