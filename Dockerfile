# Use Node.js 18 (Railway compatible)
FROM node:18-alpine

# Install dependencies for Prisma
RUN apk add --no-cache openssl

# Set working directory
WORKDIR /app/functions

# Copy package files
COPY functions/package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy Prisma schema
COPY functions/prisma ./prisma/

# Generate Prisma Client
RUN npx prisma generate

# Copy application code and startup script
COPY functions/src ./src/
COPY functions/start.sh ./start.sh

# Make startup script executable
RUN chmod +x ./start.sh

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start command
CMD ["./start.sh"]
