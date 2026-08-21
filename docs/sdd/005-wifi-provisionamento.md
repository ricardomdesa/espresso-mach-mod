# SDD-005 — Épico 5: Wi-Fi + Provisionamento (AP/STA)

- **Status:** Implementado (build + boot validados; testes de hardware de ponta a ponta pendentes)
- **Épico:** 5 (Fase 2 — primeiro épico da Fase 2)
- **Pré-requisitos:** Épico 4 concluído (MVP offline); teste de bancada do modo AP validado (`test/wifi_ap`)
- **Hardware alvo:** ESP32-C3 Super Mini (Wi-Fi 802.11 b/g/n onboard, 2.4 GHz)

## 1. Problema

O MVP (épicos 1-4) é offline: setpoints e ganhos fixos em `#define`, sem rede. A Fase 2 começa aqui — o ESP32 precisa se conectar à rede Wi-Fi do usuário e ser descoberto pelo app. Sem isso, nada de app, REST/WebSocket, perfis de extração ou config editável via NVS. Este épico entrega a fundação de rede: provisionamento no padrão IoT (AP → recebe credencial → STA), persistência da credencial em NVS, mDNS (`philco.local`) e um endpoint REST mínimo para validar a conexão de ponta a ponta.

## 2. Objetivos

1. Provisionamento Wi-Fi no padrão IoT: modo de configuração **sob demanda** (hold de 10 s do botão), recebe credencial, salva em NVS, conecta como STA.
2. Sem AP automático: o AP nunca sobe sozinho (nem no boot, nem por perda de STA) — segurança contra reprovisionamento por terceiros.
3. mDNS: dispositivo acessível por `philco.local` (sem depender de IP fixo do DHCP).
4. Endpoint REST mínimo (`GET /api/status`) para validar conectividade de ponta a ponta com o app.
5. Não quebrar o firmware MVP: Wi-Fi é opcional e não bloqueia o loop de controle.

**Não-objetivos (deste épico):** API REST/WebSocket completa (SDD-006), NVS de config de setpoints/PID/perfis, app Android (docs próprias), balança.

## 3. Contexto / Arquitetura Atual

- `ARCHITECTURE.md` §"Provisionamento Wi-Fi (padrão IoT: AP + STA)" define o fluxo atual: AP `Philco-Setup` **sob demanda** (hold de 10 s do botão) → POST de credencial → NVS → STA → mDNS `philco.local`. Sem fallback automático de AP (segurança).
- Teste de bancada `test/wifi_ap` validou: AP `Philco-Setup` sobe, celular conecta sem senha, `GET /` chega no servidor HTTP (rádio + TCP funcionando). **Pendência:** a página HTTP ainda não renderiza no browser (resposta vazia) — precisa ser resolvida antes de integrar o portal cativo, ou o provisionamento pelo app pode falhar.
- Firmware MVP roda em `loop()` com orçamento de frame de 5 ms (épico 1, N2) — Wi-Fi não pode bloquear isso.
- ESP32-C3 tem Wi-Fi onboard; não usa pinos extras (sem mudança em `pinos.h`).

## 4. Requisitos

### Funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|--------------------|
| F1 | Sem credencial salva, boot fica offline (sem AP) | firmware MVP funciona; nenhum SSID visível no ar |
| F2 | Credencial recebida via HTTP POST é salva em NVS | após reboot, conecta como STA sem re-provisionar |
| F3 | Com credencial válida, conecta como STA na rede do usuário | IP obtido via DHCP, log no Serial |
| F4 | mDNS publica `philco.local` | `ping philco.local` resolve na mesma rede |
| F5 | Hold de 10 s do botão na tela inicial abre o AP | AP `Philco-Setup` aparece; soltar antes cancela; barra de progresso no OLED; tela muda para pareamento (SSID/IP) |
| F6 | Perda de conexão STA (senha errada/roteador fora) NÃO reabre o AP | máquina fica offline; reconfigurar exige novo hold |
| F7 | `GET /api/status` responde JSON com estado básico | 200 + JSON (temp, pressão, uptime, modo wifi) |
| F8 | Wi-Fi não bloqueia o loop de controle | orçamento de frame (5 ms, épico 1) preservado |

### Não-funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|--------------------|
| N1 | Sem alocação dinâmica no loop | sem `new`/`malloc` em runtime |
| N2 | Credencial não fica hardcoded no firmware | só em NVS, nunca logada |
| N3 | Código documentado em PT-BR | comentários e docs |
| N4 | Wi-Fi opcional: sem rede, firmware MVP continua funcionando | boot sem credencial não trava nem bloqueia o loop |

## 5. Decisões de Design (ADR)

### D1 — Provisionamento: `tzapu/WiFiManager` (~~superada por D7~~)

