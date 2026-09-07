import { makeRouter } from '../lib/router';
import crypto from 'crypto';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = makeRouter();

const ROTATE_AFTER_MS = 15_000; // QR token goes stale after 15s (anti-replay)

function newToken(): string {
  return crypto.randomBytes(12).toString('hex');
}

// A session is "ongoing" iff isActive === true. It stays active until the
// teacher explicitly ends it (§1) — leaving the screen, refreshing, or
// reopening the app never ends it. The `expiresAt` column is repurposed to
// store the END time: while active it mirrors startedAt (no real end yet), and
// POST /end stamps it with the actual end time so duration can be derived (§2).
// Security still comes from the 15s token rotation, not a session lifetime.

// POST /classes/:id/sessions (teacher) — start a session, or resume the one
// that's already active. Enforces one active session per class at the backend
// and is idempotent, so a double-tap / stale client can never create a
// duplicate active session (§1).
router.post(
  '/classes/:id/sessions',
  requireAuth,
  requireRole('teacher'),
  async (req, res) => {
    const cls = await prisma.class.findUnique({ where: { id: req.params.id } });
    if (!cls || cls.teacherId !== req.user!.id) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Return the existing active session if there is one (never duplicate).
    const existing = await prisma.session.findFirst({
      where: { classId: cls.id, isActive: true },
      orderBy: { startedAt: 'desc' },
    });
    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`[sessions] RESUMED active session ${existing.id} for class ${cls.id}`);
      return res.json({
        id: existing.id,
        token: existing.token,
        expiresAt: existing.expiresAt,
        isActive: existing.isActive,
        resumed: true,
      });
    }

    const now = new Date();
    const session = await prisma.session.create({
      data: {
        classId: cls.id,
        token: newToken(),
        startedAt: now,
        lastRotatedAt: now,
        expiresAt: now, // placeholder until the session is ended
        isActive: true,
      },
    });
    // eslint-disable-next-line no-console
    console.log(`[sessions] STARTED session ${session.id} for class ${cls.id}`);

    return res.json({
      id: session.id,
      token: session.token,
      expiresAt: session.expiresAt,
      isActive: session.isActive,
      resumed: false,
    });
  }
);

// GET /sessions/:id/token (teacher) — current token, lazily rotated on read.
router.get('/sessions/:id/token', requireAuth, requireRole('teacher'), async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { id: req.params.id },
    include: { class: true },
  });
  if (!session || session.class.teacherId !== req.user!.id) {
    return res.status(404).json({ error: 'Session not found' });
  }

  let token = session.token;
  const now = Date.now();

  // Rotate the QR token while the session is active (anti-replay); an ended
  // session keeps its last token but is reported inactive so the UI stops.
  if (session.isActive && now - session.lastRotatedAt.getTime() >= ROTATE_AFTER_MS) {
    token = newToken();
    await prisma.session.update({
      where: { id: session.id },
      data: { token, lastRotatedAt: new Date() },
    });
  }

  return res.json({
    sessionId: session.id,
    token,
    expiresAt: session.expiresAt,
    isActive: session.isActive,
  });
});

// GET /sessions/:id/live (teacher) — live present count + who.
router.get('/sessions/:id/live', requireAuth, requireRole('teacher'), async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { id: req.params.id },
    include: { class: { include: { _count: { select: { roster: true } } } } },
  });
  if (!session || session.class.teacherId !== req.user!.id) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const rows = await prisma.attendance.findMany({
    where: { sessionId: session.id },
    include: { rosterEntry: true },
    orderBy: { markedAt: 'asc' },
  });

  return res.json({
    count: rows.length,
    total: session.class._count.roster,
    present: rows.map((r) => ({
      id: r.rosterEntryId,
      name: r.rosterEntry.name,
      rollNo: r.rosterEntry.rollNo,
      markedAt: r.markedAt,
    })),
  });
});

// POST /sessions/:id/end (teacher) — finalize a session. Idempotent: ending an
// already-ended session is a no-op success (§2/§4 stale-client safety). Records
// the end time (stored in expiresAt) so duration can be derived.
router.post('/sessions/:id/end', requireAuth, requireRole('teacher'), async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { id: req.params.id },
    include: { class: true },
  });
  if (!session || session.class.teacherId !== req.user!.id) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (!session.isActive) {
    // Already ended — return the finalized state rather than erroring.
    // eslint-disable-next-line no-console
    console.log(`[sessions] END no-op → session ${session.id} was already ended`);
    return res.json({ ok: true, alreadyEnded: true, endedAt: session.expiresAt });
  }
  const endedAt = new Date();
  await prisma.session.update({
    where: { id: session.id },
    data: { isActive: false, expiresAt: endedAt },
  });
  // eslint-disable-next-line no-console
  console.log(`[sessions] ENDED session ${session.id} (class ${session.classId}) at ${endedAt.toISOString()}`);
  return res.json({ ok: true, alreadyEnded: false, endedAt });
});

