import type { SVGProps } from "react";

/** Iconos de trazo (24×24) que usa la interfaz. Heredan el color del texto. */
const PATHS = {
  flame:
    "M12 3c.5 3-2.2 4.6-3.6 6.6C7.3 11.2 7 12.4 7 14a5 5 0 0 0 10 0c0-2-1-3.6-2.3-4.8-.3 1.3-1 2.2-2 2.6.6-2.8-.1-6.3-.7-8.8Z",
  star: "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z",
  heart:
    "M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.2 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z",
  check: "m5 12.5 4.5 4.5L19 7.5",
  x: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  lock: "M7 11V8.5a5 5 0 0 1 10 0V11M6 11h12v9H6z",
  play: "M8 5.5v13l10.5-6.5L8 5.5Z",
  book: "M5 4.5h9.5A2.5 2.5 0 0 1 17 7v12.5H7.5A2.5 2.5 0 0 1 5 17V4.5ZM5 17a2.5 2.5 0 0 1 2.5-2.5H17M19 7v12.5",
  repeat: "M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5",
  hand: "M8 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-.5V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6.5 7-2.6 0-4.2-1.3-5.6-3.6L3.5 13a1.5 1.5 0 0 1 2.4-1.8L8 13.5",
  chart: "M5 19.5V11m7 8.5V5m7 14.5v-6M3.5 19.5h17",
  logout: "M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h10",
  arrow: "M5 12h14m-5.5-5.5L19 12l-5.5 5.5",
  close: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  camera: "M4 8h3l1.5-2.5h7L17 8h3v11H4V8Zm8 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  search: "m20 20-4.5-4.5M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H5a3 3 0 0 0 3 4m8-4h3a3 3 0 0 1-3 4m-4 3v4m-4 3h8m-6 0 .5-3h3l.5 3",
} as const;

export type IconName = keyof typeof PATHS;

/** Los que se ven mejor rellenos (llama, estrella, corazón, play). */
const FILLED = new Set<IconName>(["flame", "star", "heart", "play"]);

export function Icon({
  name,
  size = 20,
  filled,
  ...rest
}: { name: IconName; size?: number; filled?: boolean } & Omit<SVGProps<SVGSVGElement>, "name">) {
  const fill = filled ?? FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={fill ? 1.5 : 2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
