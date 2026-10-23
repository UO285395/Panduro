import type { Sign } from "@/lib/curriculum/schema";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";

export function SignCard({
  sign,
  compact = false,
  hideAnswer = false,
}: {
  sign: Sign;
  compact?: boolean;
  /** Modo ejercicio: no mostrar glosa, traducción ni descripción. */
  hideAnswer?: boolean;
}) {
  return (
    <figure
      className={
        compact
          ? "card flex items-center gap-3 rounded-2xl p-3"
          : "card flex flex-col items-center gap-4 p-4 sm:p-6"
      }
    >
      <div
        className={
          compact
            ? "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-lg font-bold text-brand-700"
            : "flex min-h-[200px] min-w-[200px] flex-col items-center justify-center overflow-hidden rounded-2xl bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100"
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
        ) : sign.avatarClip && !compact ? (
          <AvatarPlayer
            clip={sign.avatarClip}
            label={hideAnswer ? undefined : sign.gloss}
            size={280}
          />
        ) : (
          <span className={compact ? "text-xs" : "text-4xl font-bold"}>
            {hideAnswer ? "?" : sign.gloss}
          </span>
        )}
      </div>
      {!hideAnswer && (
        <figcaption
          className={compact ? "text-sm" : "space-y-1 text-center"}
        >
          <span className="block font-display text-2xl font-extrabold">{sign.translation}</span>
          {!compact && sign.description && (
            <span className="block text-sm text-slate-600 dark:text-slate-300">
              {sign.description}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
