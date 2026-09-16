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
import { applyLazySettings, onHeartsLost } from "@/lib/gamification/lazy";
import type { LessonProgress, PendingReview, UserSnapshot } from "@/lib/progress/queries";
import {
  DEFAULT_EASE,
  initialReview,
  nextReview,
  type Quality,
  type ReviewState,
} from "@/lib/srs/sm2";

const STORAGE_KEY = "panduro:demo";

type Profile = {
  displayName: string;
  hearts: number;
  heartsRegenAt: number | null;
  xpTotal: number;
  streakDays: number;
  streakLastDay: string | null;
  onboardingCompleted: boolean;
};

type ProgressRow = LessonProgress;

type ReviewRow = ReviewState;

type EventRow = {
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type Snapshot = {
  version: 2;
  signedIn: boolean;
  profile: Profile;
  progress: Record<string, ProgressRow>;
  reviews: Record<string, ReviewRow>;
  events: EventRow[];
};

const initialSnapshot: Snapshot = {
  version: 2,
  signedIn: false,
  profile: {
    displayName: "estudiante",
    hearts: MAX_HEARTS,
    heartsRegenAt: null,
    xpTotal: 0,
    streakDays: 0,
    streakLastDay: null,
    onboardingCompleted: false,
  },
  progress: {},
  reviews: {},
  events: [],
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function read(): Snapshot {
  if (!isBrowser()) return initialSnapshot;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialSnapshot;
    const parsed = JSON.parse(raw) as Partial<Snapshot> & { version?: number };
    if (parsed.version === 2) return parsed as Snapshot;
    if (parsed.version === 1) {
      // Migración silenciosa desde la versión anterior sin reviews/heartsRegenAt.
      const migrated: Snapshot = {
        ...initialSnapshot,
        signedIn: parsed.signedIn ?? false,
        profile: {
          ...initialSnapshot.profile,
          ...(parsed.profile ?? {}),
          heartsRegenAt: null,
        },
        progress: parsed.progress ?? {},
        events: parsed.events ?? [],
      };
      write(migrated);
      return migrated;
    }
    return initialSnapshot;
  } catch {
    return initialSnapshot;
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

function applyLazyAndPersist(snap: Snapshot, now = Date.now()): Snapshot {
  const { next, changed } = applyLazySettings(
    {
      hearts: snap.profile.hearts,
      heartsRegenAt: snap.profile.heartsRegenAt,
      streakDays: snap.profile.streakDays,
      streakLastDay: snap.profile.streakLastDay,
    },
    now,
  );
  if (!changed) return snap;
  const updated: Snapshot = {
    ...snap,
    profile: {
      ...snap.profile,
      hearts: next.hearts,
      heartsRegenAt: next.heartsRegenAt,
      streakDays: next.streakDays,
      streakLastDay: next.streakLastDay,
    },
  };
  write(updated);
  return updated;
}

export function getSnapshotDemo(nowMs = Date.now()): UserSnapshot {
  const raw = read();
  const snap = applyLazyAndPersist(raw, nowMs);
  const progressByLesson = new Map<string, LessonProgress>();
  for (const [id, row] of Object.entries(snap.progress)) {
    progressByLesson.set(id, row);
  }
  const pendingReviews: PendingReview[] = Object.entries(snap.reviews)
    .filter(([, r]) => r.dueAt <= nowMs)
    .sort((a, b) => a[1].dueAt - b[1].dueAt)
    .slice(0, 20)
    .map(([cardId, r]) => ({ cardId, dueAt: r.dueAt }));
  const nextReviewDueAt = Object.values(snap.reviews)
    .map((r) => r.dueAt)
    .sort((a, b) => a - b)[0] ?? null;

  return {
    displayName: snap.profile.displayName,
    hearts: snap.profile.hearts,
    heartsRegenAt: snap.profile.heartsRegenAt,
    xpTotal: snap.profile.xpTotal,
    streakDays: snap.profile.streakDays,
    progressByLesson,
    pendingReviews,
    nextReviewDueAt,
    onboardingCompleted: snap.profile.onboardingCompleted,
  };
}

export function markOnboardingCompletedDemo() {
  const snap = read();
  write({
    ...snap,
    profile: { ...snap.profile, onboardingCompleted: true },
  });
}

export function completeLessonDemo(input: {
  lessonId: string;
  correct: number;
  total: number;
  heartsUsed: number;
  cardIds?: string[];
}) {
  const now = Date.now();
  const raw = read();
  const snap = applyLazyAndPersist(raw, now);
  const heartsBefore = snap.profile.hearts;
  const heartsAfter = Math.max(0, heartsBefore - input.heartsUsed);
  const heartsRegenAt = onHeartsLost(
    heartsBefore,
    heartsAfter,
    snap.profile.heartsRegenAt,
    now,
  );
  const { xp, bestScore, perfected } = computeLessonScore({
    correct: input.correct,
    total: input.total,
    heartsRemaining: heartsAfter,
  });

  const existing = snap.progress[input.lessonId];
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

  // Inicializa reviews para las cards de la lección si no existen.
  const nextReviews: Record<string, ReviewRow> = { ...snap.reviews };
  for (const cid of input.cardIds ?? []) {
    if (!nextReviews[cid]) nextReviews[cid] = initialReview(now);
  }

  // Racha diaria: sube +1 si es un día nuevo respecto a streakLastDay.
  const today = new Date(now).toISOString().slice(0, 10);
  const streakDays =
    snap.profile.streakLastDay === today
      ? snap.profile.streakDays || 1
      : snap.profile.streakDays + 1;

  const next: Snapshot = {
    ...snap,
    profile: {
      ...snap.profile,
      hearts: heartsAfter,
      heartsRegenAt,
      xpTotal: snap.profile.xpTotal + xp,
      streakDays,
      streakLastDay: today,
    },
    progress: nextProgress,
    reviews: nextReviews,
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
        createdAt: new Date(now).toISOString(),
      },
    ],
  };
  write(next);
  return { xp, bestScore, perfected, heartsAfter };
}

export function submitReviewDemo(cardId: string, quality: Quality, nowMs = Date.now()) {
  const raw = read();
  const snap = applyLazyAndPersist(raw, nowMs);
  const current = snap.reviews[cardId] ?? initialReview(nowMs);
  const state = nextReview(current, quality, nowMs);

  // Sumar racha si es la primera actividad del día
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const streakDays =
    snap.profile.streakLastDay === today
      ? snap.profile.streakDays || 1
      : snap.profile.streakDays + 1;

  const next: Snapshot = {
    ...snap,
    profile: {
      ...snap.profile,
      streakDays,
      streakLastDay: today,
    },
    reviews: { ...snap.reviews, [cardId]: state },
  };
  write(next);
  return state;
}

export function initReviewsForLessonDemo(cardIds: string[], nowMs = Date.now()) {
  const snap = read();
  const nextReviews = { ...snap.reviews };
  let changed = false;
  for (const cid of cardIds) {
    if (!nextReviews[cid]) {
      nextReviews[cid] = initialReview(nowMs);
      changed = true;
    }
  }
  if (changed) write({ ...snap, reviews: nextReviews });
}

/** Solo para tests: acceso crudo al perfil (evita re-implementar mocks). */
export function _debugSetProfileForTests(patch: Partial<Profile>) {
  const snap = read();
  write({ ...snap, profile: { ...snap.profile, ...patch } });
}

export function _debugSetReviewForTests(cardId: string, state: ReviewState) {
  const snap = read();
  write({ ...snap, reviews: { ...snap.reviews, [cardId]: state } });
}

export { DEFAULT_EASE };
