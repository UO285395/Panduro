import { describe, expect, it } from "vitest";
import {
  DEFAULT_EASE,
  MIN_EASE,
  MS_PER_DAY,
  initialReview,
  nextReview,
} from "@/lib/srs/sm2";

describe("SM-2", () => {
  const now = 1_700_000_000_000;

  it("estado inicial: due hoy, sin repeticiones", () => {
    const s = initialReview(now);
    expect(s.ease).toBe(DEFAULT_EASE);
    expect(s.intervalDays).toBe(0);
    expect(s.repetitions).toBe(0);
    expect(s.dueAt).toBe(now);
  });

  it("primer acierto (quality 4): programa 1 día", () => {
    const s = nextReview(initialReview(now), 4, now);
    expect(s.repetitions).toBe(1);
    expect(s.intervalDays).toBe(1);
    expect(s.dueAt).toBe(now + MS_PER_DAY);
  });

  it("segundo acierto: programa 6 días", () => {
    const s1 = nextReview(initialReview(now), 4, now);
    const s2 = nextReview(s1, 4, now + MS_PER_DAY);
    expect(s2.repetitions).toBe(2);
    expect(s2.intervalDays).toBe(6);
    expect(s2.dueAt).toBe(now + MS_PER_DAY + 6 * MS_PER_DAY);
  });

  it("tercer acierto (quality 4): interval * ease ≈ 15 días", () => {
    let s = initialReview(now);
    s = nextReview(s, 4, now);
    s = nextReview(s, 4, now);
    s = nextReview(s, 4, now);
    expect(s.repetitions).toBe(3);
    // ease se ha movido tras cada acierto con q=4; el intervalo queda cerca de 15
    expect(s.intervalDays).toBeGreaterThanOrEqual(14);
    expect(s.intervalDays).toBeLessThanOrEqual(16);
  });

  it("quality 5 (fácil) sube el ease, quality 3 (difícil) lo baja", () => {
    const easy = nextReview(initialReview(now), 5, now);
    const hard = nextReview(initialReview(now), 3, now);
    expect(easy.ease).toBeGreaterThan(DEFAULT_EASE);
    expect(hard.ease).toBeLessThan(DEFAULT_EASE);
  });

  it("fallo (quality < 3) resetea repeticiones y programa para hoy", () => {
    const s1 = nextReview(initialReview(now), 4, now);
    const s2 = nextReview(s1, 1, now + 10 * MS_PER_DAY);
    expect(s2.repetitions).toBe(0);
    expect(s2.intervalDays).toBe(0);
    expect(s2.dueAt).toBe(now + 10 * MS_PER_DAY);
  });

  it("ease nunca cae por debajo de MIN_EASE aunque falles seguido", () => {
    let s = initialReview(now);
    for (let i = 0; i < 20; i++) s = nextReview(s, 0, now);
    expect(s.ease).toBeGreaterThanOrEqual(MIN_EASE);
  });
});
