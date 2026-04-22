import defaultTheme from 'tailwindcss/defaultTheme';
import plugin from 'tailwindcss/plugin';
import typographyPlugin from '@tailwindcss/typography';

export default {
  content: ['./src/**/*.{astro,html,js,jsx,json,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1F3647',
          50: '#e8edf1',
          100: '#c5d1da',
          200: '#9fb3c1',
          300: '#7994a8',
          400: '#5a7d95',
          500: '#3b6782',
          600: '#2e5570',
          700: '#1F3647',
          800: '#172a39',
          900: '#0e1d27',
        },
        secondary: {
          DEFAULT: '#527912',
          400: '#6a9a18',
          500: '#527912',
          600: '#3d5b0d',
        },
        accent: {
          DEFAULT: '#FF8A42',
          400: '#ffA166',
          500: '#FF8A42',
          600: '#e6722a',
        },
      },
      fontFamily: {
        sans: ['Poppins', ...defaultTheme.fontFamily.sans],
        heading: ['Poppins', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [typographyPlugin, plugin(({ addVariant }) => {
    addVariant('intersect', '&:not([no-intersect])');
  })],
};
