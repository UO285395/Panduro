import type { Exercise, Lesson } from "@/lib/curriculum/schema";

/**
 * Pasos de una lección. Antes solo había ejercicios, así que el primero preguntaba «¿qué
 * significa este signo?» sin haberlo enseñado nunca. Ahora cada signo nuevo se presenta
 * justo antes del primer ejercicio que lo usa (presentar, practicar, presentar el
 * siguiente…), y los fallos se repiten una vez al final.
 */
export type LessonStep =
  | { kind: "learn"; signId: string }
  | { kind: "exercise"; exercise: Exercise; retry: boolean };

/** Signos que necesita conocer quien hace el ejercicio. */
export function signsOf(exercise: Exercise): string[] {
  switch (exercise.type) {
    case "multiple_choice":
    case "type_word":
    case "motion_this":
    case "sign_word":
      return [exercise.signId];
    case "pick_sign":
      return [exercise.signId];
    case "match_pairs":
      return exercise.pairs.map((p) => p.signId);
    case "sign_this":
      return [];
  }
}

/**
 * @param known signos con ficha (los demás no se pueden presentar)
 * Solo se presentan los signos nuevos de la lección; los de lecciones anteriores que
 * aparezcan como repaso o distractor no.
 */
export function planLesson(lesson: Lesson, known: ReadonlySet<string>): LessonStep[] {
  const fresh = new Set(lesson.signs.filter((s) => known.has(s)));
  const introduced = new Set<string>();
  const steps: LessonStep[] = [];
  for (const exercise of lesson.exercises) {
    for (const signId of signsOf(exercise)) {
      if (fresh.has(signId) && !introduced.has(signId)) {
        introduced.add(signId);
        steps.push({ kind: "learn", signId });
      }
    }
    steps.push({ kind: "exercise", exercise, retry: false });
  }
  return steps;
}

/** Los ejercicios de cámara no se repiten: un fallo ahí suele ser del reconocimiento. */
export function isRetryable(exercise: Exercise): boolean {
  return exercise.type !== "sign_this" && exercise.type !== "motion_this" && exercise.type !== "sign_word";
}
