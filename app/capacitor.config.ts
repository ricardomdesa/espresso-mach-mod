import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.rmdsistemas.espresso',
  appName: 'ESPresso',
  webDir: 'dist',
  server: {
    // A máquina só fala HTTP/WS em texto claro na rede local. Com o esquema
    // padrão (https://localhost) a WebView trata tudo como conteúdo misto:
    // fetch http:// é bloqueado e `new WebSocket('ws://...')` lança
    // SecurityError. Servir a app em http://localhost alinha as origens.
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
}

export default config
