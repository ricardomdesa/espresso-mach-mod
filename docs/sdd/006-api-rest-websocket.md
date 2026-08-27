# SDD-006 — Épico 6: API REST/WebSocket (comunicação ESP32 ↔ App)

- **Status:** Implementado (build + boot validados; testes de hardware de ponta a ponta pendentes)
- **Épico:** 6 (Fase 2)
- **Pré-requisitos:** Épico 5 (Wi-Fi + provisionamento — SDD-005); MVP (épicos 1–4) funcionando
- **Hardware alvo:** ESP32-C3 Super Mini (Wi-Fi onboard)

## 1. Problema

O épico 5 entrega a rede (AP/STA, mDNS, `GET /api/status`), mas o app ainda não tem como **comandar** a máquina nem **ler** leituras em tempo real. Sem uma API definida, o app React + Capacitor não tem contrato para: ajustar setpoint, editar PID, criar/rodar perfis de extração, desenhar gráficos ao vivo e salvar config. Este épico define e implementa o protocolo de comunicação completo entre ESP32 e app.

## 2. Objetivos

1. Definir contrato estável de API (REST + WebSocket) consumível pelo app Capacitor.
2. REST para comandos: setpoint de temperatura, parâmetros PID, start/stop de extração, perfis de extração, config persistida em NVS.
3. WebSocket para streaming de leituras em tempo real (temp/pressão/cronômetro a cada X ms) durante a extração.
4. Persistir config (setpoints, PID, perfis) em NVS — migração do `#define` fixo do MVP.
5. Manter o loop de controle (5 ms) intacto: rede nunca bloqueia o PID.

**Não-objetivos (deste épico):** app Android em si (docs próprias), balança, sensor de pressão físico (épico 7+), autenticação além de rede local.

## 3. Contexto / Arquitetura Atual

- `ARCHITECTURE.md` §"Comunicação ESP32 ↔ App": **WebSocket para streaming** de leituras em tempo real + **REST para comandos** (setpoint, start/stop perfil, salvar config PID). App resolve o ESP32 via mDNS `philco.local` (épico 5).
- `ARCHITECTURE.md` §"Pendências Fase 2": protocolo final (WebSocket vs REST puro vs MQTT) e estrutura de perfis (JSON local vs enviado pelo app) ainda **em aberto** — este SDD decide.
- MVP: setpoints e Kp/Ki/Kd fixos em `#define` (épicos 3–4). Este épico migra para NVS mantendo defaults iguais aos fixos.
- `DisplayModel` (épico 1) é o modelo de dados compartilhado — a API lê/escreve nele, sem duplicar estado.
- Loop de controle roda em 5 ms (épico 1, N2) — orçamento de frame é restrição de design.

## 4. Requisitos

### Funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|--------------------|
| F1 | `GET /api/status` (do épico 5) estendido com setpoints, PID e perfil ativo | JSON completo do estado |
| F2 | `PUT /api/setpoint/temp` ajusta temperatura alvo | valor aplicado ao PID e persistido em NVS |
| F3 | `PUT /api/pid` ajusta Kp/Ki/Kd | valores aplicados e persistidos em NVS |
| F4 | `POST /api/extraction/start` e `/stop` controlam extração | mesmo comportamento do botão físico (épico 4) |
| F5 | CRUD de perfis de extração (`GET/POST/PUT/DELETE /api/profiles`) | perfis persistidos em NVS, perfil ativo selecionável |
| F6 | WebSocket `/ws` faz streaming de leituras (temp, pressão, cronômetro, estado) a cada 100 ms | app recebe frames JSON contínuos durante a extração |
| F7 | WebSocket envia eventos (extração iniciada/parada, erro) | app reage sem polling |
| F8 | Config (setpoints, PID, perfis) sobrevive a reboot | persistida em NVS |

### Não-funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|--------------------|
| N1 | Loop de controle nunca bloqueado por rede | frame de 5 ms preservado; rede roda em task separada |
| N2 | Sem alocação dinâmica no loop | buffers estáticos; JSON montado com `snprintf` |
| N3 | API só acessível na rede local | sem exposição à internet; sem auth além de rede local (documentado) |
| N4 | Contrato versionado | `Accept: application/json` + campo `api` no status |
| N5 | Código documentado em PT-BR | comentários e docs |

## 5. Decisões de Design (ADR)

### D1 — Protocolo: REST (comandos) + WebSocket (streaming)

