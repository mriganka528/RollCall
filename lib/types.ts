export type Role = 'teacher' | 'student';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface ClassSummary {
  id: string;
  name: string;
  joinCode: string;
  studentCount?: number;
  rollNo?: string;
  // Student-facing: this student's own roster identity for the class (§10).
  myName?: string;
  myRollNo?: string;
}

export interface SessionInfo {
  id: string;
  token?: string;
  expiresAt: string;
  isActive: boolean;
  startedAt?: string;
}

export interface ClassDetail {
  id: string;
  name: string;
  joinCode: string;
  studentCount: number;
  // The single active session (if any) so the client can Continue it instead of
  // starting a duplicate (§1). Null when nothing is ongoing.
  activeSessionId: string | null;
  sessions: { id: string; startedAt: string; expiresAt: string; isActive: boolean }[];
}

// GET /sessions/:id (teacher) — full details for the Session Details screen (§13-15).
// endedAt/durationMs are null while the session is still ongoing.
export interface SessionDetails {
  id: string;
  classId: string;
  className: string;
  teacherName: string;
  startedAt: string;
  endedAt: string | null;
  isActive: boolean;
  durationMs: number | null;
  rosterCount: number;
  presentCount: number;
  absentCount: number;
  percentage: number;
}

export interface RosterEntry {
  id: string;
  name: string;
  rollNo: string;
  linked: boolean;
}

// Token poll response from GET /sessions/:id/token
export interface TokenResponse {
  sessionId: string;
  token: string;
  expiresAt: string;
  isActive: boolean;
}

// Live counter response from GET /sessions/:id/live
export interface LiveResponse {
  count: number;
  total: number;
  present: { id: string; name: string; rollNo: string; markedAt: string }[];
}

// Scan result from POST /sessions/scan
export interface ScanResult {
  success: boolean;
  reason?: string;
  already?: boolean;
  className?: string;
  markedAt?: string;
}

// Per-session attendance from GET /classes/:id/sessions/:sessionId/attendance
export interface SessionAttendance {
  sessionId: string;
  startedAt: string;
  rows: { id: string; name: string; rollNo: string; present: boolean }[];
}

// Student history from GET /students/me/history
export interface StudentHistory {
  classes: {
    classId: string;
    name: string;
    rollNo: string;
    present: number;
    total: number;
    percent: number;
    sessions: { id: string; startedAt: string; present: boolean }[];
  }[];
}

// Analytics
export interface DailyPoint {
  date: string;
  present: number;
  total: number;
}

export interface MonthlyAnalytics {
  month: string;
  days: DailyPoint[];
  average: number;
}

export interface OverviewAnalytics {
  totalSessions: number;
  classAverage: number;
  students: {
    id: string;
    name: string;
    rollNo: string;
    presentCount: number;
    totalSessions: number;
    percent: number;
    atRisk: boolean;
  }[];
}

// Teacher class history matrix from GET /classes/:id/history
export interface ClassHistory {
  class: { id: string; name: string };
  sessions: { id: string; startedAt: string }[];
  students: {
    id: string;
    name: string;
    rollNo: string;
    present: boolean[];
    presentCount: number;
    totalSessions: number;
    percent: number;
  }[];
}

// Parsed rows from roster import (step 1)
export interface ImportResponse {
  rows: { name: string; rollNo: string }[];
}

// Payload encoded inside the QR code.
export interface QRPayload {
  session_id: string;
  token: string;
}

// ---- Range-filtered analytics (§11) ----
export type AnalyticsRange = 'week' | 'month' | '6months' | 'year';

// What the analytics screens currently have selected: either one of the presets
// above, or a custom [start, end] span (dates as YYYY-MM-DD, §10). This is the
// single source of truth the screens turn into a query string for the backend.
export type RangeSelection =
  | { kind: 'preset'; preset: AnalyticsRange }
  | { kind: 'custom'; start: string; end: string };

export interface AnalyticsBucket {
  label: string;
  present: number;
  total: number;
  percentage: number;
}

// GET /classes/:id/analytics/summary (teacher) and /me (student) share this shape.
export interface AnalyticsSummary {
  buckets: AnalyticsBucket[];
  averagePercentage: number;
  today: { present: number; total: number };
}

// GET /classes/:id/analytics/students (teacher, per-student, ascending).
export interface StudentAnalyticsRow {
  rosterEntryId: string;
  name: string;
  rollNo: string;
  percentage: number;
}

// GET /classes/:id/active-session (student) — gates the Scan button (§10).
export interface ActiveSession {
  active: boolean;
  sessionId?: string;
  expiresAt?: string;
}

// GET /classes/:id/me (student) — own roster identity for the class detail screen (§10).
export interface StudentClassMe {
  id: string;
  name: string;
  myName: string;
  myRollNo: string;
}
