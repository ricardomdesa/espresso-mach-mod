# SDD-005 — Épico 5: Wi-Fi + Provisionamento (AP/STA)

- **Status:** Pendente (não implementado)
- **Épico:** 5 (Fase 2 — primeiro épico da Fase 2)
- **Pré-requisitos:** Épico 4 concluído (MVP offline); teste de bancada do modo AP validado (`test/wifi_ap`)
- **Hardware alvo:** ESP32-C3 Super Mini (Wi-Fi 802.11 b/g/n onboard, 2.4 GHz)

## 1. Problema

O MVP (épicos 1-4) é offline: setpoints e ganhos fixos em `#define`, sem rede. A Fase 2 começa aqui — o ESP32 precisa se conectar à rede Wi-Fi do usuário e ser descoberto pelo app. Sem isso, nada de app, REST/WebSocket, perfis de extração ou config editável via NVS. Este épico entrega a fundação de rede: provisionamento no padrão IoT (AP → recebe credencial → STA), persistência da credencial em NVS, mDNS (`philco.local`) e um endpoint REST mínimo para validar a conexão de ponta a ponta.

## 2. Objetivos

1. Provisionamento Wi-Fi no padrão IoT: primeiro boot em AP, recebe credencial, salva em NVS, conecta como STA.
2. Fallback automático para AP se perder a conexão STA (troca de roteador, senha errada).
3. mDNS: dispositivo acessível por `philco.local` (sem depender de IP fixo do DHCP).
4. Endpoint REST mínimo (`GET /api/status`) para validar conectividade de ponta a ponta com o app.
5. Não quebrar o firmware MVP: Wi-Fi é opcional e não bloqueia o loop de controle.

**Não-objetivos (deste épico):** API REST/WebSocket completa (SDD-006), NVS de config de setpoints/PID/perfis, app Android (docs próprias), balança.

## 3. Contexto / Arquitetura Atual

- `ARCHITECTURE.md` §"Provisionamento Wi-Fi (padrão IoT: AP + STA)" já define o fluxo: AP `Philco-Setup` → portal cativo → POST de credencial → NVS → STA → mDNS `philco.local` → fallback AP. Recomenda lib **WiFiManager** (tzapu) + `ESPmDNS.h`.
- Teste de bancada `test/wifi_ap` validou: AP `Philco-Setup` sobe, celular conecta sem senha, `GET /` chega no servidor HTTP (rádio + TCP funcionando). **Pendência:** a página HTTP ainda não renderiza no browser (resposta vazia) — precisa ser resolvida antes de integrar o portal cativo, ou o provisionamento pelo app pode falhar.
- Firmware MVP roda em `loop()` com orçamento de frame de 5 ms (épico 1, N2) — Wi-Fi não pode bloquear isso.
- ESP32-C3 tem Wi-Fi onboard; não usa pinos extras (sem mudança em `pinos.h`).

## 4. Requisitos

### Funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|--------------------|
| F1 | Primeiro boot (sem credencial em NVS) sobe em AP `Philco-Setup` | AP visível, IP `192.168.4.1` |
| F2 | Credencial recebida via HTTP POST é salva em NVS | após reboot, conecta como STA sem re-provisionar |
| F3 | Com credencial válida, conecta como STA na rede do usuário | IP obtido via DHCP, log no Serial |
| F4 | mDNS publica `philco.local` | `ping philco.local` resolve na mesma rede |
| F5 | Perda de conexão STA (senha errada/roteador fora) volta para AP | AP reaparece para reconfiguração |
| F6 | `GET /api/status` responde JSON com estado básico | 200 + JSON (temp, pressão, uptime, modo wifi) |
| F7 | Wi-Fi não bloqueia o loop de controle | orçamento de frame (5 ms, épico 1) preservado |

### Não-funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|--------------------|
| N1 | Sem alocação dinâmica no loop | sem `new`/`malloc` em runtime |
| N2 | Credencial não fica hardcoded no firmware | só em NVS, nunca logada |
| N3 | Código documentado em PT-BR | comentários e docs |
| N4 | Wi-Fi opcional: sem rede, firmware MVP continua funcionando | boot sem credencial não trava nem bloqueia o loop |

## 5. Decisões de Design (ADR)

### D1 — Provisionamento: `tzapu/WiFiManager`

