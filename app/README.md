# ESPresso App

App Android para controle e configuração da cafeteira Philco Espresso Modificada.

## Stack

- React 18 + TypeScript
- Vite (build tool)
- Capacitor 6 (wrapper Android)
- Tailwind CSS 3.4 (estilo)
- Recharts (gráficos)
- React Router (navegação)

## Estrutura

```
app/
  tailwind.config.js  # paleta "Latte" — fonte da verdade das cores
  src/
    theme.ts     # cores para SVG/canvas (recharts); espelha tailwind.config.js
    api/         # Tipos e cliente REST
    ws/          # WebSocket client + hook
    context/     # Estado global (máquina, settings)
    screens/     # Telas principais
    components/  # Componentes reutilizáveis
    hooks/       # Hooks customizados
    utils/       # Funções utilitárias
```

## Tema

A paleta vive em `tailwind.config.js` como tokens semânticos (`latte`, `cream`, `mocha`,
`ink`, `roast`, `herb`, …). Use as classes Tailwind (`bg-cream`, `text-mocha`) em vez de
hexadecimal cravado.

Cores dentro de SVG/canvas — onde classe não alcança, caso do recharts — ficam em
`src/theme.ts` e precisam ser mantidas em sincronia com o config.

Tema claro único, sem dark mode (ver SDD-007 D9).

## Comandos

```bash
cd app

# Instalar dependencias
npm install

# Dev server (browser)
npm run dev

# Build + sync com Android
npm run build
npx cap sync android

# Abrir no Android Studio
npx cap open android
```

## Requisitos

- Node.js 18+
- Android Studio (para build do APK)

## Observacoes

- O app comunica com o ESP32 via rede local (Wi-Fi).
- Descoberta automática via mDNS (`philco.local`) com fallback para scan de subnet.
- WebSocket para streaming de dados em tempo real (100 ms).
- Histórico de extrações fica salvo localmente no dispositivo (`@capacitor/preferences`).
