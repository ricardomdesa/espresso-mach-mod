# SDD-007 — Épico 7: App Android (React + Capacitor)

- **Status:** Em progresso — scaffold completo, build TypeScript limpo, APK debug gerado e instalado em device físico via ADB. Pendente: testes de integração com ESP32 (depende de SDD-005 e SDD-006 implementados).
- **Épico:** 7 (Fase 2)
- **Pré-requisitos:** Épico 5 (Wi-Fi + provisionamento — SDD-005); Épico 6 (API REST/WebSocket — SDD-006)
- **Plataforma alvo:** Android 10+ (API level 29+)
- **Stack:** React 18+, TypeScript, Capacitor 6+, Tailwind CSS (ou equivalente)

## 1. Problema

O MVP (épicos 1–4) e a fundação de rede (épicos 5–6) entregam o firmware com Wi-Fi, mDNS, REST e WebSocket, mas o usuário ainda não tem uma interface mobile para configurar a máquina, criar perfis de extração, acompanhar gráficos em tempo real nem revisar histórico. O OLED físico é propositalmente minimalista (temp, pressão, timer) — toda configuração, profiling e visualização rica fica no app. Sem o app, a Fase 2 não é utilizável.

## 2. Objetivos

1. App Android nativo (via Capacitor) que descobre, conecta e controla a máquina Philco na rede local.
2. Tela de provisionamento Wi-Fi (guia o usuário a conectar no AP `Philco-Setup` e enviar credencial).
3. Dashboard em tempo real: temperatura, pressão, cronômetro, estado da extração — via WebSocket.
4. Ajuste de setpoint de temperatura e parâmetros PID (Kp, Ki, Kd) via REST.
5. CRUD de perfis de extração (pré-infusão, rampa, declínio) com editor visual (curva pressão × tempo).
6. Gráficos de extração ao vivo (temperatura e pressão vs. tempo) durante o shot.
7. Histórico de extrações (local no app) com resumo (tempo, yield, perfil usado).
8. Start/stop de extração via app (equivalente ao botão físico).

**Não-objetivos (deste épico):**
- iOS (só Android por enquanto; Capacitor permite iOS futuro com mesmo codebase).
- Autenticação/token (rede local aberta, conforme SDD-006 D7).
- Balança integrada (épico futuro).
- Notificações push.
- Publicação na Play Store (build local/APK).

## 3. Contexto / Arquitetura Atual

- `ARCHITECTURE.md` §"App React + Capacitor (mobile)": app é a interface rica para tudo que não cabe no OLED — ajuste PID, perfis, gráficos, histórico.
- `ARCHITECTURE.md` §"Comunicação ESP32 ↔ App": app resolve o ESP32 via mDNS (`philco.local`) e consome WebSocket (streaming 100 ms) + REST (comandos).
- SDD-005 entrega: AP `Philco-Setup`, portal cativo, STA, mDNS, fallback AP.
- SDD-006 entrega: REST completo (`/api/status`, `/api/setpoint/*`, `/api/pid`, `/api/extraction/*`, `/api/profiles/*`) e WebSocket (`/ws`) com streaming + eventos.
- Contrato API já estável (SDD-006 §6) — app é consumidor, não define novos endpoints.

## 4. Requisitos

### Funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|--------------------|
| F1 | Descoberta da máquina na rede | app resolve `philco.local` via mDNS (ou fallback p/ IP fixo `192.168.4.1` em modo AP) |
| F2 | Conexão Wi-Fi guiada | se máquina em modo AP, app instrui usuário a conectar no SSID `Philco-Setup` e envia credencial via REST (SDD-005 F2) |
| F3 | Dashboard em tempo real | tela principal mostra temp, pressão, timer, estado — atualiza via WebSocket a cada 100 ms |
| F4 | Ajuste de setpoint de temperatura | slider/numérico que chama `PUT /api/setpoint/temp`; valor reflete no OLED em ≤ 1 s |
| F5 | Ajuste de PID (Kp, Ki, Kd) | campos numéricos que chamam `PUT /api/pid`; persistido no ESP32 |
| F6 | Start/stop de extração | botão que chama `POST /api/extraction/start` e `/stop`; estado reflete no dashboard |
| F7 | Lista de perfis de extração | tela que consome `GET /api/profiles`; mostra nome, descrição, ativo |
| F8 | Criar/editar perfil | formulário + editor de curva (pressão × tempo) que chama `POST/PUT /api/profiles`; validação local |
| F9 | Selecionar perfil ativo | chamada `PUT /api/profiles/active`; dashboard mostra perfil em uso |
| F10 | Gráfico ao vivo durante extração | chart temp + pressão vs. tempo, atualizado por frames WebSocket; zoom/pan opcional |
| F11 | Histórico local de extrações | salvo em `localStorage`/SQLite do Capacitor; lista com data, tempo, perfil, temp média |
| F12 | Reconexão automática | se WebSocket cair, tenta reconectar a cada 3 s com backoff; se falhar por > 30 s, volta para tela de busca |

### Não-funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|--------------------|
| N1 | Offline-first mínimo | app funciona sem rede (só não mostra dados ao vivo); histórico local disponível |
| N2 | Frame rate do gráfico ≥ 10 FPS | chart não trava com frames WebSocket a 100 ms |
| N3 | APK ≤ 15 MB | build otimizado, sem assets desnecessários |
| N4 | Latência app → máquina ≤ 500 ms | comando REST ida e volta (rede local) |
| N5 | Código 100 % TypeScript | sem `any` implícito; tipos compartilhados com contrato API |
| N6 | UI responsiva | funciona em telas de 5" a 7" (smartphones comuns); orientação portrait |
| N7 | Sem dependência de serviços externos | nada de Firebase, Analytics, etc. — app é 100 % local/offline |

## 5. Decisões de Design (ADR)

### D1 — Framework: React + Capacitor (não Flutter nem nativo)

- **Escolha:** React 18 + TypeScript + Capacitor 6.
- **Por quê:** `ARCHITECTURE.md` já define essa stack; equipe familiarizada com web; mesmo código pode virar iOS futuramente; integração com WebSocket e HTTP é trivial em JS.
- **Alternativas:** Flutter (mais performático, mas outra linguagem/framework); Kotlin nativo (mais controle, mas não compartilha com iOS).
- **Risco:** performance de gráficos em WebView — mitigar com biblioteca canvas otimizada (D4).

### D2 — Navegação: React Router (hash router)

