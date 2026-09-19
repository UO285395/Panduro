import a1Raw from "@/content/curriculum/a1.json";
import a2Raw from "@/content/curriculum/a2.json";
import { LevelSchema, validateLevel, type Level, type Lesson, type Sign, type Unit } from "./schema";

let cachedLevels: Level[] | null = null;

function loadAll(): Level[] {
  if (cachedLevels) return cachedLevels;
  const raws = [a1Raw, a2Raw];
  const levels: Level[] = [];
  for (const raw of raws) {
    const parsed = LevelSchema.parse(raw);
    const check = validateLevel(parsed);
    if (!check.ok) {
      throw new Error(`Currículo inválido:\n${check.errors.join("\n")}`);
    }
    levels.push(parsed);
  }
  cachedLevels = levels;
  return levels;
}

export function getAllLevels(): Level[] {
  return loadAll();
}

export function getLevel(): Level {
  return loadAll()[0]!;
}

export function getAllUnits(): Unit[] {
  return getAllLevels().flatMap((lvl) => lvl.units);
}

export function getUnit(unitId: string): Unit | undefined {
  for (const level of loadAll()) {
    const unit = level.units.find((u) => u.id === unitId);
    if (unit) return unit;
  }
  return undefined;
}

export function getLesson(lessonId: string): Lesson | undefined {
  for (const level of loadAll()) {
    for (const unit of level.units) {
      const lesson = unit.lessons.find((l) => l.id === lessonId);
      if (lesson) return lesson;
    }
  }
  return undefined;
}

export function getSign(signId: string): Sign | undefined {
  for (const level of loadAll()) {
    const sign = level.signs.find((s) => s.id === signId);
    if (sign) return sign;
  }
  return undefined;
}

export function getSignsMap(): Map<string, Sign> {
  const map = new Map<string, Sign>();
  for (const level of loadAll()) {
    for (const s of level.signs) map.set(s.id, s);
  }
  return map;
}

/** Devuelve la lista ordenada de todas las lecciones de todos los niveles. */
export function getLessonSequence(): { unit: Unit; lesson: Lesson }[] {
  const out: { unit: Unit; lesson: Lesson }[] = [];
  for (const level of loadAll()) {
    for (const unit of level.units) {
      for (const lesson of unit.lessons) out.push({ unit, lesson });
    }
  }
  return out;
}

/** Índice 0-based de la lección en la secuencia global (o -1). */
export function getLessonIndex(lessonId: string): number {
  return getLessonSequence().findIndex((x) => x.lesson.id === lessonId);
}
