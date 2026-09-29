import a1Raw from "@/content/curriculum/a1.json";
import a2Raw from "@/content/curriculum/a2.json";
import b1Raw from "@/content/curriculum/b1.json";
import b2Raw from "@/content/curriculum/b2.json";
import c1Raw from "@/content/curriculum/c1.json";
import c2Raw from "@/content/curriculum/c2.json";
import { LevelSchema, validateLevel, type Lesson, type Level, type Sign, type Unit } from "./schema";

/**
 * El currículo sin las animaciones grabadas (content/signs/captured.json, casi 2 MB): lo
 * que necesitan el panel, las estadísticas, el repaso o el cierre de una lección, que corren
 * en el navegador y solo miran niveles, lecciones y glosas. Para los signos con su animación
 * definitiva, `@/lib/curriculum/loader`.
 */
export function parseLevels(): Level[] {
  return [a1Raw, a2Raw, b1Raw, b2Raw, c1Raw, c2Raw].map((raw) => {
    const parsed = LevelSchema.parse(raw);
    const check = validateLevel(parsed);
    if (!check.ok) {
      throw new Error(`Currículo inválido:\n${check.errors.join("\n")}`);
    }
    return parsed;
  });
}

/** Consultas sobre unos niveles; `loader` las usa con los signos grabados ya puestos. */
export function curriculumQueries(load: () => Level[]) {
  const getAllLevels = (): Level[] => load();
  const getAllUnits = (): Unit[] => load().flatMap((lvl) => lvl.units);
  const getLessonSequence = (): { unit: Unit; lesson: Lesson }[] =>
    load().flatMap((level) => level.units.flatMap((unit) => unit.lessons.map((lesson) => ({ unit, lesson }))));
  const getSignsMap = (): Map<string, Sign> => new Map(load().flatMap((level) => level.signs.map((s) => [s.id, s])));
  return {
    getAllLevels,
    getLevel: (): Level => load()[0]!,
    getAllUnits,
    getUnit: (unitId: string): Unit | undefined => getAllUnits().find((u) => u.id === unitId),
    getLesson: (lessonId: string): Lesson | undefined =>
      getLessonSequence().find((x) => x.lesson.id === lessonId)?.lesson,
    getSign: (signId: string): Sign | undefined => {
      for (const level of load()) {
        const sign = level.signs.find((s) => s.id === signId);
        if (sign) return sign;
      }
      return undefined;
    },
    getSignsMap,
    /** Lista ordenada de todas las lecciones de todos los niveles. */
    getLessonSequence,
    /** Índice 0-based de la lección en la secuencia global (o -1). */
    getLessonIndex: (lessonId: string): number => getLessonSequence().findIndex((x) => x.lesson.id === lessonId),
  };
}

let cached: Level[] | null = null;

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
} = curriculumQueries(() => (cached ??= parseLevels()));
