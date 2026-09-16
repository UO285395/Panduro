import type { Sign } from "@/lib/curriculum/schema";

export function SignCard({
  sign,
  compact = false,
}: {
  sign: Sign;
  compact?: boolean;
}) {
  return (
    <figure
      className={
        compact
          ? "flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
          : "flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"
      }
    >
      <div
        className={
          compact
            ? "flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-brand-100 text-lg font-bold text-brand-700"
            : "flex aspect-square w-full max-w-[280px] flex-col items-center justify-center rounded-xl bg-brand-100 p-6 text-center text-brand-800 dark:bg-brand-900/40 dark:text-brand-100"
        }
        aria-hidden
      >
        {sign.videoUrl ? (
          <video
            src={sign.videoUrl}
            poster={sign.posterUrl ?? undefined}
            controls
            playsInline
            className="h-full w-full rounded-lg object-cover"
          />
        ) : (
          <>
            <span className={compact ? "text-xs" : "text-4xl font-bold"}>
              {sign.gloss}
            </span>
            {!compact && (
              <span className="mt-2 text-xs uppercase tracking-wider opacity-70">
                Vídeo pendiente
              </span>
            )}
          </>
        )}
      </div>
      <figcaption
        className={
          compact
            ? "text-sm"
            : "space-y-1 text-center"
        }
      >
        <span className="block font-semibold">{sign.translation}</span>
        {!compact && sign.description && (
          <span className="block text-sm text-slate-600 dark:text-slate-300">
            {sign.description}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