// GET /sessions/:id (teacher) — full details for the Session Details screen
// (§13-15). Only fields that exist in the data model are returned. Ownership is
// validated server-side; a teacher can never read another teacher's session.
router.get('/sessions/:id', requireAuth, requireRole('teacher'), async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { id: req.params.id },
    include: {
      class: {
        include: {
          teacher: { select: { name: true } },
          _count: { select: { roster: true } },
        },
      },
      _count: { select: { attendance: true } },
    },
  });
  if (!session || session.class.teacherId !== req.user!.id) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const rosterCount = session.class._count.roster;
  const presentCount = session._count.attendance;
  const absentCount = Math.max(0, rosterCount - presentCount);
  const percentage = rosterCount === 0 ? 0 : Math.round((presentCount / rosterCount) * 100);
  // While active there is no real end time yet (expiresAt mirrors startedAt).
  const endedAt = session.isActive ? null : session.expiresAt;
  const durationMs = endedAt ? endedAt.getTime() - session.startedAt.getTime() : null;

  return res.json({
    id: session.id,
    classId: session.classId,
    className: session.class.name,
    teacherName: session.class.teacher.name,
    startedAt: session.startedAt,
    endedAt,
    isActive: session.isActive,
    durationMs,
    rosterCount,
    presentCount,
    absentCount,
    percentage,
  });
});

// GET /classes/:id/sessions/:sessionId/attendance (teacher)
// Every roster entry with present: boolean.
router.get(
  '/classes/:id/sessions/:sessionId/attendance',
  requireAuth,
  requireRole('teacher'),
  async (req, res) => {
    const cls = await prisma.class.findUnique({ where: { id: req.params.id } });
    if (!cls || cls.teacherId !== req.user!.id) {
      return res.status(404).json({ error: 'Class not found' });
    }
    const session = await prisma.session.findUnique({ where: { id: req.params.sessionId } });
    if (!session || session.classId !== cls.id) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const roster = await prisma.rosterEntry.findMany({
      where: { classId: cls.id },
      orderBy: { rollNo: 'asc' },
    });
    const marked = await prisma.attendance.findMany({ where: { sessionId: session.id } });
    const presentIds = new Set(marked.map((a) => a.rosterEntryId));

    return res.json({
      sessionId: session.id,
      startedAt: session.startedAt,
      rows: roster.map((e) => ({
        id: e.id,
        name: e.name,
        rollNo: e.rollNo,
        present: presentIds.has(e.id),
      })),
    });
  }
);

// POST /sessions/scan { sessionId, token, classId } (student) — mark present.
// classId is known client-side (scan is launched from inside a class, §10), so
// we can reject a QR that belongs to a different class with a friendly message.
router.post('/sessions/scan', requireAuth, requireRole('student'), async (req, res) => {
  const { sessionId, token, classId } = req.body ?? {};
  if (!sessionId || !token || !classId) {
    return res
      .status(400)
      .json({ success: false, reason: 'sessionId, token and classId are required' });
  }

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    return res.status(404).json({ success: false, reason: 'Session not found' });
  }
  if (session.classId !== classId) {
    return res.status(400).json({ success: false, reason: 'This QR is for a different class' });
  }
  if (!session.isActive) {
    return res.status(400).json({ success: false, reason: 'Session has ended' });
  }
  if (session.token !== token) {
    return res.status(400).json({ success: false, reason: 'QR code is out of date — try again' });
  }

  // Find this student's roster entry in the session's class.
  const entry = await prisma.rosterEntry.findFirst({
    where: { classId: session.classId, studentId: req.user!.id },
  });
  if (!entry) {
    return res.status(403).json({ success: false, reason: "You're not on this class's roster" });
  }

  const cls = await prisma.class.findUnique({ where: { id: session.classId } });

  const existing = await prisma.attendance.findUnique({
    where: {
      sessionId_rosterEntryId: { sessionId: session.id, rosterEntryId: entry.id },
    },
  });
  if (existing) {
    return res.json({
      success: true,
      already: true,
      className: cls?.name,
      markedAt: existing.markedAt,
    });
  }

  const created = await prisma.attendance.create({
    data: { sessionId: session.id, rosterEntryId: entry.id },
  });
  // eslint-disable-next-line no-console
  console.log(`[sessions] MARKED present → roster ${entry.id} in session ${session.id} (class ${session.classId})`);

  return res.json({
    success: true,
    already: false,
    className: cls?.name,
    markedAt: created.markedAt,
  });
});

// GET /students/me/history (student) — own attendance % per claimed class.
router.get('/students/me/history', requireAuth, requireRole('student'), async (req, res) => {
  const studentId = req.user!.id;
  const links = await prisma.rosterEntry.findMany({
    where: { studentId },
    include: {
      class: {
        include: {
          sessions: { orderBy: { startedAt: 'desc' } },
        },
      },
      attendance: true,
    },
  });

  const classes = links.map((link) => {
    const attendedSessionIds = new Set(link.attendance.map((a) => a.sessionId));
    const sessions = link.class.sessions.map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      present: attendedSessionIds.has(s.id),
    }));
    const total = sessions.length;
    const present = sessions.filter((s) => s.present).length;
    return {
      classId: link.class.id,
      name: link.class.name,
      rollNo: link.rollNo,
      present,
      total,
      percent: total === 0 ? 0 : Math.round((present / total) * 100),
      sessions,
    };
  });

  return res.json({ classes });
});

export default router;
