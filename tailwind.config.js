/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif'
        ],
      display: [
        'Inter',
        'system-ui',
        'sans-serif'
      ],
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'Consolas',
          'monospace'
        ]
      },
      fontSize: {
        '2xs': [
          '0.625rem',
          {
            lineHeight: '0.75rem'
          }
        ],
        '3xl': [
          '1.875rem',
          {
            lineHeight: '2.25rem'
          }
        ],
        '4xl': [
          '2.25rem',
          {