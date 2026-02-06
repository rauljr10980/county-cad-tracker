# Dockerfile for Railway - County CAD Tracker API
# Updated: Jan 5, 2026 - Fixed path issue
FROM node:18-slim

# Build argument to force cache invalidation
ARG CACHE_BUST=2026-01-05-v3
RUN echo "Cache bust: $CACHE_BUST"

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Skip automatic Playwright browser download during npm install (we install manually below)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY functions/package*.json ./

# Install ALL dependencies (including devDependencies for Prisma)
RUN npm install

# Copy the rest of the application
COPY functions/ ./

# Make start script executable
RUN chmod +x start.sh

# Install Playwright Chromium with system dependencies
RUN npx playwright install chromium --with-deps

# Generate Prisma Client
RUN npx prisma generate

# Expose port
EXPOSE 8080

# Use startup script for robust initialization
# The start.sh script will run: node src/index.js
CMD ["sh", "start.sh"]
