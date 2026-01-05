# Dockerfile for Railway - County CAD Tracker API
# Updated: Jan 5, 2026 - Fixed path issue
FROM node:18-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

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

# Generate Prisma Client
RUN npx prisma generate

# Expose port
EXPOSE 8080

# Use startup script for robust initialization
CMD ["sh", "start.sh"]
