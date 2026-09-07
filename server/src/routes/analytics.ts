import { makeRouter } from '../lib/router';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = makeRouter();

type Range = 'week' | 'month' | '6months' | 'year';

async function ownedClass(classId: string, teacherId: string) {
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls || cls.teacherId !== teacherId) return null;
  return cls;
}

function parseRange(raw: unknown): Range {
  return raw === 'month' || raw === '6months' || raw === 'year' ? raw : 'week';
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface BucketRange {
  label: string;
  start: Date;
  end: Date; // exclusive
}

// Bucket granularity shrinks as the range grows so charts never overflow (§5/§11):
// week → 7 daily, month → 4 weekly, 6months → 6 monthly, year → 12 monthly.
function buildBuckets(range: Range): BucketRange[] {
  const now = new Date();
  const buckets: BucketRange[] = [];

  if (range === 'week') {
    const today = startOfDay(now);
    for (let i = 6; i >= 0; i--) {
      const start = addDays(today, -i);
      buckets.push({ label: WEEKDAY[start.getDay()], start, end: addDays(start, 1) });
    }
  } else if (range === 'month') {
    const tomorrow = addDays(startOfDay(now), 1); // exclusive end covering today
    for (let i = 3; i >= 0; i--) {
      const end = addDays(tomorrow, -i * 7);
      const start = addDays(end, -7);
      buckets.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, start, end });
    }
  } else {
    const count = range === '6months' ? 6 : 12;
    const thisMonth = startOfMonth(now);
    for (let i = count - 1; i >= 0; i--) {
      const start = addMonths(thisMonth, -i);
      buckets.push({ label: MONTH[start.getMonth()], start, end: addMonths(start, 1) });
    }
  }
  return buckets;
}

function pct(present: number, total: number) {
  return total === 0 ? 0 : Math.round((present / total) * 100);
}

// ---- Custom date range (§10) ----
// Screens may pass ?start=YYYY-MM-DD&end=YYYY-MM-DD instead of a preset range.
// Dates are interpreted in the server's local day boundaries to match the
// preset bucketing above. The range is inclusive of both endpoints.

function parseYmd(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // Reject impossible dates like 2026-02-31 (which JS would roll over).
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return startOfDay(date);
}

// Bucket a custom [start, end] span, shrinking granularity as it grows so charts
// stay readable: ≤31 days → daily, ≤ ~26 weeks → weekly, else monthly. The first
// bucket always starts exactly at `start` so nothing before the range leaks in.
function buildCustomBuckets(start: Date, endInclusive: Date): BucketRange[] {
  const endExclusive = addDays(endInclusive, 1);
  const spanDays = Math.round((endExclusive.getTime() - start.getTime()) / 86_400_000);
  const buckets: BucketRange[] = [];

  if (spanDays <= 31) {
    for (let d = new Date(start); d < endExclusive; d = addDays(d, 1)) {
      buckets.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, start: new Date(d), end: addDays(d, 1) });
    }
  } else if (spanDays <= 182) {
    for (let s = new Date(start); s < endExclusive; s = addDays(s, 7)) {
      const e = addDays(s, 7);
      buckets.push({ label: `${s.getMonth() + 1}/${s.getDate()}`, start: new Date(s), end: e > endExclusive ? endExclusive : e });
    }
  } else {
    for (let m = new Date(start); m < endExclusive; ) {
      const next = addMonths(startOfMonth(m), 1);
      const e = next > endExclusive ? endExclusive : next;
      buckets.push({ label: `${MONTH[m.getMonth()]} ${String(m.getFullYear()).slice(2)}`, start: new Date(m), end: e });
      m = next;
    }
  }
  return buckets;
}

type Resolved = { error: string } | { buckets: BucketRange[]; rangeStart: Date; rangeEnd: Date };

