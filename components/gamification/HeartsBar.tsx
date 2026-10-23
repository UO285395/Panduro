import { Icon } from "@/components/ui/Icon";
import { MAX_HEARTS } from "@/lib/gamification/xp";

/** Corazones que quedan: un corazón y el número, en coral (gris si no queda ninguno). */
export function HeartsBar({ hearts }: { hearts: number }) {
  const clamped = Math.max(0, Math.min(MAX_HEARTS, hearts));
  return (
    <div
      className={`chip tabular-nums ${
        clamped > 0 ? "bg-ko-50 text-ko-600 dark:bg-ko-950 dark:text-ko-300" : "bg-slate-100 text-slate-400 dark:bg-slate-800"
      }`}
      role="status"
      aria-label={`${clamped} de ${MAX_HEARTS} corazones`}
    >
      <Icon name="heart" size={18} />
      <span aria-hidden>{clamped}</span>
    </div>
  );
}
