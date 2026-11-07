/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['DM Serif Display', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          50: '#f8f9fa', 100: '#eef0f2', 200: '#d8dce1', 300: '#b8bfc8',
          400: '#929daa', 500: '#6e7b8a', 600: '#566370', 700: '#454f5a',
          800: '#2f363e', 900: '#1a1f25', 950: '#0d1013',
        },
        accent: {
          50: '#fef2f2', 100: '#fde3e3', 200: '#fbc8c8', 300: '#f7a0a0',
          400: '#f06b6b', 500: '#e53e3e', 600: '#d12626', 700: '#b91c1c',
          800: '#991b1b', 900: '#7f1d1d',
        },
        sage: {
          50: '#f0f5f0', 100: '#dce8dc', 200: '#b8d1b8', 300: '#8db88d',
          400: '#659a65', 500: '#4a7f4a', 600: '#3a663a', 700: '#2f522f',
          800: '#264226', 900: '#1e361e',
        },
        mist: {
          50: '#f0f7fb', 100: '#dceef6', 200: '#b9dcee', 300: '#8ac4e0',
          400: '#59a8cf', 500: '#3b8dba', 600: '#2d729b', 700: '#255d7e',
          800: '#1f4d68', 900: '#1a4158',
        },
        sand: {
          50: '#fefefe', 100: '#fafbf9', 200: '#f4f5f1', 300: '#eaece6',
          400: '#dde0d8', 500: '#c8cdc2',
        },
        navy: {
          DEFAULT: '#0D1B2E',
          50: '#f0f4f8', 100: '#d9e2ec', 200: '#bcccdc', 300: '#9fb3c8',
          400: '#829ab1', 500: '#627d98', 600: '#486581', 700: '#334e68',
          800: '#243b53', 900: '#0D1B2E', 950: '#091525',
        },
        'brand-red': '#D62839',
        'brand-cyan': '#A5F3FC',
        'brand-teal': {
          DEFAULT: '#155E75',
          light: '#f4fbf9',
          border: '#b8ddd4',
        },
        'bg-page': '#e4e6eb',
        // UX2 (redesign) tokens — see src/ux2/tokens.css
        ux2: {
          navy: '#0D1B2E',
          ink: '#1A1F25',
          muted: '#5F6C7B',
          dim: '#8A96A3',
          line: '#E3E8EE',
          'line-strong': '#D8DCE1',
          surface: '#F5F7FA',
          red: '#E23B4E',
          'red-ink': '#B71C2A',
          'red-tint': '#FBE9EB',
          cyan: '#A5F3FC',
          teal: '#155E75',
          'teal-tint': '#E6F1F4',
          plum: '#4F46A8',
          'plum-tint': '#ECEBF8',
          sage: '#3A663A',
          'sage-tint': '#E8F0E8',
          amber: '#9A5B00',
          'amber-tint': '#FBF1E2',
        },
        warn: {
          bg: '#fff8f8',
          border: '#f0c4c8',
        },
        'status-ok': {
          bg: '#f4fbf9',
          border: '#b8ddd4',
        },
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fadeUp 0.25s ease-out both',
      },
    },
  },
  plugins: [],
}
