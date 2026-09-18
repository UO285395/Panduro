"use client";

import { useRouter } from "next/navigation";
import type { Level } from "@/lib/curriculum/schema";
import type { UserSnapshot } from "@/lib/progress/queries";
import { createClient } from "@/lib/supabase/client";
import { DashboardView } from "./dashboard-view";

type Sequence = { unitId: string; lessonId: string }[];

export function DashboardCloud({
  level,
  levels,
  sequence,
  snapshot,
}: {
  level: Level;
  levels?: Level[];
  sequence: Sequence;
  snapshot: UserSnapshot;
}) {
  const router = useRouter();
  return (
    <DashboardView
      level={level}
      levels={levels}
      sequence={sequence}
      snapshot={snapshot}
      onSignOut={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.replace("/");
        router.refresh();
      }}
    />
  );
}
