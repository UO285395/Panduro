import type { Config } from "tailwindcss";

/**
 * Paleta «Mandarina y petróleo»: mandarina de marca (botones, lo activo), azul petróleo para
 * el progreso y los aciertos, coral para los fallos, dorado para rachas y XP, y neutros que van de un crema cálido a una tinta verdosa. Los
 * neutros sustituyen a `slate`, así toda la app los usa sin tocar cada pantalla. El modo
 * oscuro sigue al sistema (`dark:`), con los mismos tonos del lado oscuro de la escala.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FFF4EC",
          100: "#FFE6D3",
          200: "#FFC9A6",
          300: "#FFA470",
          400: "#FA8540",
          500: "#F26A1B",
          600: "#D9590E",
          700: "#B4470B",
          800: "#8A3709",
          900: "#6B2B08",
          950: "#3D1804",
        },
        petrol: {
          50: "#EAF6F5",
          100: "#D3EFEC",
          200: "#A7DDD8",
          300: "#6FC2BC",
          400: "#37A19C",
          500: "#138483",
          600: "#0F6E6E",
          700: "#0A5151",
          800: "#083F40",
          900: "#062F30",
          950: "#031B1C",
        },
        slate: {
          50: "#FBF7F2",
          100: "#F3ECE4",
          200: "#E6DDD3",
          300: "#CFC6BC",
          400: "#9AA3A1",
          500: "#6E7C7D",
          600: "#4F6064",
          700: "#384A4F",
          800: "#22353A",
          900: "#14262B",
          950: "#0C1A1E",
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
        display: ["'Baloo 2 Variable'", "'Lexend Variable'", "system-ui", "sans-serif"],
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