- **Escolha (original):** lib `tzapu/WiFiManager` via `lib_deps`.
- **Por quê (original):** resolve portal cativo, salvar credencial em NVS e fallback AP de uma vez.
- **Status:** **substituída** — o provisionamento é implementado à mão em `WifiProvisioner` (D7), sem portal cativo e sem fallback automático (D5). Mantida como registro histórico da decisão inicial.

### D2 — mDNS via `ESPmDNS`

- **Escolha:** `MDNS.begin("philco")` → hostname `philco.local`.
- **Por quê:** o app resolve o nome em vez de guardar IP fixo (DHCP pode mudar o IP); é o mecanismo de descoberta definido em `ARCHITECTURE.md`.

### D3 — API mínima com `WebServer` (Arduino core)

- **Escolha:** `WebServer` (já usado no `test/wifi_ap`) com rota `GET /api/status` retornando JSON.
- **Por quê:** valida a conexão de ponta a ponta com o app sem esperar o SDD-006 (API completa). JSON montado com `snprintf` em buffer estático (sem `String`/`F()` concatenado — lição do teste de bancada).
- **Alternativas:** `ESPAsyncWebServer` (mais robusto, mas dependência extra e API diferente).

### D4 — Wi-Fi em modo não-bloqueante

- **Escolha:** provisionamento roda no `setup()`; no `loop()` só `apiServer.handleClient()` (rápido, não bloqueia).
- **Por quê:** preserva o orçamento de frame de 5 ms do MVP (épico 1, N2). O loop de controle (PID/SSR) nunca espera rede.

### D5 — Sem fallback automático de AP (segurança)

- **Escolha:** perda de STA NÃO reabre o AP. A máquina fica offline; o modo de configuração só entra via hold de 10 s do botão (F5).
- **Por quê:** o AP `Philco-Setup` é aberto (sem senha). Se ele subisse sozinho (boot sem credencial, perda de STA), qualquer pessoa com um celular na vizinhança poderia reprovisionar a máquina para a própria rede. Exigir hold físico de 10 s com acesso à máquina elimina esse vetor.
- **Consequência:** o estado `offline` existe (nem AP, nem STA) e o firmware MVP segue funcionando sem rede.
- **Como:** `WifiProvisioner::requestAp()` seta uma flag one-shot na NVS (`force_ap`) e reinicia; o boot lê e limpa a flag e sobe o AP direto — mesmo com credencial salva. Reiniciar é previsível e evita re-conectar na STA antes do AP.

### D6 — Resolver pendência da página HTTP antes de integrar portal

- **Achado (teste de bancada):** `GET /` chega no servidor mas o browser mostra tela branca (resposta vazia). Suspeita: concatenação `String` + `F()` no handler.
- **Fix:** resposta estática em `PROGMEM` + `snprintf_P` (já aplicado no `test/wifi_ap`). Validar no hardware antes de integrar o portal cativo do WiFiManager, senão o provisionamento pelo app pode falhar.

### D7 — Provisionamento sem WiFiManager: AP efêmero + `POST /api/wifi/provision`

- **Escolha:** implementação própria em `WifiProvisioner` (AP/STA + NVS + mDNS), substituindo D1 (`tzapu/WiFiManager`).
- **Por quê:** o portal cativo do WiFiManager não é usado — quem coleta SSID/senha é o **app**, na tela de provisionamento, via `POST /api/wifi/provision`. Manter o WiFiManager traria uma dependência grande (e de compatibilidade duvidosa no C3) para um fluxo que não usamos.
- **Regra de produto (definida pelo usuário):** o AP `Philco-Setup` só entra no ar com **hold de 10 s** do botão na tela inicial (D5). Assim que a credencial chega, o AP cai e a máquina entra na rede do usuário como STA.
- **Consequência:** o AP sobe em `WIFI_AP_STA` (e não `WIFI_AP`), porque a interface STA precisa estar ativa para `GET /api/wifi/scan` varrer as redes do usuário.
- **Aplicação da credencial via reboot:** após salvar em NVS, o firmware responde 200 e reinicia ~800 ms depois. Reiniciar derruba AP, servidor e sockets de uma vez — mais previsível que reconfigurar o rádio com conexões abertas.

### D8 — Tabela de partições `huge_app.csv`

- **Escolha:** `board_build.partitions = huge_app.csv`.
- **Por quê:** com Wi-Fi + servidor assíncrono o binário passa de 1,1 MB e a tabela padrão (dois slots de OTA) deixa só 1,3 MB — 88,6% de ocupação, sem folga para os épicos 2-4. Com `huge_app` são 3 MB (36,9%).
- **Custo:** sem OTA. Aceito por enquanto; a máquina é gravada por USB.

## 6. Estrutura de Código

