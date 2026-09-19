"use server";

import { StatsView } from "./stats-view";

type Props = {
  xpTotal: number;
  streakDays: number;
  completedCount: number;
  perfectedCount: number;
  totalLessons: number;
  letterScores: Record<string, number>;
};

export async function StatsCloud(props: Props) {
  return <StatsView {...props} />;
}
