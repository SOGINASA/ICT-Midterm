/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff8f3",
          100: "#dcf1e5",
          200: "#b4e1c8",
          500: "#2b9168",
          600: "#187451",
          700: "#125d40",
          900: "#143d30",
        },
      },
      fontFamily: { sans: ["DM Sans", "sans-serif"] },
    },
  },
  plugins: [],
};