// Resolve either a custom start/end range or a preset range into buckets plus the
// [rangeStart, rangeEnd) window used to filter sessions server-side (§10: the
// backend does the date filtering; the client never fetches-all-then-filters).
function resolveRange(query: Record<string, unknown>): Resolved {
  const hasStart = query.start !== undefined && query.start !== '';
  const hasEnd = query.end !== undefined && query.end !== '';

  if (hasStart || hasEnd) {
    const start = parseYmd(query.start);
    const end = parseYmd(query.end);
    if (!start || !end) return { error: 'start and end must both be valid YYYY-MM-DD dates' };
    if (end < start) return { error: 'End date cannot be before start date' };
    const buckets = buildCustomBuckets(start, end);
    return { buckets, rangeStart: buckets[0].start, rangeEnd: buckets[buckets.length - 1].end };
  }

  const buckets = buildBuckets(parseRange(query.range));
  return { buckets, rangeStart: buckets[0].start, rangeEnd: buckets[buckets.length - 1].end };
}

// Distinct roster entries present today + current roster size (for the donut).
async function todayStat(classId: string) {
  const start = startOfDay(new Date());
  const end = addDays(start, 1);
  const [total, att] = await Promise.all([
    prisma.rosterEntry.count({ where: { classId } }),
    prisma.attendance.findMany({
      where: { session: { classId, startedAt: { gte: start, lt: end } } },
      select: { rosterEntryId: true },
    }),
  ]);
  return { present: new Set(att.map((a) => a.rosterEntryId)).size, total };
}

// GET /classes/:id/analytics/summary?range= (teacher, class-wide, §11).
// Per bucket: present = attendance rows across that bucket's sessions;
// total = (#sessions in bucket) × current roster size. (Roster size is taken at
// request time — a fine simplification at this scale, per §11.)
router.get('/classes/:id/analytics/summary', requireAuth, requireRole('teacher'), async (req, res) => {
  const cls = await ownedClass(req.params.id, req.user!.id);
  if (!cls) return res.status(404).json({ error: 'Class not found' });

  const resolved = resolveRange(req.query as Record<string, unknown>);
  if ('error' in resolved) return res.status(400).json({ error: resolved.error });
  const { buckets, rangeStart, rangeEnd } = resolved;

  const [rosterSize, sessions, today] = await Promise.all([
    prisma.rosterEntry.count({ where: { classId: cls.id } }),
    prisma.session.findMany({
      where: { classId: cls.id, startedAt: { gte: rangeStart, lt: rangeEnd } },
      select: { startedAt: true, _count: { select: { attendance: true } } },
    }),
    todayStat(cls.id),
  ]);

  let sumPresent = 0;
  let sumTotal = 0;
  const out = buckets.map((b) => {
    const inBucket = sessions.filter((s) => s.startedAt >= b.start && s.startedAt < b.end);
    const present = inBucket.reduce((n, s) => n + s._count.attendance, 0);
    const total = inBucket.length * rosterSize;
    sumPresent += present;
    sumTotal += total;
    return { label: b.label, present, total, percentage: pct(present, total) };
  });

  return res.json({ buckets: out, averagePercentage: pct(sumPresent, sumTotal), today });
});

// GET /classes/:id/analytics/students?range= (teacher, per-student, ascending, §11).
router.get('/classes/:id/analytics/students', requireAuth, requireRole('teacher'), async (req, res) => {
  const cls = await ownedClass(req.params.id, req.user!.id);
  if (!cls) return res.status(404).json({ error: 'Class not found' });

  const resolved = resolveRange(req.query as Record<string, unknown>);
  if ('error' in resolved) return res.status(400).json({ error: resolved.error });
  const { rangeStart, rangeEnd } = resolved;

  const sessions = await prisma.session.findMany({
    where: { classId: cls.id, startedAt: { gte: rangeStart, lt: rangeEnd } },
    select: { id: true },
  });
  const totalSessions = sessions.length;
  const sessionIds = sessions.map((s) => s.id);

  const roster = await prisma.rosterEntry.findMany({
    where: { classId: cls.id },
    select: {
      id: true,
      name: true,
      rollNo: true,
      attendance: { where: { sessionId: { in: sessionIds } }, select: { id: true } },
    },
    orderBy: { rollNo: 'asc' },
  });

  const students = roster
    .map((e) => ({
      rosterEntryId: e.id,
      name: e.name,
      rollNo: e.rollNo,
      percentage: pct(e.attendance.length, totalSessions),
    }))
    .sort((a, b) => a.percentage - b.percentage);

  return res.json(students);
});

