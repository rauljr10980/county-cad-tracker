# Use Node.js 18 (Railway compatible)
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy functions package files
COPY functions/package*.json functions/
COPY functions/prisma functions/prisma/

# Install dependencies
WORKDIR /app/functions
RUN npm install --production=false

# Copy application code
COPY functions/src functions/src/

# Generate Prisma Client
RUN npx prisma generate

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start command
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
