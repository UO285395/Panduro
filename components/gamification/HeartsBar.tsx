import { MAX_HEARTS } from "@/lib/gamification/xp";

export function HeartsBar({ hearts }: { hearts: number }) {
  const clamped = Math.max(0, Math.min(MAX_HEARTS, hearts));
  return (
    <div
      className="flex items-center gap-1"
      role="status"
      aria-label={`${clamped} de ${MAX_HEARTS} corazones`}
    >
      {Array.from({ length: MAX_HEARTS }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={`text-lg ${i < clamped ? "text-red-500" : "text-slate-300 dark:text-slate-600"}`}
        >
          ♥
        </span>
      ))}
    </div>
  );
}
