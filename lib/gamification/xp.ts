export const XP_PER_CORRECT = 10;
export const XP_PERFECT_BONUS = 20;
export const MAX_HEARTS = 5;
export const HEART_REGEN_MINUTES = 30;

export function computeLessonScore(params: {
  correct: number;
  total: number;
  heartsRemaining: number;
}): {
  xp: number;
  bestScore: number;
  perfected: boolean;
} {
  const { correct, total, heartsRemaining } = params;
  if (total <= 0) {
    return { xp: 0, bestScore: 0, perfected: false };
  }
  const perfected = correct === total && heartsRemaining === MAX_HEARTS;
  const xp =
    correct * XP_PER_CORRECT + (correct === total ? XP_PERFECT_BONUS : 0);
  const bestScore = Math.round((correct / total) * 100);
  return { xp, bestScore, perfected };
}
