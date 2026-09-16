"use client";

/**
 * Store en cliente para el modo demo (NEXT_PUBLIC_DEMO_MODE=1).
 *
 * Persiste todo lo que en modo cloud vive en Supabase: perfil, progreso,
 * repasos y telemetría. Guardado en localStorage bajo la clave `panduro:demo`.
 *
 * Nunca se importa desde código server. La UI en modo demo pide los datos
 * a través de este módulo directamente.
 */

import { computeLessonScore, MAX_HEARTS } from "@/lib/gamification/xp";
import type { LessonProgress, UserSnapshot } from "@/lib/progress/queries";

const STORAGE_KEY = "panduro:demo";

type Profile = {
  displayName: string;
  hearts: number;
  xpTotal: number;
  streakDays: number;
  streakLastDay: string | null;
};

type ProgressRow = LessonProgress;

type EventRow = {
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type Snapshot = {
  version: 1;
  signedIn: boolean;
  profile: Profile;
  progress: Record<string, ProgressRow>;
  events: EventRow[];
};

const initial: Snapshot = {
  version: 1,
  signedIn: false,
  profile: {
    displayName: "estudiante",
    hearts: MAX_HEARTS,
    xpTotal: 0,
    streakDays: 0,
    streakLastDay: null,
  },
  progress: {},
  events: [],
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function read(): Snapshot {
  if (!isBrowser()) return initial;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Snapshot;
    if (parsed.version !== 1) return initial;
    return parsed;
  } catch {
    return initial;
  }
}

function write(next: Snapshot) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage lleno o denegado: ignoramos silenciosamente.
  }
}

// -----------------------------------------------------------------------------
// API pública
// -----------------------------------------------------------------------------

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "1";
}

export function isSignedIn(): boolean {
  return read().signedIn;
}

export function signInDemo(displayName?: string) {
  const snap = read();
  const next: Snapshot = {
    ...snap,
    signedIn: true,
    profile: {
      ...snap.profile,
      displayName: displayName?.trim() || snap.profile.displayName || "demo",
    },
  };
  write(next);
}

export function signOutDemo() {
  const snap = read();
  write({ ...snap, signedIn: false });
}

export function resetDemo() {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
}

export function getSnapshotDemo(): UserSnapshot {
  const snap = read();
  const progressByLesson = new Map<string, LessonProgress>();
  for (const [id, row] of Object.entries(snap.progress)) {
    progressByLesson.set(id, row);
  }
  return {
    displayName: snap.profile.displayName,
    hearts: snap.profile.hearts,
    xpTotal: snap.profile.xpTotal,
    streakDays: snap.profile.streakDays,
    progressByLesson,
  };
}

export function completeLessonDemo(input: {
  lessonId: string;
  correct: number;
  total: number;
  heartsUsed: number;
}) {
  const snap = read();
  const heartsBefore = snap.profile.hearts;
  const heartsAfter = Math.max(0, heartsBefore - input.heartsUsed);
  const { xp, bestScore, perfected } = computeLessonScore({
    correct: input.correct,
    total: input.total,
    heartsRemaining: heartsAfter,
  });

  const existing = snap.progress[input.lessonId];
  const attempts = (existing?.bestScore != null ? 1 : 0) + (existing ? 1 : 0);
  const newBest = Math.max(existing?.bestScore ?? 0, bestScore);
  const status: ProgressRow["status"] = perfected ? "perfected" : "completed";

  const nextProgress: Record<string, ProgressRow> = {
    ...snap.progress,
    [input.lessonId]: {
      lessonId: input.lessonId,
      status,
      bestScore: newBest,
    },
  };

  // Racha diaria: si el último día registrado no es hoy, sube +1
  const today = new Date().toISOString().slice(0, 10);
  const streakDays =
    snap.profile.streakLastDay === today
      ? snap.profile.streakDays
      : snap.profile.streakDays + 1;

  const next: Snapshot = {
    ...snap,
    profile: {
      ...snap.profile,
      hearts: heartsAfter,
      xpTotal: snap.profile.xpTotal + xp,
      streakDays,
      streakLastDay: today,
    },
    progress: nextProgress,
    events: [
      ...snap.events.slice(-99),
      {
        kind: "lesson_completed",
        payload: {
          lesson_id: input.lessonId,
          correct: input.correct,
          total: input.total,
          hearts_used: input.heartsUsed,
          xp_awarded: xp,
          perfected,
        },
        createdAt: new Date().toISOString(),
      },
    ],
  };
  write(next);
  // NOTE(demo): silenciamos el warning porque `attempts` no se persiste todavía
  // en el store demo — solo lo calculamos para paridad futura con Supabase.
  void attempts;
  return { xp, bestScore, perfected, heartsAfter };
}
