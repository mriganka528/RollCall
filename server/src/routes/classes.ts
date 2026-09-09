import { makeRouter } from '../lib/router';
import multer from 'multer';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
// pdf-parse has no bundled types; require keeps it simple.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = makeRouter();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

type ParsedRow = { name: string; rollNo: string };

// Turn an array of token-arrays (one per line/row) into { name, rollNo } rows
// using the §7 heuristic. Sequential R1/R2.. roll numbers fill single-token rows.
function tokensToRows(lines: string[][]): ParsedRow[] {
  const rows: ParsedRow[] = [];
  let auto = 1;
  for (const raw of lines) {
    const tokens = raw.map((t) => String(t).trim()).filter(Boolean);
    if (tokens.length === 0) continue;

    // Skip obvious header rows.
    const joined = tokens.join(' ').toLowerCase();
    if (/^(name|roll|s\.?no|sr\.?no|#)\b/.test(joined) && tokens.length <= 3 &&
        tokens.every((t) => /^[a-z .#]+$|no/i.test(t))) {
      continue;
    }

    const alpha = tokens.filter((t) => /^[A-Za-z][A-Za-z .'-]*$/.test(t));
    const withDigit = tokens.filter((t) => /\d/.test(t));

    let name = '';
    let rollNo = '';

    if (withDigit.length > 0) rollNo = withDigit[0];
    if (alpha.length > 0) {
      // Join consecutive alphabetic tokens into a full name.
      name = alpha.join(' ');
    }

    if (!name && !rollNo) {
      name = tokens.join(' ');
    }
    if (!name) name = tokens.filter((t) => t !== rollNo).join(' ') || tokens[0];
    if (!rollNo) rollNo = `R${auto++}`;

    rows.push({ name: name.trim(), rollNo: rollNo.trim() });
  }
  return rows;
}

function parseCsv(buf: Buffer): ParsedRow[] {
  const text = buf.toString('utf8');
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => l.split(/[,\t;]/));
  return tokensToRows(lines);
}

function parseXlsx(buf: Buffer): ParsedRow[] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  const lines = grid.map((row) => row.map((c) => (c == null ? '' : String(c))));
  return tokensToRows(lines);
}

async function parseDocx(buf: Buffer): Promise<ParsedRow[]> {
  const { value } = await mammoth.extractRawText({ buffer: buf });
  const lines = value
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => l.split(/[\t,;]+|\s{2,}/));
  return tokensToRows(lines);
}

async function parsePdf(buf: Buffer): Promise<ParsedRow[]> {
  const data = await pdfParse(buf);
  const lines = String(data.text)
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => l.split(/[\t,;]+|\s{2,}/));
  return tokensToRows(lines);
}

// Build a short human-friendly join code like "MATH-3F9K".
function makeJoinCode(name: string): string {
  const prefix = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'CLS';
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}-${suffix}`;
}

// Ensure the class exists and belongs to the signed-in teacher.
async function ownedClass(classId: string, teacherId: string) {
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls || cls.teacherId !== teacherId) return null;
  return cls;
}

// ---------------- Class CRUD ----------------

// POST /classes (teacher)
router.post('/classes', requireAuth, requireRole('teacher'), async (req, res) => {
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = makeJoinCode(name);
    const exists = await prisma.class.findUnique({ where: { joinCode } });
    if (exists) continue;
    const created = await prisma.class.create({
      data: { name, joinCode, teacherId: req.user!.id },
    });
    // eslint-disable-next-line no-console
    console.log(`[classes] CREATED class ${created.id} ("${created.name}", code ${created.joinCode}) for teacher ${req.user!.id}`);
    return res.json(created);
  }
  return res.status(500).json({ error: 'Could not generate a unique join code' });
});

// GET /classes (teacher) — own classes with roster counts.
router.get('/classes', requireAuth, requireRole('teacher'), async (req, res) => {
  const classes = await prisma.class.findMany({
    where: { teacherId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { roster: true } } },
  });
  return res.json(
    classes.map((c) => ({
      id: c.id,
      name: c.name,
      joinCode: c.joinCode,
      studentCount: c._count.roster,
    }))
  );
});

// GET /classes/mine (student) — classes where this student has claimed a roster row.
router.get('/classes/mine', requireAuth, requireRole('student'), async (req, res) => {
  const entries = await prisma.rosterEntry.findMany({
    where: { studentId: req.user!.id },
    include: { class: true },
    orderBy: { class: { createdAt: 'desc' } },
  });
  return res.json(
    entries.map((e) => ({
      id: e.class.id,
      name: e.class.name,
      joinCode: e.class.joinCode,
      rollNo: e.rollNo, // legacy field, kept for compatibility
      myName: e.name, // §10: student's own roster identity for this class
      myRollNo: e.rollNo,
    }))
  );
});

// GET /classes/:id/me (student) — own roster identity for the class detail screen (§10).
router.get('/classes/:id/me', requireAuth, requireRole('student'), async (req, res) => {
  const entry = await prisma.rosterEntry.findFirst({
    where: { classId: req.params.id, studentId: req.user!.id },
    include: { class: true },
  });
  if (!entry) return res.status(404).json({ error: 'You are not enrolled in this class' });
  return res.json({
    id: entry.class.id,
    name: entry.class.name,
    myName: entry.name,
    myRollNo: entry.rollNo,
  });
});

// GET /classes/:id/active-session (student) — gates the Scan button (§10).
router.get('/classes/:id/active-session', requireAuth, requireRole('student'), async (req, res) => {
  const entry = await prisma.rosterEntry.findFirst({
    where: { classId: req.params.id, studentId: req.user!.id },
    select: { id: true },
  });
  if (!entry) return res.status(404).json({ error: 'You are not enrolled in this class' });

  const session = await prisma.session.findFirst({
    where: { classId: req.params.id, isActive: true },
    orderBy: { startedAt: 'desc' },
    select: { id: true, expiresAt: true },
  });

  if (!session) return res.json({ active: false });
  return res.json({ active: true, sessionId: session.id, expiresAt: session.expiresAt });
});

// POST /classes/:id/unenroll (student) — leave a class. Sets the student's own
// RosterEntry.studentId to null so their attendance history is preserved (§10).
router.post('/classes/:id/unenroll', requireAuth, requireRole('student'), async (req, res) => {
  const entry = await prisma.rosterEntry.findFirst({
    where: { classId: req.params.id, studentId: req.user!.id },
  });
  if (!entry) return res.status(404).json({ error: 'You are not enrolled in this class' });

  await prisma.rosterEntry.update({ where: { id: entry.id }, data: { studentId: null } });
  return res.json({ ok: true });
});

// POST /classes/join { joinCode, rollNo } (student)
router.post('/classes/join', requireAuth, requireRole('student'), async (req, res) => {
  const { joinCode, rollNo } = req.body ?? {};
  if (!joinCode || !rollNo) {
    return res.status(400).json({ error: 'joinCode and rollNo are required' });
  }

  const cls = await prisma.class.findUnique({
    where: { joinCode: String(joinCode).trim().toUpperCase() },
  });
  if (!cls) return res.status(404).json({ error: 'Invalid join code' });

  // Case-insensitive roll number match within the class.
  const entries = await prisma.rosterEntry.findMany({ where: { classId: cls.id } });
  const target = String(rollNo).trim().toLowerCase();
  const entry = entries.find((e) => e.rollNo.toLowerCase() === target);

  if (!entry) {
    return res
      .status(404)
      .json({ error: 'Roll number not found — ask your teacher to add you to the roster.' });
  }
  if (entry.studentId && entry.studentId !== req.user!.id) {
    return res.status(409).json({ error: 'This roll number is already claimed.' });
  }

  await prisma.rosterEntry.update({
    where: { id: entry.id },
    data: { studentId: req.user!.id },
  });
  // eslint-disable-next-line no-console
  console.log(`[classes] JOIN → student ${req.user!.id} claimed roll ${entry.rollNo} in class ${cls.id}`);

  return res.json({ id: cls.id, name: cls.name, joinCode: cls.joinCode, rollNo: entry.rollNo });
});

// GET /classes/:id (teacher) — detail + sessions.
router.get('/classes/:id', requireAuth, requireRole('teacher'), async (req, res) => {
  const cls = await prisma.class.findUnique({
    where: { id: req.params.id },
    include: {
      sessions: { orderBy: { startedAt: 'desc' } },
      _count: { select: { roster: true } },
    },
  });
  if (!cls || cls.teacherId !== req.user!.id) {
    return res.status(404).json({ error: 'Class not found' });
  }
  // The single active session (if any) so the client can Continue it instead of
  // starting a duplicate (§1). Sessions are ordered newest-first for display.
  const activeSession = cls.sessions.find((s) => s.isActive) ?? null;
  return res.json({
    id: cls.id,
    name: cls.name,
    joinCode: cls.joinCode,
    studentCount: cls._count.roster,
    activeSessionId: activeSession?.id ?? null,
    sessions: cls.sessions.map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      expiresAt: s.expiresAt,
      isActive: s.isActive,
    })),
  });
});

// DELETE /classes/:id (teacher) — permanently delete a class the teacher owns.
//
// Atomicity / ACID: wrapped in a $transaction so the ownership check and the
// delete are one indivisible unit — either the class (and everything under it)
// goes, or nothing does. The schema's onDelete:Cascade chains
// Class → Session → Attendance and Class → RosterEntry → Attendance, so a single
// class.delete() removes the sessions, attendance records and roster in the same
// transaction. Ownership is validated inside the txn — we never trust the id alone.
router.delete('/classes/:id', requireAuth, requireRole('teacher'), async (req, res) => {
  const classId = req.params.id;
  const teacherId = req.user!.id;
  // eslint-disable-next-line no-console
  console.log(`[classes] DELETE requested → class ${classId} by teacher ${teacherId}`);

  const result = await prisma.$transaction(async (tx) => {
    const cls = await tx.class.findUnique({ where: { id: classId } });
    if (!cls || cls.teacherId !== teacherId) return { ok: false as const };
    // Count what will cascade, purely for an informative log line.
    const [sessions, roster] = await Promise.all([
      tx.session.count({ where: { classId } }),
      tx.rosterEntry.count({ where: { classId } }),
    ]);
    await tx.class.delete({ where: { id: classId } });
    return { ok: true as const, name: cls.name, sessions, roster };
  });

  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[classes] DELETE denied → class ${classId} not found or not owned by ${teacherId}`);
    return res.status(404).json({ error: 'Class not found' });
  }
  // eslint-disable-next-line no-console
  console.log(
    `[classes] DELETED class ${classId} ("${result.name}") — cascaded ${result.sessions} session(s) + ${result.roster} roster row(s) and their attendance`
  );
  return res.json({ ok: true });
});