- **Escolha:** lib `tzapu/WiFiManager` via `lib_deps`.
- **Por quê:** resolve portal cativo, salvar credencial em NVS e fallback AP de uma vez — exatamente o fluxo definido em `ARCHITECTURE.md`, sem reinventar.
- **Alternativas:** implementar AP+STA manual (mais controle, mas muito mais código e casos de borda).
- **Risco:** compatibilidade com ESP32-C3 (RISC-V) — validar cedo com teste isolado antes de integrar (mesma regra de hardware dos épicos anteriores).

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

### D5 — Fallback AP automático

- **Escolha:** usar o fallback nativo do WiFiManager (se STA falha, volta pro AP), com timeout de conexão STA configurado.
- **Por quê:** é o comportamento definido em `ARCHITECTURE.md` ("se perder STA, ESP32 volta sozinho pro modo AP pra reconfiguração") e já vem pronto na lib.

### D6 — Resolver pendência da página HTTP antes de integrar portal

- **Achado (teste de bancada):** `GET /` chega no servidor mas o browser mostra tela branca (resposta vazia). Suspeita: concatenação `String` + `F()` no handler.
- **Fix:** resposta estática em `PROGMEM` + `snprintf_P` (já aplicado no `test/wifi_ap`). Validar no hardware antes de integrar o portal cativo do WiFiManager, senão o provisionamento pelo app pode falhar.

## 6. Estrutura de Código

```
include/
  pinos.h                    # sem mudança (Wi-Fi é onboard)
  rede.h                     # novo — AP_SSID, hostname mDNS, timeouts
src/
  net/
    WifiProvisioner.h        # novo — wrapper WiFiManager (AP/STA, NVS, mDNS)
    WifiProvisioner.cpp
    ApiServer.h              # novo — WebServer + rotas REST
    ApiServer.cpp
  main.cpp                   # integra WifiProvisioner + ApiServer ao loop
```

### Fluxo do boot

```
setup()
  ... (MVP: display, sensores, botão — como já é)
  wifiProvisioner.begin()    # AP se sem credencial, STA se tiver; mDNS
  apiServer.begin()          # rotas REST (GET /api/status)
loop()
  ... (MVP: botão, model, PID — como já é)
  apiServer.handleClient()   # rápido, não bloqueia o loop
```

### Composição em `main.cpp`

```cpp
WifiProvisioner wifiProvisioner(AP_SSID, MDNS_HOSTNAME);
ApiServer apiServer(model);   // lê DisplayModel p/ montar o JSON de status
```

## 7. Testes

| Tipo | Escopo | Critério | Status |
|------|--------|----------|--------|
| Build | `pio run` | sem erros, sem warnings novos | Pendente |
| Hardware | primeiro boot sem credencial | AP `Philco-Setup` visível, IP `192.168.4.1` | Pendente |
| Provisionamento | enviar credencial via POST | salva em NVS, conecta como STA | Pendente |
| Persistência | reboot após provisionar | conecta STA sem re-provisionar | Pendente |
| mDNS | `ping philco.local` | resolve na mesma rede | Pendente |
| Fallback | senha errada / roteador fora | AP reaparece para reconfiguração | Pendente |
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

1. Teste isolado do WiFiManager no C3 (AP + portal cativo + salvar NVS) — validar compatibilidade antes de integrar.
2. Resolver pendência da página HTTP do `test/wifi_ap` (D6) se afetar o portal cativo.
3. `rede.h` com consts (AP_SSID, hostname mDNS, timeouts).
4. `WifiProvisioner` (wrapper WiFiManager + mDNS).
5. `ApiServer` (WebServer + `GET /api/status` com JSON em buffer estático).
6. Integrar ao `main.cpp` sem quebrar o loop MVP.
7. Testes de hardware: provisionamento, persistência, fallback, mDNS, API.
8. Teste de regressão do firmware MVP com Wi-Fi ativo.
9. Documentar resultados e valores finais neste SDD.

## 10. Critérios de Aceite (resumo)

- [ ] `pio run` limpo
- [ ] Primeiro boot sobe AP `Philco-Setup`
- [ ] Credencial salva em NVS e conecta STA após reboot
- [ ] `philco.local` resolve via mDNS
- [ ] Fallback AP funciona (senha errada/roteador fora)
- [ ] `GET /api/status` responde JSON válido
- [ ] Firmware MVP sem regressão com Wi-Fi ativo

## 11. Deferred (fora deste épico)

- API REST/WebSocket completa (comandos, streaming de leituras) — SDD-006
- NVS de config (setpoints, PID, perfis de extração)
- App Android (docs próprias)
- Balança