import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: { extend: { boxShadow: { soft: '0 20px 60px rgba(15,23,42,.08)' } } },
  plugins: []
};
export default config;