- **Escolha:** manter o que `ARCHITECTURE.md` define — REST para comandos pontuais, WebSocket para streaming/eventos.
- **Por quê:** REST é simples de debugar/testar (curl) e idempotente para comandos; WebSocket evita polling de 100 ms e dá push de eventos. MQTT foi descartado: exige broker externo, desnecessário para rede local 1:1.
- **Alternativas:** REST puro com polling (mais simples, mas streaming de 100 ms gasta banda e atrasa eventos); MQTT (broker externo, overkill).

### D2 — WebSocket via `WebSocketsServer` (Links2004)

- **Escolha:** lib `Links2004/WebSocketsServer` (padrão no ecossistema Arduino/ESP32, compatível com ESP32-C3).
- **Por quê:** streaming bidirecional com broadcast para múltiplos clientes (app + futura balança), eventos push.
- **Risco:** compatibilidade com C3 (RISC-V) — validar com teste isolado antes de integrar (mesma regra dos épicos anteriores).

### D3 — Streaming em task separada (não no loop)

- **Escolha:** task FreeRTOS dedicada (ex. `xTaskCreatePinnedToCore`) publica leituras a cada 100 ms; o loop de controle (5 ms) só escreve no `DisplayModel` (já é thread-safe por design de épico 1).
- **Por quê:** N1 — rede nunca bloqueia o PID. O loop continua sendo a única fonte de verdade do estado.
- **Risco:** concorrência de leitura no `DisplayModel` — mitigar com `portMUX`/`volatile` ou cópia atômica do snapshot.

### D4 — Perfis de extração persistidos no ESP32 (NVS)

- **Escolha:** perfis armazenados em NVS no ESP32; app faz CRUD via REST.
- **Por quê:** resolve a pendência de `ARCHITECTURE.md` ("JSON local no ESP32 vs enviado pelo app"). Máquina funciona standalone (perfil ativo roda mesmo sem app), e o OLED pode exibir o perfil ativo.
- **Alternativa:** app envia perfil a cada extração (menos NVS, mas máquina fica dependente do app).

### D5 — JSON em buffers estáticos

- **Escolha:** montar JSON com `snprintf` em buffers `char[]` estáticos (lição do `test/wifi_ap` — concatenação `String`+`F()` gerou resposta vazia).
- **Por quê:** N2 — sem alocação dinâmica no loop; resposta determinística.

### D6 — NVS com defaults iguais aos `#define` do MVP

- **Escolha:** ao primeiro boot (sem chave em NVS), gravar os valores fixos atuais do MVP como defaults.
- **Por quê:** migração sem quebrar comportamento calibrado no épico 4; usuário pode resetar para factory.

### D7 — Sem autenticação (rede local)

- **Escolha:** API aberta na rede local, sem senha.
- **Por quê:** rede local doméstica, 1:1 com o app; auth adiciona complexidade sem ganho real neste contexto. Documentado como limitação (N3).
- **Risco:** vizinho na mesma rede pode comandar a máquina — aceito e documentado; mitigação futura: token simples.

### D8 — `ESPAsyncWebServer` (REST + `/ws` na mesma porta 80), no lugar de `WebServer` + Links2004

- **Escolha:** `esp32async/ESPAsyncWebServer` + `esp32async/AsyncTCP`, substituindo D2.
- **Por quê:** o contrato que o app consome é `ws://<host>/ws` — WebSocket na **porta 80, no path `/ws`**. `WebSocketsServer` (Links2004) só serve WebSocket em porta própria (81), o que quebraria o contrato ou exigiria duas portas no app. O servidor assíncrono entrega REST e `/ws` no mesmo listener.
- **Bônus:** o TCP roda na task do AsyncTCP, então nem `handleClient()` existe no `loop()` — N1 (loop de controle nunca bloqueado) sai de graça.
- **Custo:** o handler REST roda fora do loop principal, então quem mexe no `DisplayModel` de lá compete com o loop de 5 ms. Hoje só escreve escalares (`float`/`bool`), que são atômicos no C3; quando o PID entrar (épicos 3-4) isso precisa de um mutex ou de uma fila de comandos.

### D9 — Streaming publicado do `loop()`, não de uma task dedicada

