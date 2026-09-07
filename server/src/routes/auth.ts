import { clerkClient } from '@clerk/express';
import { prisma } from '../db';
import { makeRouter } from '../lib/router';
import { requireAuth, requireClerk, Role } from '../middleware/auth';

const router = makeRouter();

// Thrown inside the delete transaction to distinguish "already gone" (→ 404)
// from a genuine failure (→ 500).
class NotFoundError extends Error {}

function publicUser(p: { id: string; name: string; email: string; role: Role }) {
  return { id: p.id, name: p.name, email: p.email, role: p.role };
}

// Pull the best email + display name Clerk knows for a user. Clerk is the source
// of truth for identity; we only mirror what we need (email/name) into Profile so
// the rest of the app doesn't have to call Clerk on every request.
async function clerkIdentity(clerkUserId: string): Promise<{ email: string; name: string }> {
  const u = await clerkClient.users.getUser(clerkUserId);
  const primary =
    u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0];
  const email = (primary?.emailAddress ?? '').toLowerCase();
  const fromNames = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  const name = fromNames || u.username || (email ? email.split('@')[0] : 'User');
  return { email, name };
}

// GET /auth/me — resolve the signed-in Clerk user to an app Profile.
// Requires a valid Clerk session but NOT an existing Profile: if the user hasn't
// picked a role yet, we return { user: null, needsProfile: true } so the client
// routes them to the role picker instead of erroring.
router.get('/me', requireClerk, async (req, res) => {
  const clerkUserId = req.clerkUserId!;
  const profile = await prisma.profile.findUnique({ where: { clerkUserId } });
  if (!profile) {
    return res.json({ user: null, needsProfile: true });
  }
  return res.json({ user: publicUser(profile), needsProfile: false });
});

// POST /auth/profile { role, name? } — one-time setup: create the app Profile for
// the signed-in Clerk user with the role they picked. Idempotent: if a Profile
// already exists it's returned unchanged (a double-tap or a resumed setup can
// never create a second row or silently flip an existing role).
//
// Identity (email/name) is pulled from Clerk, never trusted from the client — the
// only client-supplied value is the role (and an optional display-name override).
router.post('/profile', requireClerk, async (req, res) => {
  const clerkUserId = req.clerkUserId!;
  const role: unknown = req.body?.role;
  if (role !== 'teacher' && role !== 'student') {
    return res.status(400).json({ error: "role must be 'teacher' or 'student'" });
  }

  const existing = await prisma.profile.findUnique({ where: { clerkUserId } });
  if (existing) {
    // Already set up — return as-is (idempotent), don't overwrite the role.
    // eslint-disable-next-line no-console
    console.log(`[auth] PROFILE exists → returning ${existing.id} (${existing.role}) for clerk ${clerkUserId}`);
    return res.json({ user: publicUser(existing), created: false });
  }

  const identity = await clerkIdentity(clerkUserId);
  const overrideName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const name = overrideName || identity.name;

  try {
    const created = await prisma.profile.create({
      data: { clerkUserId, email: identity.email, name, role },
    });
    // eslint-disable-next-line no-console
    console.log(`[auth] PROFILE created → ${created.id} (${created.role}) for clerk ${clerkUserId}`);
    return res.json({ user: publicUser(created), created: true });
  } catch (err) {
    // Unique violation on email (P2002) — another account already uses it.
    if ((err as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'An account already exists for this email' });
    }
    throw err;
  }
});

// PATCH /auth/me { name } (authenticated) — update the display name (§8).
// Email and password are owned by Clerk now and are changed in the Clerk-hosted
// account UI, so the only editable app-side field is the display name.
router.patch('/me', requireAuth, async (req, res) => {
  const { name } = req.body ?? {};
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return res.status(400).json({ error: 'name is required' });

  const updated = await prisma.profile.update({
    where: { id: req.user!.id },
    data: { name: trimmed },
  });
  // eslint-disable-next-line no-console
  console.log(`[auth] PROFILE updated → ${updated.id} name changed`);
  return res.json({ user: publicUser(updated) });
});

// DELETE /auth/me (authenticated) — permanently delete the signed-in account.
//
// Data-integrity strategy (§6): the Profile delete runs inside a $transaction so
// it's atomic (all-or-nothing). Attendance history is preserved sensibly:
//   • Student → schema onDelete:SetNull nulls their RosterEntry.studentId, so the
//     roster rows and Attendance survive (just unlinked from the person).
//   • Teacher → they solely own their classes, so those classes (and the sessions
//     / attendance inside) cascade-delete with the account.
// After the app row is gone we delete the Clerk user too, so the identity can't
// sign back in to a now-orphaned account. Clerk deletion is best-effort: if it
// fails we still report success (the app-side account — the thing that grants
// access to data — is already gone) and log for follow-up.
router.delete('/me', requireAuth, async (req, res) => {
  const id = req.user!.id;
  const clerkUserId = req.user!.clerkUserId;
  try {
    await prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({ where: { id } });
      if (!profile) throw new NotFoundError();
      await tx.profile.delete({ where: { id } });
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return res.status(404).json({ error: 'Account not found' });
    }
    // eslint-disable-next-line no-console
    console.error('[auth] account deletion failed:', err);
    return res.status(500).json({ error: 'Could not delete your account. Please try again.' });
  }

  try {
    await clerkClient.users.deleteUser(clerkUserId);
    // eslint-disable-next-line no-console
    console.log(`[auth] DELETED profile ${id} + Clerk user ${clerkUserId}`);
  } catch (err) {
    // App-side account is already deleted; a lingering Clerk user is harmless
    // (GET /auth/me will just offer the role picker again). Log and move on.
    // eslint-disable-next-line no-console
    console.error(`[auth] profile ${id} deleted, but Clerk user ${clerkUserId} deletion failed:`, err);
  }
  return res.json({ ok: true });
});

export default router;
