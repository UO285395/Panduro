import { describe, expect, it } from "vitest";
import {
  computeLessonScore,
  MAX_HEARTS,
  XP_PER_CORRECT,
  XP_PERFECT_BONUS,
} from "@/lib/gamification/xp";

describe("computeLessonScore", () => {
  it("da XP por acierto y bono si es perfecta", () => {
    const r = computeLessonScore({
      correct: 5,
      total: 5,
      heartsRemaining: MAX_HEARTS,
    });
    expect(r.xp).toBe(5 * XP_PER_CORRECT + XP_PERFECT_BONUS);
    expect(r.bestScore).toBe(100);
    expect(r.perfected).toBe(true);
  });

  it("no marca perfeccionada si perdió corazones", () => {
    const r = computeLessonScore({
      correct: 5,
      total: 5,
      heartsRemaining: MAX_HEARTS - 1,
    });
    expect(r.perfected).toBe(false);
    // sigue habiendo bono por todas correctas
    expect(r.xp).toBe(5 * XP_PER_CORRECT + XP_PERFECT_BONUS);
  });

  it("puntúa parcial sin bono", () => {
    const r = computeLessonScore({
      correct: 3,
      total: 5,
      heartsRemaining: 3,
    });
    expect(r.xp).toBe(3 * XP_PER_CORRECT);
    expect(r.bestScore).toBe(60);
    expect(r.perfected).toBe(false);
  });

  it("total=0 no otorga XP ni marca perfeccionada", () => {
    const r = computeLessonScore({
      correct: 0,
      total: 0,
      heartsRemaining: MAX_HEARTS,
    });
    expect(r.bestScore).toBe(0);
    expect(r.xp).toBe(0);
    expect(r.perfected).toBe(false);
  });
});
