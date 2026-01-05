# Use the official Node.js runtime as base image
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy Prisma schema (needed before generating client)
COPY prisma ./prisma

# Install dependencies (including dev dependencies for Prisma)
RUN npm ci

# Generate Prisma Client (after schema is copied)
RUN npx prisma generate

# Copy application code
COPY . .

# Make start.sh executable
RUN chmod +x start.sh

# Expose port (Cloud Run sets PORT env var)
EXPOSE 8080

# Use start script that handles database setup
CMD ["sh", "start.sh"]