// ---------------- Roster CRUD ----------------

// POST /classes/:id/roster { name, rollNo } — add one student.
router.post('/classes/:id/roster', requireAuth, requireRole('teacher'), async (req, res) => {
  const cls = await ownedClass(req.params.id, req.user!.id);
  if (!cls) return res.status(404).json({ error: 'Class not found' });

  const { name, rollNo } = req.body ?? {};
  if (!name || !rollNo) return res.status(400).json({ error: 'name and rollNo are required' });

  const dup = await prisma.rosterEntry.findUnique({
    where: { classId_rollNo: { classId: cls.id, rollNo: String(rollNo).trim() } },
  });
  if (dup) return res.status(409).json({ error: 'That roll number already exists in this class' });

  const entry = await prisma.rosterEntry.create({
    data: { classId: cls.id, name: String(name).trim(), rollNo: String(rollNo).trim() },
  });
  // eslint-disable-next-line no-console
  console.log(`[classes] ROSTER add → entry ${entry.id} (${entry.rollNo}) in class ${cls.id}`);
  return res.json({ id: entry.id, name: entry.name, rollNo: entry.rollNo, linked: false });
});

// GET /classes/:id/roster — list with linked flag.
router.get('/classes/:id/roster', requireAuth, requireRole('teacher'), async (req, res) => {
  const cls = await ownedClass(req.params.id, req.user!.id);
  if (!cls) return res.status(404).json({ error: 'Class not found' });

  const entries = await prisma.rosterEntry.findMany({
    where: { classId: cls.id },
    orderBy: { rollNo: 'asc' },
  });
  return res.json(
    entries.map((e) => ({
      id: e.id,
      name: e.name,
      rollNo: e.rollNo,
      linked: e.studentId != null,
    }))
  );
});

