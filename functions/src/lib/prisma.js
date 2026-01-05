/**
 * Shared Prisma Client Instance
 * Prevents connection pool exhaustion by using a single instance
 */

const { PrismaClient } = require('@prisma/client');

// Singleton pattern - only one Prisma instance for the entire application
let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // In development, use global variable to prevent hot-reload from creating new instances
  if (!global.prisma) {
    global.prisma = new PrismaClient();
  }
  prisma = global.prisma;
}

module.exports = prisma;
