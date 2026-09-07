import { PrismaClient } from '@prisma/client';

// Single Prisma client reused across the whole process (avoids exhausting
// Neon's connection pool with a new client per request / hot-reload).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