// DELETE /classes/:id/roster/:rosterEntryId
router.delete(
  '/classes/:id/roster/:rosterEntryId',
  requireAuth,
  requireRole('teacher'),
  async (req, res) => {
    const cls = await ownedClass(req.params.id, req.user!.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const entry = await prisma.rosterEntry.findUnique({ where: { id: req.params.rosterEntryId } });
    if (!entry || entry.classId !== cls.id) {
      return res.status(404).json({ error: 'Roster entry not found' });
    }
    await prisma.rosterEntry.delete({ where: { id: entry.id } });
    // eslint-disable-next-line no-console
    console.log(`[classes] ROSTER delete → entry ${entry.id} removed from class ${cls.id}`);
    return res.json({ ok: true });
  }
);

// POST /classes/:id/roster/bulk-delete { ids: string[] } — remove many roster
// entries at once (select-multiple / remove-all in the app). A single
// deleteMany scoped to BOTH the id list AND this class is atomic and safe: ids
// that don't belong to this class simply don't match, so a stray/foreign id can
// never delete another teacher's data. Ownership is validated first. The
// schema's onDelete cascade (RosterEntry → Attendance) removes each entry's
// attendance in the same operation, exactly like the single-entry delete.
// Uses POST (not DELETE) so the id array travels reliably as a JSON body.
router.post(
  '/classes/:id/roster/bulk-delete',
  requireAuth,
  requireRole('teacher'),
  async (req, res) => {
    const cls = await ownedClass(req.params.id, req.user!.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const ids: string[] = Array.isArray(req.body?.ids)
      ? req.body.ids.filter((x: unknown) => typeof x === 'string')
      : [];
    if (ids.length === 0) return res.status(400).json({ error: 'ids (array) is required' });

    const result = await prisma.rosterEntry.deleteMany({
      where: { id: { in: ids }, classId: cls.id },
    });
    // eslint-disable-next-line no-console
    console.log(
      `[classes] ROSTER bulk-delete → removed ${result.count} entr${result.count === 1 ? 'y' : 'ies'} from class ${cls.id}`
    );
    return res.json({ ok: true, removed: result.count });
  }
);

// POST /classes/:id/roster/import (multipart file) — parse only, no DB writes.
router.post(
  '/classes/:id/roster/import',
  requireAuth,
  requireRole('teacher'),
  upload.single('file'),
  async (req, res) => {
    const cls = await ownedClass(req.params.id, req.user!.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: file)' });

    const name = req.file.originalname.toLowerCase();
    try {
      let rows: ParsedRow[];
      if (name.endsWith('.csv')) rows = parseCsv(req.file.buffer);
      else if (name.endsWith('.xlsx') || name.endsWith('.xls')) rows = parseXlsx(req.file.buffer);
      else if (name.endsWith('.docx')) rows = await parseDocx(req.file.buffer);
      else if (name.endsWith('.pdf')) rows = await parsePdf(req.file.buffer);
      else return res.status(400).json({ error: 'Unsupported file type. Use .csv, .xlsx, .docx or .pdf' });

      return res.json({ rows });
    } catch (err) {
      console.error('[import] parse failed:', err);
      return res.status(422).json({ error: 'Could not parse that file' });
    }
  }
);

// POST /classes/:id/roster/import/confirm { rows } — write, skipping dup roll numbers.
router.post(
  '/classes/:id/roster/import/confirm',
  requireAuth,
  requireRole('teacher'),
  async (req, res) => {
    const cls = await ownedClass(req.params.id, req.user!.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const rows: ParsedRow[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.status(400).json({ error: 'No rows to import' });

    const existing = await prisma.rosterEntry.findMany({
      where: { classId: cls.id },
      select: { rollNo: true },
    });
    const seen = new Set(existing.map((e) => e.rollNo.toLowerCase()));

    const toCreate: ParsedRow[] = [];
    for (const r of rows) {
      const rollNo = String(r.rollNo ?? '').trim();
      const rowName = String(r.name ?? '').trim();
      if (!rollNo || !rowName) continue;
      if (seen.has(rollNo.toLowerCase())) continue;
      seen.add(rollNo.toLowerCase());
      toCreate.push({ name: rowName, rollNo });
    }

    if (toCreate.length > 0) {
      await prisma.rosterEntry.createMany({
        data: toCreate.map((r) => ({ classId: cls.id, name: r.name, rollNo: r.rollNo })),
      });
    }

    return res.json({ ok: true, added: toCreate.length, skipped: rows.length - toCreate.length });
  }
);

// POST /classes/:id/roster/copy-from { sourceClassId } (teacher) — copy every
// student (name + roll no) from a source class the teacher owns into THIS class,
// skipping roll numbers that already exist here (case-insensitive). Copied
// entries start UNCLAIMED — each class tracks its own student links, so we never
// carry over studentId. Mirrors import/confirm's dedup: build a Set of existing
// roll numbers, then createMany the rest in a single write. BOTH classes are
// ownership-checked, so a teacher can only ever copy between their own classes.
router.post(
  '/classes/:id/roster/copy-from',
  requireAuth,
  requireRole('teacher'),
  async (req, res) => {
    const target = await ownedClass(req.params.id, req.user!.id);
    if (!target) return res.status(404).json({ error: 'Class not found' });

    const sourceClassId = String(req.body?.sourceClassId ?? '').trim();
    if (!sourceClassId) return res.status(400).json({ error: 'sourceClassId is required' });
    if (sourceClassId === target.id) {
      return res.status(400).json({ error: 'Source and destination are the same class' });
    }

    const source = await ownedClass(sourceClassId, req.user!.id);
    if (!source) return res.status(404).json({ error: 'Source class not found' });

    const [sourceRoster, existing] = await Promise.all([
      prisma.rosterEntry.findMany({
        where: { classId: source.id },
        select: { name: true, rollNo: true },
        orderBy: { rollNo: 'asc' },
      }),
      prisma.rosterEntry.findMany({
        where: { classId: target.id },
        select: { rollNo: true },
      }),
    ]);

    const seen = new Set(existing.map((e) => e.rollNo.toLowerCase()));
    const toCreate: ParsedRow[] = [];
    for (const e of sourceRoster) {
      const rollNo = e.rollNo.trim();
      const rowName = e.name.trim();
      if (!rollNo || !rowName) continue;
      if (seen.has(rollNo.toLowerCase())) continue;
      seen.add(rollNo.toLowerCase());
      toCreate.push({ name: rowName, rollNo });
    }

    if (toCreate.length > 0) {
      await prisma.rosterEntry.createMany({
        data: toCreate.map((r) => ({ classId: target.id, name: r.name, rollNo: r.rollNo })),
      });
    }
    // eslint-disable-next-line no-console
    console.log(
      `[classes] ROSTER copy → ${toCreate.length} entr${toCreate.length === 1 ? 'y' : 'ies'} copied from class ${source.id} into ${target.id} (${sourceRoster.length - toCreate.length} skipped)`
    );
    return res.json({
      ok: true,
      added: toCreate.length,
      skipped: sourceRoster.length - toCreate.length,
      sourceCount: sourceRoster.length,
    });
  }
);

export default router;