- **Escolha:** `react-router-dom` com `HashRouter` (funciona no file:// do Capacitor sem servidor HTTP interno).
- **Por quê:** SPA com múltiplas telas (dashboard, perfis, editor, histórico, config); transições suaves; state persistente entre telas.

### D3 — Comunicação: `capacitor-community/http` + WebSocket nativo

- **Escolha:** REST via `fetch`/`capacitor-community/http` (CORS não é problema em rede local); WebSocket via `WebSocket` browser nativo.
- **Por quê:** Capacitor roda em WebView — `fetch` e `WebSocket` funcionam normalmente para IPs locais; não precisa de plugin nativo de rede.
- **Risco:** mDNS (`philco.local`) pode não resolver no Android WebView em algumas versões — mitigar com descoberta fallback (D5).

### D4 — Gráficos: `recharts` (ou `chart.js`)

- **Escolha:** `recharts` (React-friendly, SVG) para dashboards e gráficos ao vivo.
- **Por quê:** API declarativa, fácil de tipar com TypeScript, performance OK para 2 séries × ~300 pontos (30 s de extração a 100 ms). Se houver drop de FPS, fallback para `chart.js` com canvas.
- **Alternativa:** `chart.js` (mais performático, mas API imperativa) ou `uPlot` (mais leve, mas menos flexível).

### D5 — Descoberta: mDNS + fallback manual

- **Escolha:** tentar resolver `philco.local` primeiro; se falhar, fallback para scan de IP na subnet (ex. `192.168.1.0/24`) ou entrada manual do IP; em modo AP, usar `192.168.4.1` direto.
- **Por quê:** mDNS no Android é inconsistente entre fabricantes/Versões; não pode ser o único caminho. Subnet scan é lento (até 254 requisições) — fazer em background com timeout curto (200 ms).

### D6 — Estado global: React Context + `useReducer`

- **Escolha:** estado de conexão (WebSocket, máquina descoberta) via React Context + `useReducer`; estado local de telas via `useState`.
- **Por quê:** sem biblioteca externa (Redux/Zustand) — projeto é pequeno/médio; Context é suficiente para < 10 telas. Se escalar, migração para Zustand é trivial.

### D7 — Histórico local: Capacitor Preferences (ou SQLite)

- **Escolha:** `@capacitor/preferences` (key-value, assíncrono) para histórico simples.
- **Por quê:** histórico é array de objetos JSON pequenos (< 1000 extrações); Preferences usa `localStorage` no web e SharedPreferences no Android — suficiente. Se crescer muito, migra para `@capacitor-community/sqlite`.

### D8 — Build e deploy: Capacitor CLI + Android Studio

- **Escolha:** `npx cap sync android` + build via Android Studio (ou `gradlew assembleRelease`).
- **Por quê:** gera APK/AAB padrão Android; debug via Chrome DevTools (inspect WebView); assinatura manual para instalação local (fora da Play Store nesta fase).

## 6. Estrutura de Código

```
app/
  android/                   # projeto Android gerado pelo Capacitor (não versionado?)
  capacitor.config.ts        # config do Capacitor (appId, server, plugins)
  package.json
  tsconfig.json
  vite.config.ts             # bundler (Vite — rápido, HMR)
  index.html
  src/
    main.tsx                 # entrypoint React
    App.tsx                  # roteador + providers
    api/
      client.ts              # fetch wrapper: baseURL, timeout, error handling
      types.ts               # tipos TypeScript do contrato REST (espelho do SDD-006)
      endpoints.ts           # funções para cada endpoint REST
    ws/
      WebSocketClient.ts     # wrapper WebSocket: conectar, reconectar, parse frames
      useWebSocket.ts        # hook React que expõe último frame e estado da conexão
    context/
      MachineContext.tsx     # estado global: conectado?, dados atuais, perfil ativo
      SettingsContext.tsx    # tema, unidades (°C/bar vs °F/psi)
    screens/
      DashboardScreen.tsx    # tela principal: dados ao vivo + start/stop
      ProfilesScreen.tsx     # lista de perfis
      ProfileEditorScreen.tsx # formulário + editor de curva
      SettingsScreen.tsx     # PID, setpoint temp, unidades
      HistoryScreen.tsx      # histórico local de extrações
      SetupScreen.tsx        # descoberta + provisionamento Wi-Fi
    components/
      LiveChart.tsx          # gráfico temp/pressão vs. tempo
      ConnectionBadge.tsx    # indicador de conexão (verde/vermelho)
      PressureCurveEditor.tsx # editor visual de curva pressão × tempo
      TimerDisplay.tsx       # cronômetro grande (MM:SS.ms)
    hooks/
      useMachineApi.ts       # abstração CRUD perfis + setpoints
      useLocalHistory.ts     # grava/lê histórico no Preferences
    utils/
      discovery.ts           # lógica de mDNS + subnet scan + fallback IP
      formatters.ts          # formatar temp, pressão, tempo
      validators.ts          # validar perfil, PID, etc.
  public/
    assets/                  # ícones, splash (gerados pelo capacitor-assets)
```

### Contrato TypeScript (mirror SDD-006)

```typescript
// src/api/types.ts
export interface MachineStatus {
  temp: number;           // °C
  press: number;          // bar
  tempSetpoint: number;
  pressSetpoint: number;
  timer: number;          // segundos
  state: 'idle' | 'heating' | 'extracting' | 'error';
  profile: string | null;
  uptime: number;
  wifiMode: 'ap' | 'sta';
}

export interface PIDParams {
  kp: number;
  ki: number;
  kd: number;
}

export interface ExtractionProfile {
  id: string;
  name: string;
  description?: string;
  steps: ProfileStep[];   // array de {time_s, pressure_bar}
}

export interface WsFrame {
  t: number;              // ms desde start
  temp: number;
  press: number;
  timer: number;
  state: MachineStatus['state'];
  profile: string | null;
}

export type WsEvent =
  | { event: 'extraction_started' }
  | { event: 'extraction_stopped' }
  | { event: 'error'; msg: string };
```

### Fluxo de telas

```
[SetupScreen] ──(máquina descoberta)──> [DashboardScreen]
     ↑                                        │
     └────────(perde conexão > 30 s)──────────┘

[DashboardScreen] ──(menu)──> [ProfilesScreen]
                               [ProfileEditorScreen] (nova/editar)
                               [SettingsScreen]
                               [HistoryScreen]
```

### Fluxo de conexão (boot do app)

```
app abre
  discovery.resolve()              # tenta philco.local → IP
  se falha: subnetScan() + fallback manual
  se IP encontrado:
    REST GET /api/status           # valida API
    WebSocketClient.connect(ws://IP/ws)
    navega para DashboardScreen
  se não encontrado:
    navega para SetupScreen
      se máquina em AP: instrui conectar em Philco-Setup + POST credencial
      se não: ajuda de troubleshooting
```

## 7. Testes

| Tipo | Escopo | Critério | Status |
|------|--------|----------|--------|
| Build | `npm run build` + `npx cap sync android` | sem erros de TypeScript; bundle gera assets | **✅ OK** (build limpo, 581 KB JS gzip) |
| Build Android | `gradlew assembleDebug` | APK gera e instala | **✅ OK** (APK instalado via ADB em device real) |
| Unidade | `formatters.ts`, `validators.ts` | Jest/Vitest: passam | Pendente |
| Unidade | `WebSocketClient.ts` | mock WS: reconexão, parse de frames/eventos | Pendente |
| Integração | `client.ts` + mock HTTP | endpoints REST retornam tipos corretos | Pendente |
| Hardware | descoberta `philco.local` | resolve na rede local do usuário | Pendente |
| Hardware | dashboard ao vivo | frames WebSocket a 100 ms chegam e renderizam | Pendente |
| Hardware | ajuste PID + setpoint | valor aplicado no ESP32 e persiste após reboot | Pendente |
| Hardware | CRUD de perfis | perfil criado no app aparece no ESP32 (GET /api/profiles) | Pendente |
| Hardware | start/stop via app | bomba liga/desliga; evento WebSocket chega | Pendente |
| Hardware | provisionamento Wi-Fi | app envia credencial; ESP32 conecta STA; app reconecta | Pendente |
| Regressão | app com ESP32 offline | histórico local acessível; mensagem "máquina offline" | Pendente |

## 8. Riscos e Mitigações

| Risco | Impacto | Mitigação | Status |
|-------|---------|-----------|--------|
| mDNS (`philco.local`) não resolve no Android WebView | app não encontra máquina | D5 — fallback subnet scan + entrada manual de IP | Mitigado por design |
| WebView limita performance de gráficos ao vivo | chart lento ou trava | D4 — `recharts` com throttling; fallback para `chart.js` canvas | Mitigado por design |
| Capacitor + Android 14+ com restrições de rede | não conecta em IP local | usar `android:usesCleartextTraffic="true"` no manifest para HTTP local; testar cedo | Pendente validação |
| Perda de conexão durante extração | usuário não vê quando parou | F12 — reconexão auto; se falhar, timer local no app como backup | Mitigado por design |
| CORS em rede local (alguns roteadores) | fetch bloqueado | `capacitor-community/http` ignora CORS no nativo; testar | Mitigado por design |
| APK muito grande | build > 15 MB | tree-shaking, code-splitting por rota; analisar bundle | Mitigado por design |

## 9. Plano de Implementação

1. ~~**Scaffold:** `npm create vite@latest app -- --template react-ts`; instalar Capacitor (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`).~~ ✅ Concluído
2. ~~**Config Capacitor:** `capacitor.config.ts` com `appId: "com.philco.mod"`, `server: { cleartext: true }`.~~ ✅ Concluído
3. ~~**Tipos e cliente API:** `src/api/types.ts` (mirror SDD-006) + `client.ts` com `fetch` wrapper.~~ ✅ Concluído
4. ~~**WebSocket client:** `src/ws/WebSocketClient.ts` com auto-reconexão e parse de frames/eventos.~~ ✅ Concluído
5. ~~**Contextos globais:** `MachineContext` (estado da conexão + dados ao vivo) + `SettingsContext`.~~ ✅ Concluído
6. ~~**Tela de descoberta/setup:** `SetupScreen` com mDNS, subnet scan, fallback manual, instruções de provisionamento.~~ ✅ Concluído
7. ~~**Dashboard:** `DashboardScreen` com `TimerDisplay`, `ConnectionBadge`, dados ao vivo do WebSocket, botão start/stop.~~ ✅ Concluído
8. ~~**Gráfico ao vivo:** `LiveChart` consumindo histórico de frames WebSocket da extração atual.~~ ✅ Concluído
9. ~~**Settings:** `SettingsScreen` com sliders/campos para PID e setpoint de temperatura.~~ ✅ Concluído
10. ~~**Perfis:** `ProfilesScreen` + `ProfileEditorScreen` com editor de steps (numérico).~~ ✅ Concluído
11. ~~**Histórico:** `HistoryScreen` + `useLocalHistory` (Capacitor Preferences).~~ ✅ Concluído
12. ~~**Navegação:** React Router com transições e proteção de rotas.~~ ✅ Concluído
13. ~~**Build Android:** `npx cap sync android` + build no Android Studio; testar em device físico.~~ ✅ Concluído (APK debug instalado via ADB)
14. **Testes de integração:** validar fluxo ponta a ponta com ESP32 rodando SDD-006. ⏳ Pendente
15. **Otimização:** bundle size, performance do gráfico, tratamento de erros de rede. ⏳ Pendente
16. **Documentar:** resultados, versões testadas, limitações conhecidas. ⏳ Pendente

## 10. Critérios de Aceite (resumo)

- [x] `npm run build` limpo; TypeScript sem erros
- [x] `npx cap sync android` + build APK funciona
- [ ] App resolve `philco.local` ou fallback de IP na rede local
- [ ] Dashboard mostra temp/pressão/timer atualizando via WebSocket
- [ ] Start/stop de extração via app funciona (mesmo que botão físico)
- [ ] Ajuste de setpoint de temperatura e PID aplica e persiste no ESP32
- [ ] CRUD de perfis de extração sincroniza com ESP32
- [ ] Gráfico ao vivo renderiza durante extração sem travar (≥ 10 FPS)
- [ ] Histórico de extrações salva e lista corretamente
- [ ] Reconexão automática funciona após queda de Wi-Fi
- [ ] Provisionamento Wi-Fi guiado funciona (AP → STA → reconexão do app)
- [x] APK ≤ 15 MB (bundle ~169 KB gzip; APK debug ~7 MB)

## 11. Deferred (fora deste épico)

- iOS (Capacitor permite, mas requer build/teste separado)
- Autenticação/token na API (mitigação futura de SDD-006 D7)
- Balança integrada (épico futuro)
- Publicação na Play Store
- Notificações push
- Tema escuro/claro (pode entrar como melhoria rápida)
- Exportação de dados (CSV de histórico)
