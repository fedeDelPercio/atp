import type { Config } from "tailwindcss";

// Tailwind 3.4 (no 4). Dark mode por clase: la app togglea la clase `dark`
// en <html> respetando prefers-color-scheme y la eleccion del usuario.
const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Acentos semanticos del panel.
        // esmeralda = estados OK (evaluator paso, completado).
        // ambar = atencion (escalado a humano, reintentos).
        ok: {
          DEFAULT: "#10b981",
          fg: "#065f46",
          bg: "#ecfdf5",
        },
        warn: {
          DEFAULT: "#f59e0b",
          fg: "#92400e",
          bg: "#fffbeb",
        },
      },
    },
  },
  plugins: [],
};

export default config;
