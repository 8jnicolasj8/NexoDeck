/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./admin.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg, #0A0C0F)",
        surface: "var(--surface, #12161B)",
        "surface-2": "var(--surface-2, #1A2027)",
        border: "var(--border, #262E38)",
        text: "var(--text, #E6EDF3)",
        muted: "var(--muted, #7D8A99)",
        accent: "var(--accent, #00FF9C)",
        "accent-alt": "var(--accent-alt, #2D7BFF)",
        warn: "var(--warn, #FFB020)",
        danger: "var(--danger, #FF3B4E)",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
        sans: ["'Inter'", "sans-serif"],
      },
      borderRadius: {
        btn: "14px",
      },
      minHeight: {
        touch: "56px",
      },
      minWidth: {
        touch: "56px",
      },
    },
  },
  plugins: [],
}
