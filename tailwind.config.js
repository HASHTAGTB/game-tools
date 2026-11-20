/** @type {import('tailwindcss').Config} */
// Palette and type are taken from the HTAWAGE Ren'Py GUI (game/gui.rpy, gui/main_menu.png).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#2b2826", 2: "#34302c", 3: "#403a35", line: "#544c45" },
        bone: "#d9d0c7",
        paper: "#faf5ef",
        taupe: "#8a7d72",
        caramel: "#c4956a",
        coral: "#e38c7e",
        butter: "#e3d07e",
        periwinkle: "#7e9be3",
        outline: "#2f2924",
      },
      fontFamily: {
        sans: ["Josefin Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        talk: ["Nunito", "ui-rounded", "system-ui", "sans-serif"],
      },
      keyframes: {
        "pop-in": { "0%": { opacity: "0", transform: "scale(.97)" }, "100%": { opacity: "1", transform: "scale(1)" } },
      },
      animation: { "pop-in": "pop-in .12s ease-out" },
    },
  },
  plugins: [],
};
