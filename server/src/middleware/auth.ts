import { NextFunction, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { prisma } from '../db';

export type Role = 'teacher' | 'student';

// The authenticated app user attached to the request. `id` is the internal
// Profile id — every relation (classes, roster, attendance) keys off it, so the
// rest of the codebase is unchanged. `clerkUserId` is the Clerk identity.
export interface AuthUser {
  id: string;
  role: Role;
  clerkUserId: string;
}

// Augment Express Request with the decoded user + raw Clerk id.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      clerkUserId?: string;
    }
  }
}

/**
 * requireClerk — verifies there is a valid Clerk session, but does NOT require
 * an app Profile to exist yet. Use this for the setup endpoints that run before
 * a Profile row is created (GET /auth/me, POST /auth/profile). `clerkMiddleware()`
 * (mounted in index.ts) must run first so getAuth(req) is populated.
 */
export function requireClerk(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }
  req.clerkUserId = userId;
  next();
}

/**
 * requireAuth — verifies the Clerk session AND loads the app Profile, attaching
 * { id, role, clerkUserId } to req.user. If the user is signed in with Clerk but
 * has not finished setup (no Profile / no role yet), responds 403 with
 * code:'NO_PROFILE' so the client can route to the role picker.
 *
 * Async, but makeRouter() forwards any rejection to the error middleware; the
 * explicit try/catch below is belt-and-suspenders so a DB blip never hangs.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    const profile = await prisma.profile.findUnique({ where: { clerkUserId: userId } });
    if (!profile) {
      res.status(403).json({ error: 'Finish setup by choosing a role', code: 'NO_PROFILE' });
      return;
    }
    req.user = { id: profile.id, role: profile.role, clerkUserId: userId };
    req.clerkUserId = userId;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: `Requires ${role} role` });
      return;
    }
    next();
  };
}
