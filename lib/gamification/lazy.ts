import { HEART_REGEN_MINUTES, MAX_HEARTS } from "./xp";

const MS_PER_MIN = 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type LazyProfile = {
  hearts: number;
  heartsRegenAt: number | null; // epoch ms, o null si no hay timer activo
  streakDays: number;
  streakLastDay: string | null; // YYYY-MM-DD (zona local del cliente)
};

export type ApplyResult = {
  next: LazyProfile;
  changed: boolean;
};

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map((n) => parseInt(n, 10)) as [number, number, number];
  const [by, bm, bd] = b.split("-").map((n) => parseInt(n, 10)) as [number, number, number];
  const at = Date.UTC(ay, am - 1, ad);
  const bt = Date.UTC(by, bm - 1, bd);
  return Math.round((bt - at) / MS_PER_DAY);
}

/**
 * Reglas *lazy* aplicadas cada vez que se lee el perfil:
 *  1) Regeneración de corazones: 1 corazón cada 30 min desde `heartsRegenAt`,
 *     hasta llegar a MAX_HEARTS. `heartsRegenAt` avanza por bloques completos
 *     y se pone a null al alcanzar el cap.
 *  2) Rotura de racha: si la última actividad fue anterior a `hoy - 1`, la
 *     racha se resetea a 0. `today - 1` la mantiene, `today` no la toca.
 */
export function applyLazySettings(
  profile: LazyProfile,
  nowMs = Date.now(),
): ApplyResult {
  let { hearts, heartsRegenAt, streakDays, streakLastDay } = profile;
  let changed = false;

  // 1) Regeneración de corazones
  if (hearts < MAX_HEARTS && heartsRegenAt !== null) {
    const elapsed = nowMs - heartsRegenAt;
    if (elapsed > 0) {
      const blocksReady = Math.floor(elapsed / (HEART_REGEN_MINUTES * MS_PER_MIN));
      if (blocksReady > 0) {
        const gained = Math.min(blocksReady, MAX_HEARTS - hearts);
        hearts += gained;
        if (hearts >= MAX_HEARTS) {
          hearts = MAX_HEARTS;
          heartsRegenAt = null;
        } else {
          heartsRegenAt = heartsRegenAt + gained * HEART_REGEN_MINUTES * MS_PER_MIN;
        }
        changed = true;
      }
    }
  } else if (hearts >= MAX_HEARTS && heartsRegenAt !== null) {
    heartsRegenAt = null;
    changed = true;
  }

  // 2) Rotura de racha
  if (streakLastDay) {
    const today = isoDate(nowMs);
    const delta = daysBetween(streakLastDay, today);
    if (delta > 1 && streakDays !== 0) {
      streakDays = 0;
      changed = true;
    }
  }

  return {
    next: { hearts, heartsRegenAt, streakDays, streakLastDay },
    changed,
  };
}

/**
 * Cuando se pierde algún corazón y no había timer, se arranca ahora.
 * Cuando la barra ya estaba llena, tampoco tocamos el timer.
 */
export function onHeartsLost(
  before: number,
  after: number,
  heartsRegenAt: number | null,
  nowMs = Date.now(),
): number | null {
  if (after < before && heartsRegenAt === null) return nowMs;
  return heartsRegenAt;
}
