import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          ink: '#101621',
          cobalt: '#0b4f6c',
          mint: '#4ecdc4',
          sand: '#f2f4e8',
          rose: '#ff6b6b',
        },
      },
      boxShadow: {
        glow: '0 10px 40px rgba(78, 205, 196, 0.35)',
      },
      backgroundImage: {
        mesh:
          'radial-gradient(circle at 15% 20%, rgba(78,205,196,0.25), transparent 40%), radial-gradient(circle at 80% 0%, rgba(255,107,107,0.25), transparent 35%), linear-gradient(140deg, #101621 0%, #0b4f6c 52%, #101621 100%)',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Manrope"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
