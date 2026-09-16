import a1Raw from "@/content/curriculum/a1.json";
import { LevelSchema, validateLevel, type Level, type Lesson, type Sign, type Unit } from "./schema";

let cachedLevel: Level | null = null;

export function getLevel(): Level {
  if (cachedLevel) return cachedLevel;
  const parsed = LevelSchema.parse(a1Raw);
  const check = validateLevel(parsed);
  if (!check.ok) {
    throw new Error(`Currículo inválido:\n${check.errors.join("\n")}`);
  }
  cachedLevel = parsed;
  return parsed;
}

export function getAllUnits(): Unit[] {
  return getLevel().units;
}

export function getUnit(unitId: string): Unit | undefined {
  return getLevel().units.find((u) => u.id === unitId);
}

export function getLesson(lessonId: string): Lesson | undefined {
  for (const unit of getLevel().units) {
    const lesson = unit.lessons.find((l) => l.id === lessonId);
    if (lesson) return lesson;
  }
  return undefined;
}

export function getSign(signId: string): Sign | undefined {
  return getLevel().signs.find((s) => s.id === signId);
}

export function getSignsMap(): Map<string, Sign> {
  const map = new Map<string, Sign>();
  for (const s of getLevel().signs) map.set(s.id, s);
  return map;
}

/** Devuelve la lista ordenada de todas las lecciones (para el árbol lineal). */
export function getLessonSequence(): { unit: Unit; lesson: Lesson }[] {
  const out: { unit: Unit; lesson: Lesson }[] = [];
  for (const unit of getLevel().units) {
    for (const lesson of unit.lessons) out.push({ unit, lesson });
  }
  return out;
}

/** Índice 0-based de la lección en la secuencia global (o -1). */
export function getLessonIndex(lessonId: string): number {
  return getLessonSequence().findIndex((x) => x.lesson.id === lessonId);
}