- **Escolha:** `ApiServer::loop()` publica o frame a cada 100 ms (`WS_STREAM_INTERVAL_MS`) direto do loop principal, substituindo a task do D3.
- **Por quê:** `ws.textAll()` só enfileira — a transmissão real já é assíncrona. Uma task extra só acrescentaria concorrência de leitura sobre o `DisplayModel` sem ganho.
- **Guarda:** se não há cliente conectado (`ws_.count() == 0`), nem monta o frame.

### D10 — `ArduinoJson` na borda, `snprintf` no caminho quente

- **Escolha:** `ArduinoJson` para *parsear* corpos de requisição e manipular o array de perfis; `snprintf` em buffer de pilha para o JSON de status e para o frame de 100 ms.
- **Por quê:** N2 vale onde a frequência importa (o frame de streaming). Parsear JSON de comando à mão seria frágil, e comandos são eventos raros.

### D11 — Rotas extras não previstas no contrato original

- `GET /api/wifi/scan` — lista as redes visíveis para a tela de provisionamento do app (SSID, RSSI, se é protegida).
- `POST /api/wifi/forget` — apaga a credencial e volta ao modo AP.
- `POST /api/factory-reset` — limpa a NVS inteira.
- `PUT /api/setpoint/pressure` — simetria com o setpoint de temperatura.
- `PUT /api/led` — liga/desliga o LED de iluminação (mesmo estado do botão direito na Tela 1). Não é persistido: liga no boot.
- O status ganhou `api` (versão do contrato, N4), `led` (LED de iluminação), `ip` e `heap` (diagnóstico).
- **CORS:** a WebView do app roda em `http://localhost`, então toda chamada à máquina é cross-origin. O servidor responde `Access-Control-Allow-Origin: *` e trata o preflight `OPTIONS`.

## 6. Estrutura de Código

```
src/
  net/
    WifiProvisioner.h/.cpp   # épico 5
    ApiServer.h/.cpp         # épico 5 — WebServer + rotas REST
    WsServer.h/.cpp          # novo — WebSocketsServer + streaming task
    ApiHandlers.h/.cpp       # novo — handlers REST (setpoint, PID, perfis, extração)
    JsonUtils.h/.cpp         # novo — montagem/parse de JSON em buffers estáticos
  config/
    NvsConfig.h/.cpp         # novo — persistência de setpoints/PID/perfis em NVS
  model/
    DisplayModel.h           # existente — fonte de verdade do estado
  main.cpp                   # integra WsServer + NvsConfig
```

### Contrato REST (resumo)

| Método | Rota | Corpo | Resposta |
|--------|------|-------|----------|
| GET | `/api/status` | — | JSON completo (temp, pressão, setpoints, PID, perfil ativo, LED, uptime, modo wifi) |
| PUT | `/api/setpoint/temp` | `{"temp": 92.5}` | 200 + novo estado |
| PUT | `/api/led` | `{"on": true}` | 200 + novo estado |
| PUT | `/api/pid` | `{"kp":..,"ki":..,"kd":..}` | 200 + novo estado |
| POST | `/api/extraction/start` | — | 200 + estado |
| POST | `/api/extraction/stop` | — | 200 + estado |
| GET | `/api/profiles` | — | lista de perfis |
| POST | `/api/profiles` | perfil JSON | 201 + perfil criado |
| PUT | `/api/profiles/{id}` | perfil JSON | 200 + perfil atualizado |
| DELETE | `/api/profiles/{id}` | — | 204 |
| PUT | `/api/profiles/active` | `{"id":..}` | 200 + perfil ativo |

#### Schema de perfil (Fase 1 — sem controle de pressão)

```json
{
  "id": "p3",
  "name": "Espresso Padrao",
  "description": "opcional",
  "temperature_c": 92.0,
  "steps": [
    { "seconds": 3,  "pump": true  },
    { "seconds": 5,  "pump": false },
    { "seconds": 25, "pump": true  }
  ]
}
```

- `temperature_c`: ao dar `POST /api/extraction/start` com este perfil ativo, vira o setpoint (persistido). A máquina entra em `preheating` (bomba desligada) até estabilizar na tolerância (±2 °C por 3 s, timeout 180 s) e só então roda os passos.
- `steps`: sequência liga/desliga do relé da bomba, cada passo com duração em segundos. Ao fim do último passo a bomba desliga e o cronômetro para. `POST /api/extraction/stop` cancela em qualquer fase.
- Sem perfil ativo (ou perfil sem `steps` válidos), `start` mantém o comportamento manual: bomba ligada direto.

