"use client";

import { submitReview } from "@/lib/progress/reviews-client";
import type { PendingReview } from "@/lib/progress/queries";
import type { Quality } from "@/lib/srs/sm2";
import { ReviewView } from "./review-view";

export function ReviewCloud({
  cards,
  nextReviewDueAt,
}: {
  cards: PendingReview[];
  nextReviewDueAt: number | null;
}) {
  return (
    <ReviewView
      cards={cards}
      nextReviewDueAt={nextReviewDueAt}
      onAnswer={async (cardId, quality: Quality) => {
        await submitReview(cardId, quality);
      }}
    />
  );
}
