# Use the official Node.js runtime as base image
FROM node:18-slim

# Install Chromium dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use system Chromium instead of downloading
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

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
