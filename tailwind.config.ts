import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', 'monospace'],
      },
      colors: {
        cream: {
          50: "#FAF7F2",
          100: "#F5EFEB",
          200: "#EFE6DB",
          300: "#E3D5C3",
        },
        ink: {
          DEFAULT: "#1C1917",
          light: "#292524",
          soft: "#44403C",
          muted: "#78716C",
        },
        rust: {
          DEFAULT: "#C85A32",
          hover: "#B34E29",
          light: "#F7ECE6",
        },
        vintage: {
          tan: "#EADECF",
          sand: "#DFD2C0",
          warm: "#FFFDF9",
        },
      },
      boxShadow: {
        retro: "4px 6px 0px #1C1917",
        "retro-sm": "2px 3px 0px #1C1917",
        "retro-lg": "6px 9px 0px #1C1917",
        "retro-rust": "3px 3px 0px #C85A32",
        "retro-inset": "inset 2px 2px 0px #1C1917",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "slide-up": "slideUp 0.5s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