### Contrato WebSocket (`/ws`)

- **Server → client (streaming, 100 ms):** `{"t":<ms>,"temp":92.3,"press":8.7,"timer":23.4,"state":"extracting","profile":"espresso"}`
- **`state`:** `idle` | `heating` | `preheating` (aquecendo p/ extração de perfil) | `extracting` | `error`
- **Server → client (eventos):** `{"event":"extraction_started"}` / `{"event":"extraction_stopped"}` / `{"event":"error","msg":"..."}`
- **Client → server:** `{"cmd":"ping"}` → `{"event":"pong"}` (keepalive)

### Fluxo de boot

```
setup()
  ... (MVP + wifiProvisioner + apiServer do épico 5)
  nvsConfig.begin()          # carrega defaults do MVP se NVS vazio
  wsServer.begin()           # /ws + task de streaming
loop()
  ... (MVP: botão, model, PID)
  apiServer.handleClient()   # REST (não bloqueia)
  wsServer.loop()            # processa frames recebidos (não bloqueia)
```

## 7. Testes

| Tipo | Escopo | Critério | Status |
|------|--------|----------|--------|
| Build | `pio run` | sem erros, sem warnings novos | Pendente |
| Unidade | `JsonUtils` (montar/parse) | JSON válido, buffers sem overflow | Pendente |
| Unidade | `NvsConfig` (round-trip) | grava/lê/limpa NVS corretamente | Pendente |
| Hardware | `PUT /api/setpoint/temp` | PID usa novo setpoint; persiste após reboot | Pendente |
| Hardware | `PUT /api/pid` | ganhos aplicados; persistem após reboot | Pendente |
| Hardware | start/stop via REST | mesmo comportamento do botão físico (épico 4) | Pendente |
| Hardware | CRUD de perfis | perfis sobrevivem a reboot; perfil ativo roda | Pendente |
| Hardware | WebSocket streaming | frames a cada 100 ms durante extração | Pendente |
| Hardware | WebSocket eventos | start/stop geram eventos push | Pendente |
| Regressão | firmware MVP + API ativa | UI/PID/navegação sem regressão; frame 5 ms | Pendente |

## 8. Riscos e Mitigações

| Risco | Impacto | Mitigação | Status |
|-------|---------|-----------|--------|
| `WebSocketsServer` incompatível com C3 (RISC-V) | streaming não funciona | teste isolado cedo (D2); fallback: polling REST | Pendente validação |
| Concorrência no `DisplayModel` (loop vs task de streaming) | leituras corrompidas | D3 — snapshot atômico/`portMUX` | Mitigado por design |
| Streaming de 100 ms consome CPU/RAM | frame estourado ou heap baixo | D3 — task dedicada; medir no teste de regressão | Mitigado por design |
| NVS corrompido (escrita durante power loss) | config perdida | gravar com checksum; factory reset via API | Mitigado por design |
| API aberta na rede local | vizinho comanda a máquina | D7 — aceito/documentado; token futuro | Aceito |

## 9. Plano de Implementação

1. Teste isolado do `WebSocketsServer` no C3 (echo + broadcast) — validar compatibilidade.
2. `NvsConfig` (setpoints, PID, perfis; defaults do MVP; factory reset).
3. `JsonUtils` (montar/parse em buffers estáticos).
4. `ApiHandlers` (rotas REST do contrato).
5. `WsServer` (streaming 100 ms em task + eventos).
6. Integrar ao `main.cpp` sem quebrar o loop MVP.
7. Testes de hardware: REST, NVS round-trip, WebSocket streaming/eventos.
8. Teste de regressão do firmware MVP com API ativa.
9. Documentar resultados e valores finais neste SDD.

## 10. Critérios de Aceite (resumo)

- [ ] `pio run` limpo
- [ ] `PUT /api/setpoint/temp` e `PUT /api/pid` aplicam e persistem em NVS
- [ ] start/stop de extração via REST funciona como o botão físico
- [ ] CRUD de perfis funciona e sobrevive a reboot
- [ ] WebSocket streama leituras a cada 100 ms durante a extração
- [ ] Eventos push (start/stop/erro) chegam no app
- [ ] Firmware MVP sem regressão com API ativa (frame 5 ms)

## 11. Deferred (fora deste épico)

- App React + Capacitor (docs próprias)
- Sensor de pressão físico (épico 7+)
- Balança
- Autenticação/token na API (mitigação futura de D7)