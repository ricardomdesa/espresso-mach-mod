/** @type {import('tailwindcss').Config} */

// Paleta "Latte" — fonte da verdade das cores do app.
// Cores usadas dentro de canvas/SVG (LiveChart) ficam em src/theme.ts
// e precisam ser mantidas em sincronia com os valores abaixo.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        latte: '#F2EADF', // fundo da página (bege quente)
        cream: '#FFFCF7', // superfície de card
        foam: '#EAE0D2', // superfície secundária / estado inativo
        line: '#E3D7C6', // borda padrão
        'line-strong': '#CFBFA8', // borda de ênfase
        ink: '#2B211A', // texto principal (marrom quase preto)
        muted: '#8A7663', // texto secundário
        mocha: {
          DEFAULT: '#6F4E37', // primária (botões, destaques)
          dark: '#5A3E2B', // primária pressionada/hover
        },
        roast: '#C0562B', // temperatura
        herb: '#4A7C59', // pressão / sucesso
        brick: '#A33A2B', // erro / ação destrutiva
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(43, 33, 26, 0.06), 0 1px 8px rgba(43, 33, 26, 0.04)',
        raised: '0 2px 4px rgba(43, 33, 26, 0.08), 0 8px 24px rgba(43, 33, 26, 0.08)',
      },
    },
  },
  plugins: [],
}
