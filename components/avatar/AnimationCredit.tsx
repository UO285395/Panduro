import type { Sign } from "@/lib/curriculum/schema";

/** Cita el vídeo del que sale la animación (el DILSE pide reconocer a la Fundación CNSE). */
export function AnimationCredit({ credit }: { credit: Sign["animationCredit"] | null | undefined }) {
  if (!credit) return null;
  const label = `${credit.source} · ${credit.license}`;
  return (
    <p className="text-[11px] leading-snug text-slate-500">
      Animación a partir del vídeo de{" "}
      {credit.url ? (
        <a href={credit.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-brand-600">
          {label}
        </a>
      ) : (
        label
      )}
    </p>
  );
}
