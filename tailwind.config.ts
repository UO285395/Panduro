import type { Config } from "tailwindcss";

/**
 * Dos estilos que elige quien usa la app (components/ui/StyleSwitch): «Juego», de bloques de
 * color y botones con relieve, y «Cuaderno», de papel y tinta. La marca (`brand`), el color de
 * los aciertos (`petrol`) y los neutros (`slate`, que sustituye al de Tailwind) son variables
 * que cambia cada estilo en app/globals.css; coral para los fallos y dorado para rachas y XP
 * son los mismos en los dos. No hay modo oscuro: las clases `dark:` que quedan no se activan.
 */
const config: Config = {
  darkMode: ["selector", '[data-estilo="ninguno"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
          950: "rgb(var(--brand-950) / <alpha-value>)",
        },
        petrol: {
          50: "rgb(var(--petrol-50) / <alpha-value>)",
          100: "rgb(var(--petrol-100) / <alpha-value>)",
          200: "rgb(var(--petrol-200) / <alpha-value>)",
          300: "rgb(var(--petrol-300) / <alpha-value>)",
          400: "rgb(var(--petrol-400) / <alpha-value>)",
          500: "rgb(var(--petrol-500) / <alpha-value>)",
          600: "rgb(var(--petrol-600) / <alpha-value>)",
          700: "rgb(var(--petrol-700) / <alpha-value>)",
          800: "rgb(var(--petrol-800) / <alpha-value>)",
          900: "rgb(var(--petrol-900) / <alpha-value>)",
          950: "rgb(var(--petrol-950) / <alpha-value>)",
        },
        slate: {
          50: "rgb(var(--slate-50) / <alpha-value>)",
          100: "rgb(var(--slate-100) / <alpha-value>)",
          200: "rgb(var(--slate-200) / <alpha-value>)",
          300: "rgb(var(--slate-300) / <alpha-value>)",
          400: "rgb(var(--slate-400) / <alpha-value>)",
          500: "rgb(var(--slate-500) / <alpha-value>)",
          600: "rgb(var(--slate-600) / <alpha-value>)",
          700: "rgb(var(--slate-700) / <alpha-value>)",
          800: "rgb(var(--slate-800) / <alpha-value>)",
          900: "rgb(var(--slate-900) / <alpha-value>)",
          950: "rgb(var(--slate-950) / <alpha-value>)",
        },
        // Fallos y avisos de error: coral, que no se confunde con la mandarina de la marca.
        ko: {
          50: "#FFF1EF",
          100: "#FFDAD6",
          200: "#FFB4AB",
          300: "#FF897D",
          400: "#F4675A",
          500: "#DC3B2F",
          600: "#B3261E",
          700: "#8C1D18",
          800: "#6A1612",
          900: "#4A0F0C",
          950: "#2A0806",
        },
        // Rachas y XP: dorado.
        accent: {
          100: "#FFF0C7",
          500: "#FFB020",
          700: "#9A6200",
        },
      },
      fontFamily: {
        sans: ["'Lexend Variable'", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["var(--font-display)", "'Lexend Variable'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // Botones con canto, como fichas que se pulsan.
        press: "0 4px 0 0 var(--tw-shadow-color)",
        "press-sm": "0 2px 0 0 var(--tw-shadow-color)",
      },
    },
  },
  plugins: [],
};

export default config;
