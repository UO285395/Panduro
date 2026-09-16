import type { Lesson } from "@/lib/curriculum/schema";
import { getLevel } from "@/lib/curriculum/loader";

/**
 * Formato de las card_id que persisten los reviews:
 *   sign:<SIGN_ID>     — signos aprendidos en la Unidad 1 (y futuras U-signos).
 *   letter:<X>         — letras de la dactilología (Unidad 2).
 */
export type CardId = `sign:${string}` | `letter:${string}`;

export function signCardId(signId: string): CardId {
  return `sign:${signId}` as CardId;
}
export function letterCardId(letterId: string): CardId {
  return `letter:${letterId}` as CardId;
}

/** Cards que aprende/repasa esta lección. Determinista, apto para SSR. */
export function cardIdsForLesson(lesson: Lesson): CardId[] {
  const out = new Set<CardId>();
  for (const s of lesson.signs) out.add(signCardId(s));
  for (const ex of lesson.exercises) {
    if (ex.type === "sign_this") out.add(letterCardId(ex.letterId));
    else if (ex.type === "multiple_choice" || ex.type === "type_word") {
      out.add(signCardId(ex.signId));
    } else if (ex.type === "match_pairs") {
      for (const p of ex.pairs) out.add(signCardId(p.signId));
    }
  }
  return [...out];
}

/** Enumera todas las card_ids únicas del currículo entero. */
export function getAllCardIds(): CardId[] {
  const out = new Set<CardId>();
  for (const unit of getLevel().units) {
    for (const lesson of unit.lessons) {
      for (const cid of cardIdsForLesson(lesson)) out.add(cid);
    }
  }
  return [...out];
}

/** Traduce una card_id al nombre humano (para pintar en /review). */
export function labelForCard(cardId: string): string {
  if (cardId.startsWith("sign:")) return cardId.slice(5);
  if (cardId.startsWith("letter:")) return cardId.slice(7);
  return cardId;
}
