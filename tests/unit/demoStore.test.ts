import { afterEach, beforeEach, describe, expect, it } from "vitest";

// El módulo lee `process.env.NEXT_PUBLIC_DEMO_MODE` en tiempo de import; da
// igual para estos tests porque no llamamos a `isDemoMode` desde código.
// jsdom expone `localStorage` global.

describe("demoStore", () => {
  let mod: typeof import("@/lib/storage/demoStore");

  beforeEach(async () => {
    localStorage.clear();
    // reimportamos por si algún test cambia el estado interno.
    mod = await import("@/lib/storage/demoStore");
    mod.resetDemo();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("empieza sin sesión y con perfil por defecto", () => {
    expect(mod.isSignedIn()).toBe(false);
    const s = mod.getSnapshotDemo();
    expect(s.xpTotal).toBe(0);
    expect(s.hearts).toBe(5);
    expect(s.streakDays).toBe(0);
    expect(s.progressByLesson.size).toBe(0);
    expect(s.pendingReviews).toEqual([]);
    expect(s.nextReviewDueAt).toBeNull();
  });

  it("completeLesson inicializa reviews SM-2 para las cards de la lección", () => {
    mod.signInDemo();
    mod.completeLessonDemo({
      lessonId: "a1.u1.l1",
      correct: 5,
      total: 5,
      heartsUsed: 0,
      cardIds: ["sign:HOLA", "sign:ADIOS"],
    });
    const s = mod.getSnapshotDemo();
    // Están vencidas ya (dueAt = now al crearse)
    const ids = s.pendingReviews.map((r) => r.cardId).sort();
    expect(ids).toEqual(["sign:ADIOS", "sign:HOLA"]);
  });

  it("submitReview reprograma la card y baja de pending", () => {
    mod.signInDemo();
    mod.completeLessonDemo({
      lessonId: "a1.u1.l1",
      correct: 5,
      total: 5,
      heartsUsed: 0,
      cardIds: ["sign:HOLA"],
    });
    // Quality 4 (Bien) -> intervalo 1 día
    mod.submitReviewDemo("sign:HOLA", 4);
    const s = mod.getSnapshotDemo();
    expect(s.pendingReviews).toHaveLength(0);
    expect(s.nextReviewDueAt).not.toBeNull();
  });

  it("signIn persiste display name entre 'sesiones'", () => {
    mod.signInDemo("Ana");
    expect(mod.isSignedIn()).toBe(true);
    expect(mod.getSnapshotDemo().displayName).toBe("Ana");
  });

  it("completeLesson perfecto suma XP + bono y no rebaja corazones", () => {
    mod.signInDemo("Bea");
    const r = mod.completeLessonDemo({
      lessonId: "a1.u1.l1",
      correct: 5,
      total: 5,
      heartsUsed: 0,
    });
    expect(r.perfected).toBe(true);
    expect(r.xp).toBe(5 * 10 + 20);
    expect(r.heartsAfter).toBe(5);
    const s = mod.getSnapshotDemo();
    expect(s.xpTotal).toBe(70);
    expect(s.progressByLesson.get("a1.u1.l1")?.status).toBe("perfected");
    expect(s.streakDays).toBe(1);
  });

  it("completeLesson con fallos consume corazones y no marca perfeccionada", () => {
    mod.signInDemo();
    const r = mod.completeLessonDemo({
      lessonId: "a1.u1.l2",
      correct: 3,
      total: 5,
      heartsUsed: 2,
    });
    expect(r.perfected).toBe(false);
    expect(r.heartsAfter).toBe(3);
    expect(mod.getSnapshotDemo().hearts).toBe(3);
    expect(mod.getSnapshotDemo().progressByLesson.get("a1.u1.l2")?.status).toBe(
      "completed",
    );
  });

  it("racha no se duplica dentro del mismo día", () => {
    mod.signInDemo();
    mod.completeLessonDemo({
      lessonId: "a1.u1.l1",
      correct: 5,
      total: 5,
      heartsUsed: 0,
    });
    const beforeStreak = mod.getSnapshotDemo().streakDays;
    mod.completeLessonDemo({
      lessonId: "a1.u1.l2",
      correct: 5,
      total: 5,
      heartsUsed: 0,
    });
    expect(mod.getSnapshotDemo().streakDays).toBe(beforeStreak);
  });

  it("reset borra por completo el snapshot", () => {
    mod.signInDemo("X");
    mod.completeLessonDemo({
      lessonId: "a1.u1.l1",
      correct: 3,
      total: 5,
      heartsUsed: 1,
    });
    mod.resetDemo();
    expect(mod.isSignedIn()).toBe(false);
    expect(mod.getSnapshotDemo().xpTotal).toBe(0);
  });
});
