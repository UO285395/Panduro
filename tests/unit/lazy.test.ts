import { describe, expect, it } from "vitest";
import { applyLazySettings, onHeartsLost } from "@/lib/gamification/lazy";
import { HEART_REGEN_MINUTES, MAX_HEARTS } from "@/lib/gamification/xp";

const MIN = 60 * 1000;

function isoToday(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe("applyLazySettings — regeneración de corazones", () => {
  it("regenera un corazón cuando ha pasado exactamente el intervalo", () => {
    const now = 1_700_000_000_000;
    const { next, changed } = applyLazySettings(
      {
        hearts: 3,
        heartsRegenAt: now - HEART_REGEN_MINUTES * MIN,
        streakDays: 0,
        streakLastDay: null,
      },
      now,
    );
    expect(changed).toBe(true);
    expect(next.hearts).toBe(4);
    // El timer se recoloca justo después del bloque consumido
    expect(next.heartsRegenAt).toBe(now);
  });

  it("acumula varios corazones si ha pasado tiempo suficiente", () => {
    const now = 1_700_000_000_000;
    const { next } = applyLazySettings(
      {
        hearts: 0,
        heartsRegenAt: now - 3 * HEART_REGEN_MINUTES * MIN,
        streakDays: 0,
        streakLastDay: null,
      },
      now,
    );
    expect(next.hearts).toBe(3);
  });

  it("no supera MAX_HEARTS y apaga el timer al llegar al cap", () => {
    const now = 1_700_000_000_000;
    const { next } = applyLazySettings(
      {
        hearts: 4,
        heartsRegenAt: now - 10 * HEART_REGEN_MINUTES * MIN,
        streakDays: 0,
        streakLastDay: null,
      },
      now,
    );
    expect(next.hearts).toBe(MAX_HEARTS);
    expect(next.heartsRegenAt).toBeNull();
  });

  it("no toca nada si aún no ha pasado un bloque completo", () => {
    const now = 1_700_000_000_000;
    const { next, changed } = applyLazySettings(
      {
        hearts: 2,
        heartsRegenAt: now - 5 * MIN, // solo 5 min
        streakDays: 0,
        streakLastDay: null,
      },
      now,
    );
    expect(changed).toBe(false);
    expect(next.hearts).toBe(2);
  });
});

describe("applyLazySettings — rotura de racha", () => {
  it("mantiene la racha si la última actividad fue ayer", () => {
    const { next, changed } = applyLazySettings({
      hearts: MAX_HEARTS,
      heartsRegenAt: null,
      streakDays: 7,
      streakLastDay: isoToday(-1),
    });
    expect(changed).toBe(false);
    expect(next.streakDays).toBe(7);
  });

  it("resetea la racha si la última actividad fue hace 2+ días", () => {
    const { next, changed } = applyLazySettings({
      hearts: MAX_HEARTS,
      heartsRegenAt: null,
      streakDays: 7,
      streakLastDay: isoToday(-2),
    });
    expect(changed).toBe(true);
    expect(next.streakDays).toBe(0);
  });

  it("no toca la racha si es del mismo día", () => {
    const { next, changed } = applyLazySettings({
      hearts: MAX_HEARTS,
      heartsRegenAt: null,
      streakDays: 3,
      streakLastDay: isoToday(0),
    });
    expect(changed).toBe(false);
    expect(next.streakDays).toBe(3);
  });
});

describe("onHeartsLost", () => {
  it("arranca el timer al perder por primera vez", () => {
    const now = 1_700_000_000_000;
    expect(onHeartsLost(5, 4, null, now)).toBe(now);
  });

  it("no pisa un timer ya activo", () => {
    const now = 1_700_000_000_000;
    expect(onHeartsLost(3, 2, now - 5 * MIN, now)).toBe(now - 5 * MIN);
  });

  it("si no se pierden corazones, deja el timer como está", () => {
    expect(onHeartsLost(5, 5, null)).toBeNull();
  });
});
