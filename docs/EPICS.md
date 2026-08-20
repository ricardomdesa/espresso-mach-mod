# Philco Espresso Mod — Épicos

Roadmap de implementação. Cada épico possui um SDD em `docs/sdd/NNN-*.md` que detalha requisitos, arquitetura, decisões, critérios de aceite e plano de implementação. Um épico só é implementado com o SDD aprovado.

## Regras

- **Escopo MVP (Fase 1):** offline, sem Wi-Fi/app. Tudo de rede (Wi-Fi, WebSocket, REST, app Capacitor, balança) é Fase 2 e **não** entra nos épicos 1–4.
- Cada SDD segue o template padrão (ver `docs/sdd/001-oled-display.md` como referência).
- Hardware é validado no início do épico que o usa (scanner I2C, testes de leitura) antes de fixar pinagem no firmware.

## Épicos

| # | Épico | Escopo | Depende de | Status |
|---|-------|--------|-----------|--------|
| 1 | **Display OLED + navegação** | Scaffold do projeto PlatformIO, driver SSD1306 (I2C), gerenciador de telas, botão de navegação, cronômetro de extração. Valores de sensores simulados (fakes) para validação visual. | — | SDD pronto (`001-oled-display.md`) |
| 2 | **Sensor: temperatura** | MAX6675 (SPI, termopar K), calibração de offset/ganho, publicação no modelo de dados. | 1 (usa o modelo de dados do display) | SDD pronto (`002-sensor-temperatura.md`) |
| 3 | **Controle: PID temperatura + bomba** | PID de temperatura com SSR (3-32VDC, PWM baixa frequência), dimmer AC zero-cross p/ bomba Ulka, setpoints fixos no firmware (MVP). | 2 | SDD pronto (`003-pid-temperatura-bomba.md`) |
| 4 | **Integração MVP + calibração** | Loop de controle completo, extração (start/stop atrelado à bomba, cronômetro real), ajuste fino PID no hardware, teste de extração real, documentação de calibração. | 3 | SDD pronto (`004-integracao-calibracao.md`) |
| 5 | **Wi-Fi + provisionamento** | Wi-Fi AP/STA próprio (sem WiFiManager), AP `Philco-Setup` ativo só até receber a credencial, credencial em NVS, mDNS (`philco.local`), fallback AP, `GET /api/status`. | 4 | Implementado (`005-wifi-provisionamento.md`) |
| 6 | **API REST/WebSocket** | Contrato de comunicação ESP32↔app: REST p/ comandos (setpoint, PID, start/stop extração, CRUD de perfis), WebSocket `/ws` p/ streaming de leituras (100 ms) + eventos, persistência em NVS (setpoints, PID, perfis). | 5 | Implementado (`006-api-rest-websocket.md`) |
| 7 | **App Android (React + Capacitor)** | Descoberta mDNS, dashboard WebSocket, ajuste PID/temp, CRUD perfis, gráficos ao vivo, histórico local. | 6 | SDD pronto (`007-app-android.md`) |

## Decisões entre épicos

- Modelo de dados compartilhado (`DisplayModel`) é criado no épico 1 e consumido por todos os demais — contrato estável para evitar retrabalho.
- Setpoints e ganhos PID fixos em `#define`/consts no MVP (épicos 3–4). Migração para NVS na Fase 2.
- **Ordem de execução real:** os épicos 5 e 6 foram implementados antes dos 2–4, para destravar o app. Com isso, temperatura e pressão ainda vêm de `SensorFake` e o "estado" da máquina (`idle`/`heating`/`extracting`) é derivado do cronômetro e do erro de temperatura — não de um PID real. Os épicos 2–4 substituem os fakes sem mudar o contrato da API.
