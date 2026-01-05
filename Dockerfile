# Simple, bulletproof Dockerfile for Railway
FROM node:18-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Set working directory to functions
WORKDIR /app

# Copy package files first for better caching
COPY functions/package*.json ./

# Install ALL dependencies (including devDependencies for Prisma)
RUN npm install

# Copy the rest of the application
COPY functions/ ./

# Generate Prisma Client
RUN npx prisma generate

# Expose port
EXPOSE 8080

# Use db push for initial schema, then start server
CMD npx prisma db push --accept-data-loss && node src/index.js
