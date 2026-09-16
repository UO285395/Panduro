"use client";

import { completeLesson as completeLessonServer } from "./actions";
import { completeLessonDemo } from "@/lib/storage/demoStore";
import { DEMO_MODE } from "@/lib/storage/flags";
import { cardIdsForLesson } from "@/lib/srs/scheduler";
import { getLesson } from "@/lib/curriculum/loader";

/**
 * Fachada cliente. En modo demo persiste en localStorage; en cloud llama al
 * server action que escribe en Supabase con RLS. En ambos casos inicializa
 * las tarjetas SM-2 para las cards nuevas de la lección.
 */
export async function completeLesson(input: {
  lessonId: string;
  correct: number;
  total: number;
  heartsUsed: number;
}) {
  if (DEMO_MODE) {
    const lesson = getLesson(input.lessonId);
    const cardIds = lesson ? cardIdsForLesson(lesson) : [];
    return completeLessonDemo({ ...input, cardIds });
  }
  return completeLessonServer(input);
}