// GET /classes/:id/analytics/me?range= (student, personal, same bucket shape, §11).
router.get('/classes/:id/analytics/me', requireAuth, requireRole('student'), async (req, res) => {
  const entry = await prisma.rosterEntry.findFirst({
    where: { classId: req.params.id, studentId: req.user!.id },
    select: { id: true },
  });
  if (!entry) return res.status(404).json({ error: 'You are not enrolled in this class' });

  const resolved = resolveRange(req.query as Record<string, unknown>);
  if ('error' in resolved) return res.status(400).json({ error: resolved.error });
  const { buckets, rangeStart, rangeEnd } = resolved;

  const sessions = await prisma.session.findMany({
    where: { classId: req.params.id, startedAt: { gte: rangeStart, lt: rangeEnd } },
    select: { id: true, startedAt: true },
  });
  const attended = await prisma.attendance.findMany({
    where: { rosterEntryId: entry.id, session: { startedAt: { gte: rangeStart, lt: rangeEnd } } },
    select: { sessionId: true },
  });
  const attendedSet = new Set(attended.map((a) => a.sessionId));

  let sumPresent = 0;
  let sumTotal = 0;
  const todayStart = startOfDay(new Date());
  const todayEnd = addDays(todayStart, 1);
  let todayPresent = 0;
  let todayTotal = 0;

  const out = buckets.map((b) => {
    const inBucket = sessions.filter((s) => s.startedAt >= b.start && s.startedAt < b.end);
    const present = inBucket.filter((s) => attendedSet.has(s.id)).length;
    const total = inBucket.length;
    sumPresent += present;
    sumTotal += total;
    return { label: b.label, present, total, percentage: pct(present, total) };
  });

  for (const s of sessions) {
    if (s.startedAt >= todayStart && s.startedAt < todayEnd) {
      todayTotal++;
      if (attendedSet.has(s.id)) todayPresent++;
    }
  }

  return res.json({
    buckets: out,
    averagePercentage: pct(sumPresent, sumTotal),
    today: { present: todayPresent, total: todayTotal },
  });
});

// GET /classes/:id/history (teacher) — full attendance matrix (used by the
// history screen / CSV export). Unchanged.
router.get('/classes/:id/history', requireAuth, requireRole('teacher'), async (req, res) => {
  const cls = await ownedClass(req.params.id, req.user!.id);
  if (!cls) return res.status(404).json({ error: 'Class not found' });

  const sessions = await prisma.session.findMany({
    where: { classId: cls.id },
    orderBy: { startedAt: 'asc' },
    select: { id: true, startedAt: true },
  });
  const roster = await prisma.rosterEntry.findMany({
    where: { classId: cls.id },
    include: { attendance: { select: { sessionId: true } } },
    orderBy: { rollNo: 'asc' },
  });

  const totalSessions = sessions.length;
  const students = roster.map((e) => {
    const attended = new Set(e.attendance.map((a) => a.sessionId));
    const present = sessions.map((s) => attended.has(s.id));
    const presentCount = present.filter(Boolean).length;
    return {
      id: e.id,
      name: e.name,
      rollNo: e.rollNo,
      present,
      presentCount,
      totalSessions,
      percent: totalSessions === 0 ? 0 : Math.round((presentCount / totalSessions) * 100),
    };
  });

  return res.json({
    class: { id: cls.id, name: cls.name },
    sessions: sessions.map((s) => ({ id: s.id, startedAt: s.startedAt })),
    students,
  });
});

export default router;
