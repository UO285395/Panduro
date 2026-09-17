"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSnapshotDemo, isSignedIn, submitReviewDemo } from "@/lib/storage/demoStore";
import type { PendingReview } from "@/lib/progress/queries";
import type { Quality } from "@/lib/srs/sm2";
import { ReviewView } from "./review-view";

export function ReviewDemo() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<{
    cards: PendingReview[];
    nextReviewDueAt: number | null;
  } | null>(null);

  useEffect(() => {
    if (!isSignedIn()) {
      router.replace("/");
      return;
    }
    const s = getSnapshotDemo();
    setSnapshot({
      cards: s.pendingReviews,
      nextReviewDueAt: s.nextReviewDueAt,
    });
  }, [router]);

  if (!snapshot) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <p className="text-slate-500">Cargando…</p>
      </main>
    );
  }

  return (
    <ReviewView
      cards={snapshot.cards}
      nextReviewDueAt={snapshot.nextReviewDueAt}
      onAnswer={async (cardId, quality: Quality) => {
        submitReviewDemo(cardId, quality);
      }}
    />
  );
}
