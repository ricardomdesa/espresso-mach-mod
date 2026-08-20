# SDD-007 — Épico 7: App Android (React + Capacitor)

- **Status:** Em progresso — scaffold completo, build TypeScript limpo, APK debug gerado e instalado em device físico via ADB. Auditoria pós-scaffold (2026-08-20) encontrou bugs funcionais no que estava marcado ✅; 6 corrigidos, incluindo o Tailwind que nunca foi instalado (§12). Paleta "Latte" e revisão de UI aplicadas (D9). Pendente: testes de integração com ESP32 (depende de SDD-005 e SDD-006 implementados), gaps restantes listados em §12.
- **Épico:** 7 (Fase 2)
- **Pré-requisitos:** Épico 5 (Wi-Fi + provisionamento — SDD-005); Épico 6 (API REST/WebSocket — SDD-006)
- **Plataforma alvo:** Android 10+ (API level 29+)
- **Stack:** React 18+, TypeScript, Capacitor 6+, Tailwind CSS 3.4

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
- SDD-005 entrega: AP `Philco-Setup` **sob demanda** (hold de 10 s do botão), STA, mDNS; sem fallback automático de AP (segurança).
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

### D9 — Estilo: Tailwind CSS v3 + paleta "Latte" (2026-08-20)

- **Escolha:** Tailwind CSS **3.4**, com a paleta definida como tokens semânticos em `tailwind.config.js`. Tema claro único (sem dark mode).
- **Por quê v3 e não v4:** o scaffold já escrevia todas as telas em classes Tailwind, então instalar a lib preserva o código como está. A v4 depende de `color-mix()` e `@property` (Chrome 111+); o alvo declarado é Android 10+ (API 29), onde o WebView pode ser bem mais antigo. A v3 compila para CSS plano e não tem esse piso.
- **Paleta:** bege quente no fundo (`latte #F2EADF`), creme nos cards (`cream #FFFCF7`), marrom café na primária (`mocha #6F4E37`), texto marrom quase preto (`ink #2B211A`). Temperatura (`roast #C0562B`) e pressão (`herb #4A7C59`) têm cor fixa e usam a mesma em card, gráfico e histórico — a leitura não muda de significado entre telas.
- **Tokens vs. SVG:** classes Tailwind não alcançam o interior do recharts. As cores de gráfico ficam em `src/theme.ts` e devem espelhar `tailwind.config.js` — os dois arquivos se referenciam por comentário.
- **Tema único:** sem dark mode. O app é operado numa cozinha, geralmente clara, e um segundo tema dobraria a superfície de teste sem demanda real. `<meta name="color-scheme" content="light">` evita que o WebView tente inverter.
- **Risco:** divergência entre `tailwind.config.js` e `src/theme.ts` se alguém mudar só um lado. Aceito — são 7 valores, comentados nos dois arquivos.

## 6. Estrutura de Código

