# Use Node.js 20 Alpine as base image
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat less postgresql-client bash curl

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Install dependencies based on the preferred package manager
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Install pnpm in builder stage
RUN npm install -g pnpm

# Set build-time environment variables for SvelteKit
# These are required for PUBLIC_ variables to be available during build
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_ANON_KEY
ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL
ENV PUBLIC_SUPABASE_ANON_KEY=$PUBLIC_SUPABASE_ANON_KEY

# Build the application
RUN pnpm run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

# Install runtime dependencies for entrypoint script
RUN apk add --no-cache postgresql-client bash curl

ENV NODE_ENV=production
# Disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

# Accept build arguments for user/group IDs from host
ARG USER_ID=1001
ARG GROUP_ID=1001
ARG USERNAME=appuser

# Create group and user with host OS IDs
RUN addgroup --system --gid ${GROUP_ID} ${USERNAME} && \
    adduser --system --uid ${USER_ID} --ingroup ${USERNAME} ${USERNAME}

# Copy the built application
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Install pnpm and production dependencies
RUN npm install -g pnpm
RUN pnpm install --prod --frozen-lockfile

# Copy database migrations and scripts
COPY --from=builder /app/supabase ./supabase
COPY --from=builder /app/bin ./bin

# Create uploads and logs directories
RUN mkdir -p /app/uploads /app/logs
RUN chown ${USERNAME}:${USERNAME} /app/uploads /app/logs

# Make entrypoint script executable
RUN chmod +x /app/bin/docker-entrypoint.sh

# Install Supabase CLI for migrations (as root before switching user)
RUN apk add --no-cache wget tar
RUN wget -O /tmp/supabase.tar.gz https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz && \
    tar -xzf /tmp/supabase.tar.gz -C /tmp && \
    mv /tmp/supabase /usr/local/bin/supabase && \
    chmod +x /usr/local/bin/supabase && \
    rm -f /tmp/supabase.tar.gz

USER ${USERNAME}

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application with entrypoint script
CMD ["/app/bin/docker-entrypoint.sh"]