```
include/
  pinos.h                    # sem mudança (Wi-Fi é onboard)
  rede.h                     # AP_SSID/AP_IP/AP_PASSWORD, MDNS_HOSTNAME, timeouts
src/
  net/
    WifiProvisioner.h/.cpp   # AP/STA manual + NVS + mDNS + hold p/ AP (requestAp)
    ApiServer.h/.cpp         # ESPAsyncWebServer + rotas REST + WebSocket
  config/
    NvsConfig.h/.cpp         # credencial Wi-Fi, setpoints/PID, perfis, flag force_ap
  ui/
    Screens.h/.cpp           # drawScreenReadings/Timer/Pairing + ícone de rede
  main.cpp                   # integra tudo; handleSetupHold (hold 10 s) no loop
```

### Fluxo do boot

```
setup()
  ... (display, sensores, botão)
  nvs.begin(); nvs.loadControl(model)
  wifi.begin()               # se force_ap (NVS) → AP direto; senão STA/offline
  api.begin()                # rotas REST + WebSocket
loop()
  button/model update → status de rede → [se AP: tela de pairing]
  click/long-press/hold → screenManager.draw → wifi.loop()/api.loop()
```

### Composição em `main.cpp`

```cpp
WifiProvisioner wifi(nvs);      // AP/STA + mDNS
ApiServer api(model, nvs, wifi); // REST + WebSocket (porta 80)
// Tela de pareamento desenhada quando wifi.mode() == WifiMode::Ap.
```

## 7. Testes

| Tipo | Escopo | Critério | Status |
|------|--------|----------|--------|
| Build | `pio run` | sem erros, sem warnings novos | Feito |
| Hardware | boot sem credencial | sem AP no ar; firmware MVP funciona; `GET /api/status` → `wifiMode: "offline"` | Pendente |
| Hold | segurar botão 10 s na Tela 1 | barra de progresso enche; soltar antes cancela; AP `Philco-Setup` aparece; tela muda para pareamento (SSID/IP) | Pendente |
| Provisionamento | enviar credencial via POST | salva em NVS, conecta como STA | Pendente |
| Persistência | reboot após provisionar | conecta STA sem re-provisionar | Pendente |
| mDNS | `ping philco.local` | resolve na mesma rede | Pendente |
| Sem fallback | senha errada / roteador fora | máquina fica offline; AP NÃO reaparece sozinho | Pendente |
| Hold em STA | hold com credencial salva | reinicia, boot abre AP (flag one-shot) | Pendente |
| API | `GET /api/status` | 200 + JSON válido | Pendente |
| Regressão | firmware MVP com Wi-Fi ativo | UI/PID/navegação sem regressão | Pendente |

## 8. Riscos e Mitigações

| Risco | Impacto | Mitigação | Status |
|-------|---------|-----------|--------|
| WiFiManager incompatível com ESP32-C3 (RISC-V) | provisionamento não funciona | teste isolado cedo (D1); fallback: implementação manual AP/STA | Pendente validação |
| Página HTTP do teste não renderiza (pendência `test/wifi_ap`) | portal cativo pode falhar igual | D6 — resposta estática PROGMEM; validar antes de integrar | Pendente validação |
| Wi-Fi consome RAM/CPU afetando o loop | UI lenta ou frame estourado | D4 — não-bloqueante; medir heap/frame no teste de regressão | Mitigado por design |
| Credencial vazada em log | segurança da rede do usuário | N2 — nunca logar senha; WiFiManager já trata | Mitigado por design |

## 9. Plano de Implementação

1. ~~Teste isolado do WiFiManager no C3~~ (D1 superada — provisionamento manual, D7).
2. ~~Resolver pendência da página HTTP do `test/wifi_ap`~~ (portal cativo não é usado).
3. `rede.h` com consts (AP_SSID, hostname mDNS, timeouts).
4. `WifiProvisioner` (AP/STA manual + NVS + mDNS + hold para AP).
5. `ApiServer` (WebServer + `GET /api/status` com JSON em buffer estático).
6. Integrar ao `main.cpp` sem quebrar o loop MVP.
7. Testes de hardware: hold, provisionamento, persistência, mDNS, sem-fallback, API.
8. Teste de regressão do firmware MVP com Wi-Fi ativo.
9. Documentar resultados e valores finais neste SDD.

## 10. Critérios de Aceite (resumo)

- [x] `pio run` limpo
- [ ] Boot sem credencial NÃO sobe AP (fica offline)
- [ ] Hold de 10 s abre o AP; soltar antes cancela
- [ ] Credencial salva em NVS e conecta STA após reboot
- [ ] `philco.local` resolve via mDNS
- [ ] Perda de STA NÃO reabre o AP sozinho
- [ ] `GET /api/status` responde JSON válido (com `wifiMode`)
- [ ] Firmware MVP sem regressão com Wi-Fi ativo

## 11. Deferred (fora deste épico)

- API REST/WebSocket completa (comandos, streaming de leituras) — SDD-006
- NVS de config (setpoints, PID, perfis de extração)
- App Android (docs próprias)
- Balança