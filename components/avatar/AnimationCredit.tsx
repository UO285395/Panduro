import type { Sign } from "@/lib/curriculum/schema";

/**
 * Cita el vídeo del que sale la animación (el DILSE pide reconocer a la Fundación CNSE). Sin
 * vídeo, la animación está hecha a partir de la descripción del signo y lo dice: quien aprende
 * no tiene otra forma de saber que puede no ser como se signa.
 */
export function AnimationCredit({
  credit,
}: {
  credit: Sign["animationCredit"] | null | undefined;
}) {
  if (!credit) {
    return (
      <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
        Animación aproximada: este signo aún no tiene un vídeo de referencia y
        puede no ser exactamente como se signa.
      </p>
    );
  }
  const label = `${credit.source} · ${credit.license}`;
  return (
    <p className="text-[11px] leading-snug text-slate-500">
      Animación a partir del vídeo de{" "}
      {credit.url ? (
        <a
          href={credit.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-brand-600"
        >
          {label}
        </a>
      ) : (
        label
      )}
    </p>
  );
}
