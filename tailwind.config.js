/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sky: {
          // Keep main app mostly as-today; ink is thick black for reading
          // Values come from CSS vars so dark mode can remaps the whole site.
          soft: 'var(--sky-soft)',
          mist: 'var(--sky-mist)',
          light: 'var(--sky-light)',
          card: 'var(--sky-card)',
          line: 'var(--sky-line)',
          mid: 'var(--sky-mid)',
          deep: 'var(--sky-deep)',
          panel: 'var(--sky-panel)',
          panelMid: 'var(--sky-panel-mid)',
          panelSoft: 'var(--sky-panel-soft)',
          ink: 'var(--sky-ink)',
          // Common Tailwind-scale aliases used across the app
          50: 'var(--sky-50)',
          100: 'var(--sky-100)',
          200: 'var(--sky-200)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        thick: '700',
      },
      animation: {
        'fade-up': 'fadeUp 0.8s ease-out forwards',
        'fade-in': 'fadeIn 1s ease-out forwards',
        float: 'float 8s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
      },
    },
  },
  plugins: [],
};
