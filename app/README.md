# Philco Mod App

App Android para controle e configuração da cafeteira Philco Espresso Modificada.

## Stack

- React 18 + TypeScript
- Vite (build tool)
- Capacitor 6 (wrapper Android)
- Recharts (gráficos)
- React Router (navegação)

## Estrutura

```
app/
  src/
    api/         # Tipos e cliente REST
    ws/          # WebSocket client + hook
    context/     # Estado global (máquina, settings)
    screens/     # Telas principais
    components/  # Componentes reutilizáveis
    hooks/       # Hooks customizados
    utils/       # Funções utilitárias
```

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
