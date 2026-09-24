/**
 * Puente entre las glosas del modelo de vocabulario (SWL-LSE: `DOLOR`, `A-PARTIR-DE`,
 * `CANSADO2`, `AZUCAR(M-ES)`) y los ids del currículo (`DOLOR`, `BUENOS_DIAS`).
 */
export function glossKey(label: string): string {
  return label
    .replace(/\([^)]*\)/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
    .replace(/[-.\s]+/g, "_")
    .replace(/\d+$/, "");
}

/** Id del currículo para un texto o concepto reconocido, si existe. */
export function curriculumIdFor(label: string, known: ReadonlySet<string>): string | null {
  const key = glossKey(label);
  return known.has(key) ? key : null;
}

/** Concepto del modelo que corresponde a un signo del currículo, si lo hay. */
export function conceptFor(signId: string, concepts: readonly string[]): string | null {
  const key = glossKey(signId);
  return concepts.find((c) => !c.includes("^") && glossKey(c) === key) ?? null;
}
