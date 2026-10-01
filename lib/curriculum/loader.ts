import "server-only";
import capturedRaw from "@/content/signs/captured.json";
import { CapturedSignsSchema, type Level } from "./schema";
import { curriculumQueries, parseLevels } from "./structure";

/**
 * El currículo con las animaciones definitivas: las grabaciones reales sustituyen al clip
 * generado. Pesa lo que pesan todas las grabaciones, así que solo se usa en el servidor (el
 * build falla si un componente cliente lo importa): las páginas pasan por props los signos
 * que pintan, y el navegador pide el resto a /api/clips/[id] o usa
 * `@/lib/curriculum/structure` si no anima signos.
 */

let cachedLevels: Level[] | null = null;

function loadAll(): Level[] {
  if (cachedLevels) return cachedLevels;
  const captured = CapturedSignsSchema.parse(capturedRaw).signs;
  const levels = parseLevels();
  for (const level of levels) {
    for (const sign of level.signs) {
      const rec = captured[sign.id];
      if (rec) {
        sign.avatarClip = rec.avatarClip;
        sign.handedness = rec.avatarClip.handedness;
        if (rec.license) sign.animationCredit = { source: rec.source, license: rec.license, url: rec.url };
      }
    }
  }
  cachedLevels = levels;
  return levels;
}

export const {
  getAllLevels,
  getLevel,
  getAllUnits,
  getUnit,
  getLesson,
  getSign,
  getSignsMap,
  getLessonSequence,
  getLessonIndex,
} = curriculumQueries(loadAll);