```
app/
  android/                   # projeto Android gerado pelo Capacitor (não versionado?)
  capacitor.config.ts        # config do Capacitor (appId, server, plugins)
  package.json
  tsconfig.json
  vite.config.ts             # bundler (Vite — rápido, HMR)
  tailwind.config.js         # paleta "Latte" — fonte da verdade das cores (D9)
  postcss.config.js          # pipeline tailwind + autoprefixer
  index.html
  src/
    main.tsx                 # entrypoint React
    App.tsx                  # roteador + providers
    theme.ts                 # cores para SVG/canvas (recharts); espelha tailwind.config.js
    index.css                # diretivas @tailwind + base + utilitários (safe-area, tabular-live)
    api/
      client.ts              # fetch wrapper: baseURL, timeout, error handling + funções por endpoint (endpoints.ts foi fundido aqui, não é arquivo separado)
      types.ts               # tipos TypeScript do contrato REST (espelho do SDD-006)
    ws/
      useWebSocket.ts        # hook React: conectar, reconectar, parse frames/eventos (WebSocketClient.ts não existe como arquivo separado, ficou tudo no hook)
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
      Screen.tsx             # shell das telas: header sticky + main + bottom nav
      BottomNav.tsx          # navegação fixa (Extrair / Perfis / Histórico / Ajustes)
      LiveChart.tsx          # gráfico temp/pressão vs. tempo (cores de theme.ts)
      ConnectionBadge.tsx    # indicador de conexão (verde/vermelho)
      TimerDisplay.tsx       # cronômetro grande (MM:SS.ms), tabular-nums
      # PressureCurveEditor.tsx NÃO existe como componente separado. O editor
      # tem uma PRÉVIA da curva (SVG read-only, dentro de ProfileEditorScreen),
      # mas não a edição visual por arraste prevista em F8. Ver §12.
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
  pid: PIDParams;          // obrigatório — SDD-006 F1 estende /api/status com PID
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
| Build | `npm run build` + `npx cap sync android` | sem erros de TypeScript; bundle gera assets | **✅ OK** (build limpo; JS 593 kB / 173 kB gzip, CSS 13,67 kB / 3,5 kB gzip) |
| Build Android | `gradlew assembleDebug` | APK gera e instala | **✅ OK** (APK instalado via ADB em device real — **antes** da correção do Tailwind e da paleta; refazer) |
| **Visual** | **telas rodando (dev server ou APK)** | **cada tela renderiza com estilo, paleta correta, bottom nav navega** | **⏳ Pendente — ver §12. Este teste faltando foi o que deixou o #9 passar** |
| Unidade | `formatters.ts`, `validators.ts` | Jest/Vitest: passam | Pendente |
| Unidade | `useWebSocket.ts` | mock WS: reconexão, parse de frames/eventos | Pendente |
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
13. ~~**Build Android:** `npx cap sync android` + build no Android Studio; testar em device físico.~~ ✅ Concluído (APK debug instalado via ADB — antes das correções de §12; refazer)
14. ~~**Estilo:** instalar e configurar Tailwind 3.4; paleta "Latte" em tokens; revisão de UI (bottom nav, hierarquia do dashboard, estados vazios).~~ ✅ Concluído (D9, §12)
15. **Verificação visual:** rodar as telas (dev server ou APK) e conferir render, paleta e navegação. ⏳ Pendente — ver §12
16. **Testes de integração:** validar fluxo ponta a ponta com ESP32 rodando SDD-006. ⏳ Pendente
17. **Otimização:** bundle size, performance do gráfico, tratamento de erros de rede. ⏳ Pendente
18. **Documentar:** resultados, versões testadas, limitações conhecidas. ⏳ Pendente

> **Nota sobre os ✅ acima.** Os itens 1–13 foram marcados concluídos pelo scaffold original,
> mas a auditoria de §12 mostrou que vários não entregavam o que prometiam (telas sem estilo,
> PID errado, edição de perfil destrutiva, histórico que nunca gravava). Continuam marcados
> por já terem sido corrigidos — não porque a marcação original estivesse certa.

## 10. Critérios de Aceite (resumo)

- [x] `npm run build` limpo; TypeScript sem erros
- [x] `npx cap sync android` + build APK funciona
- [x] Telas estilizadas com a paleta "Latte" (D9) — CSS gerado, não só classes escritas
- [ ] Telas conferidas rodando em device (render, paleta, bottom nav) — §12
- [ ] App resolve `philco.local` ou fallback de IP na rede local
- [ ] Dashboard mostra temp/pressão/timer atualizando via WebSocket
- [ ] Start/stop de extração via app funciona (mesmo que botão físico)
- [ ] Ajuste de setpoint de temperatura e PID aplica e persiste no ESP32
- [ ] CRUD de perfis de extração sincroniza com ESP32
- [ ] Gráfico ao vivo renderiza durante extração sem travar (≥ 10 FPS)
- [ ] Histórico de extrações salva e lista corretamente
- [ ] Reconexão automática funciona após queda de Wi-Fi
- [ ] Provisionamento Wi-Fi guiado funciona (AP → STA → reconexão do app)
- [x] APK ≤ 15 MB (bundle ~173 KB gzip + CSS 3,5 KB gzip; APK debug ~7 MB)

## 11. Deferred (fora deste épico)

- iOS (Capacitor permite, mas requer build/teste separado)
- Autenticação/token na API (mitigação futura de SDD-006 D7)
- Balança integrada (épico futuro)
- Publicação na Play Store
- Notificações push
- Tema escuro/claro (pode entrar como melhoria rápida)
- Exportação de dados (CSV de histórico)

## 12. Auditoria pós-scaffold (2026-08-20)

Scaffold foi gerado por um modelo anterior e marcado ✅ em quase todo o plano de implementação (§9), mas várias entregas não funcionavam de fato. Auditoria encontrou 8 problemas; 6 corrigidos, 2 permanecem como débito técnico.

O achado mais grave (#9) só apareceu quando o trabalho passou de "ler o código" para "olhar a tela": o build passava limpo, o `tsc` não reclamava, e mesmo assim nenhuma tela tinha estilo. **Build verde não é evidência de tela funcionando** — vale rodar o app antes de marcar item de UI como concluído.

### Corrigidos

| # | Problema | Onde | Causa raiz |
|---|----------|------|------------|
| 9 | **Tailwind nunca foi instalado.** As ~1.600 linhas de `className` das 6 telas não pintavam nada; o app renderizava HTML cru empilhado. Só sobreviviam os `style={{}}` inline e o `body`. | `package.json`, `index.css` | Sem `tailwindcss` nas dependências, sem `tailwind.config.js`, sem `postcss.config.js`, sem diretivas `@tailwind` no CSS. Sintoma visível no build: CSS de saída com 0,62 kB. Corrigido: Tailwind 3.4 instalado e configurado (D9) — CSS passou para 13,67 kB |
| 1 | Botão "Aplicar PID" mandava `kp=tempSetpoint, ki=0, kd=0` pro ESP32 real (comentário no código já confessava a gambiarra) | `SettingsScreen.tsx` | `MachineStatus` não tinha campo `pid`, divergindo do contrato SDD-006 F1 — corrigido no tipo (acima) e no código |
| 2 | "Editar perfil" sempre abria formulário vazio; salvar sobrescrevia o perfil real com nome vazio + 1 step 0/0 | `ProfileEditorScreen.tsx` | Nunca buscava o perfil existente por id — corrigido: carrega do context, com refresh e tela de "não encontrado" |
| 3 | IP manual vazio/malformado no Setup derrubava o app pra tela branca sem recuperação (sem `ErrorBoundary` em lugar nenhum) | `MachineContext.tsx` + `SetupScreen.tsx` | `new URL()` sem try/catch no corpo do render — corrigido: validação antes de conectar + guard no context |
| 5 | Extrações nunca eram gravadas no histórico local apesar de F11 estar marcado ✅ | `DashboardScreen.tsx` / `useLocalHistory` | `add()` do hook nunca era chamado em lugar nenhum do app — corrigido: Dashboard grava registro (duração, médias, perfil) ao fim da extração |
| 7 | `WsEvent` do tipo `error` (máquina reporta erro) chegava no context (`lastEvent`) e nenhuma tela avisava o usuário | `DashboardScreen.tsx` | Ninguém lia `lastEvent` — corrigido: faixa de alerta no topo do Dashboard com a mensagem da máquina |

### Revisão de UI aplicada junto (D9)

Além da paleta, na mesma rodada:

- **Navegação unificada** — `BottomNav` fixa substitui o botão "Voltar" repetido em cada tela e os três botões soltos no rodapé do Dashboard. `Screen` padroniza header sticky, largura máxima e safe areas.
- **`tabular-nums` nas leituras ao vivo** — a 100 ms por frame, dígito de largura variável faz o número tremer. Utilitário `.tabular-live` em `index.css`.
- **`alert()` removido** — erro de comando virava diálogo do sistema (bloqueia a WebView); agora é faixa dentro da tela, com o mesmo tratamento em Perfis e Ajustes.
- **Cores do gráfico saíram do hardcode** — `LiveChart` lia `#f59e0b`/`#22c55e`/`#404040` cravados, que brigariam com o fundo bege. Agora vêm de `src/theme.ts`.
- **Prévia da curva de pressão** no editor de perfil — SVG read-only que redesenha conforme os steps mudam (cobre parte de F8, ver #8 abaixo).
- **Estados vazios com ação** — "Nenhum perfil ainda" e "Nenhuma extração ainda" trazem o botão que resolve, em vez de uma linha de texto solta.

### Débito técnico restante

| # | Problema | Onde | Impacto |
|---|----------|------|---------|
| 6 | `discoverMachine()` faz subnet scan de 3 subnets × 254 hosts (762 candidatos) em lotes de 10 sequenciais, ~15s+ no pior caso, martelando a rede local. Sem cache do IP entre boots | `discovery.ts` | Perf — não bloqueia uso, mas descoberta lenta quando mDNS e AP fallback falham |
| 8 | F8 pede **editor visual** de curva pressão×tempo; o que existe é uma **prévia** SVG read-only + inputs numéricos. Falta a edição por arraste dos pontos | `ProfileEditorScreen.tsx` | F8 parcialmente atendido — funcional e agora legível, mas sem a manipulação direta prevista no design |

### Verificação visual — pendente

As telas não foram conferidas rodando de verdade: o Chrome disponível na sessão de revisão não alcançava o servidor de desenvolvimento local (limitação de ambiente, não do código). O que foi verificado: `tsc` sem erros, `npm run build` limpo, e o CSS de saída subindo de 0,62 kB para 13,67 kB — o que confirma que o Tailwind passou a gerar estilo, mas não substitui olhar a tela. **Conferir no APK, em device, antes de marcar as telas como concluídas.**
