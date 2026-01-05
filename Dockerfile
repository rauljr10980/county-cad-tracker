# Simple, bulletproof Dockerfile for Railway
FROM node:18-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy everything from functions folder
COPY functions ./

# Install ALL dependencies (including devDependencies for Prisma)
RUN npm install

# Generate Prisma Client
RUN npx prisma generate

# Expose port
EXPOSE 8080

# Simple start command
CMD npx prisma migrate deploy && node src/index.js
