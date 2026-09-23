/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-purple': '#6D28D9',
        'brand-blue': '#2563EB',
        'brand-teal': '#0D9488',
      },
    },
  },
  plugins: [],
};
