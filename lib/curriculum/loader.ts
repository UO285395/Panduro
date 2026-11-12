import capturedRaw from "@/content/signs/captured.json";
import correctionsRaw from "@/content/signs/corrections.json";
import { withFace } from "@/lib/avatar/compose";
import { applyCorrections, type Corrections } from "@/lib/avatar/corrections";
import { CapturedSignsSchema, type Level } from "./schema";
import { curriculumQueries, parseLevels } from "./structure";

/**
 * El currículo con las animaciones definitivas: las grabaciones reales sustituyen al clip
 * generado. Pesa lo que pesan todas las grabaciones; en el navegador, si no hace falta
 * animar signos, mejor `@/lib/curriculum/structure`.
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
        // Lo que el vídeo midió mal y se ha corregido a mano (ver lib/avatar/corrections).
        const fix = (correctionsRaw as unknown as Corrections)[sign.id];
        sign.avatarClip = fix ? applyCorrections(rec.avatarClip, fix.patches) : rec.avatarClip;
        sign.handedness = rec.avatarClip.handedness;
        if (rec.license) sign.animationCredit = { source: rec.source, license: rec.license, url: rec.url };
      }
      if (sign.face && sign.avatarClip) sign.avatarClip = withFace(sign.avatarClip, sign.face);
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
