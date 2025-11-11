/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'mcv-azul': '#388BC2', // C75 M40 Y10 K0
        'mcv-verde': '#2F6C00', // C75 M0 Y100 K40
        'mcv-gris': '#595959', // K65
      },
    },
  },
  plugins: [],
};

export default config;