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
| 2 | **Sensores: temperatura e pressão** | MAX6675 (SPI, termopar K), transdutor de pressão 0–150 PSI via ADC + divisor de tensão, calibração de offset/ganho, publicação no modelo de dados. | 1 (usa o modelo de dados do display) | Pendente |
| 3 | **Controle: PID temperatura + bomba** | PID de temperatura com SSR (PWM baixa frequência), dimmer AC zero-cross p/ bomba Ulka, setpoints fixos no firmware (MVP). | 2 | Pendente |
| 4 | **Integração MVP + calibração** | Loop de controle completo, extração (start/stop atrelado à bomba, cronômetro real), ajuste fino PID no hardware, teste de extração real, documentação de calibração. | 3 | Pendente |
| 5+ | **Fase 2 (futuro, sem SDD)** | Wi-Fi + WiFiManager, mDNS (`philco.local`), REST/WebSocket, app React + Capacitor, NVS p/ persistir config, balança. | 4 | Futuro |

## Decisões entre épicos

- Modelo de dados compartilhado (`DisplayModel`) é criado no épico 1 e consumido por todos os demais — contrato estável para evitar retrabalho.
- Setpoints e ganhos PID fixos em `#define`/consts no MVP (épicos 3–4). Migração para NVS na Fase 2.
