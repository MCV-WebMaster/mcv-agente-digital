/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'mcv-azul': '#4A90E2',  // Azul corporativo
        'mcv-verde': '#417505', // Verde corporativo
        'mcv-gris': '#595959',  // Gris corporativo
        'mcv-celeste': '#00AEEF' // Celeste complementario
      },
    },
  },
  plugins: [],
}