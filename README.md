# ☕ ESPresso

**Cafeteira Philco Espresso turbinada com um ESP32-C3:** controle PID de
temperatura da caldeira, modo vaporização, provisionamento Wi-Fi, API
REST/WebSocket e um app mobile (React + Capacitor) para configurar tudo.
Acompanha um **simulador em Go** que emula o firmware inteiro — dá pra
desenvolver o app sem encostar no hardware.

<p>
  <img alt="Firmware" src="https://img.shields.io/badge/firmware-ESP32--C3%20%2F%20PlatformIO-000?logo=platformio">
  <img alt="App" src="https://img.shields.io/badge/app-React%20%2B%20Capacitor-61dafb?logo=react&logoColor=000">
  <img alt="Simulador" src="https://img.shields.io/badge/simulador-Go-00add8?logo=go&logoColor=white">
  <img alt="Licença" src="https://img.shields.io/badge/licença-a%20definir-lightgrey">
</p>

> ⚠️ **Projeto de hobby, mexe com rede elétrica AC.** SSR de 25 A, bomba
> vibratória e resistência de caldeira ligados na tomada. Se você não sabe
> isolar o lado AC do lado DC com segurança, **não reproduza.** Sem garantia
> de nada.

---

## O que dá pra fazer

- **PID de temperatura** na caldeira via SSR (time-proportioning, janela de 1 s),
  com anti-windup, derivada sobre a medição e cadência de 200 ms.
- **Termopar tipo K real** (MAX6675, SPI) com calibração linear de offset/ganho.
- **Modo vaporização:** o PID passa a mirar um alvo de vapor editável
  (80–115 °C) sem gravar na NVS; ao desligar, o setpoint de café volta para 70 °C.
- **Relé "temperatura pronta"** (contato seco, com histerese) para puxar shot
  manualmente, sem depender do app.
- **Perfis de extração** (pré-infusão, rampa, declínio) com CRUD pelo app e
  persistência em NVS.
- **Provisionamento Wi-Fi** no padrão AP + STA — o AP `Philco-Setup` **nunca**
  abre sozinho, só com hold de 5 s no botão. Descoberta por mDNS (`philco.local`).
- **App mobile** (Android/iOS via Capacitor): dashboard ao vivo por WebSocket,
  ajuste de PID/setpoint, gráficos da extração, histórico local offline.
- **Simulador** que espelha byte a byte o contrato REST/WS do firmware, com
  modelo térmico + PID portados do C++, e uma tela web mostrando SSR, bomba e LEDs.

### Failsafes de segurança

| Camada | Ação |
|---|---|
| Teto de sobretemperatura (115 °C) | duty forçado a 0 %, independente do PID |
| Leitura do termopar parada > 10 s | duty forçado a 0 % (sensor aberto/congelado) |
| Modo AP no ar | aquecedor forçado desligado (o scan de Wi-Fi bloqueia o loop) |
| Fusível na linha AC | última camada, contra SSR travado ligado |

---

## Estrutura do repositório

```
.
├── src/ · include/ · platformio.ini   Firmware ESP32-C3 (Arduino / PlatformIO)
├── app/                               App React + TypeScript + Vite + Capacitor
├── simulator/                         Servidor Go que emula o ESP32 (REST + WS + web)
├── docs/                              Arquitetura, épicos, SDDs, calibração do PID
└── pinout2-1500.png                   Diagrama de pinagem
```

O firmware é dividido em módulos: `sensors/` (termopar, calibração, fakes),
`control/` (PID, saída do aquecedor), `net/` (Wi-Fi provisioner, servidor da API),
`config/` (NVS), `input/` (botão), `model/` (modelo de dados compartilhado).

---

## Hardware

| Bloco | Peça |
|---|---|
| MCU | ESP32-C3 Super Mini |
| Temperatura | Termopar tipo K + módulo MAX6675 (SPI) |
| Aquecimento | SSR AC 25 A acionado por driver TIP120, resistência original da caldeira |
| Bomba | Bomba vibratória Ulka original + módulo de relé (liga/desliga) |
| Sinalização | LED de iluminação + LED azul onboard |

### Pinagem (ESP32-C3)

| GPIO | Função |
|---|---|
| `3` | Botão tátil — clique: liga/desliga LED de luz · hold 5 s: sobe o AP de config |
| `20` | LED de iluminação (ativo HIGH) |
| `8` | LED azul onboard — pisca em modo setup (ativo LOW) |
| `5` / `6` / `7` | MAX6675 — SCK / SO(MISO) / CS |
| `10` | Base do driver TIP120 do SSR de aquecimento (ativo HIGH) |
| `0` | Sinal do relé da bomba (módulo active-low) |
| `1` | Sinal do relé "temperatura pronta" (contato seco, active-low) |

Detalhes de cada pino (motivo da escolha, strapping pins, estágio driver do SSR)
estão comentados em [`include/pinos.h`](include/pinos.h). Diagrama completo em
[`pinout2-1500.png`](pinout2-1500.png).

---

## Como rodar

### Firmware

Precisa de [PlatformIO](https://platformio.org/).

```sh
pio run                                    # compila (env: esp32-c3-super-mini)
pio run -t upload && pio device monitor    # grava e abre o monitor serial (115200)
```

Sem credencial de Wi-Fi salva a máquina fica **offline** e o controle de
temperatura funciona standalone. Hold de 5 s no botão sobe o AP `Philco-Setup`
(IP `192.168.4.1`) para o app fazer o provisionamento.

Ambientes extras de bancada: `pio run -e wifi-ap-test`, `pio run -e wifi-sta-test`.

### App

Precisa de Node.js 18+.

```sh
cd app
npm install
npm run dev                # dev server no browser

npm run build              # build de produção
npx cap sync android       # sincroniza com o projeto nativo
npx cap open android       # abre no Android Studio (idem ios)
```

O app acha a máquina por mDNS (`philco.local`) com fallback para varredura de
subnet, ou por endereço manual (`host:porta`). Histórico de extrações fica local
via `@capacitor/preferences`.

### Simulador

Precisa de Go 1.21+ ou Docker.

```sh
cd simulator
docker compose up --build          # http://localhost:8080  (tela web em /)
# ou:
go run .                           # go run . -port 9000 -no-auth
```

No emulador Android, aponte o app para `10.0.2.2:8080` (endereço manual — a
auto-descoberta não alcança o host). Detalhes e todos os endpoints `/sim/*` de
controle da simulação em [`simulator/README.md`](simulator/README.md).

---

## API

`GET /ws` faz o streaming de leituras a cada 100 ms e emite eventos
(`extraction_started`, `extraction_stopped`, `error`). Rotas que mudam estado
exigem o header `X-Auth-Token` (dispensado só no `provision` em modo AP); CORS
liberado, `OPTIONS` responde 204.

| Método | Rota | O quê |
|---|---|---|
| `GET` | `/api/status` | snapshot completo (temp, pressão, setpoints, PID, flags, IP) |
| `PUT` | `/api/setpoint/temp` · `/api/setpoint/pressure` | alvos de temperatura / pressão |
| `PUT` | `/api/pid` | ganhos `{kp, ki, kd}` |
| `PUT` | `/api/led` · `/api/pump` · `/api/steam` | LED, bomba, modo vaporização |
| `POST` | `/api/extraction/start` · `/api/extraction/stop` | ciclo de extração + cronômetro |
| `GET` `POST` | `/api/profiles` | listar / criar perfil |
| `PUT` `DELETE` | `/api/profiles/{id}` | editar / remover perfil |
| `PUT` | `/api/profiles/active` | define o perfil ativo `{id}` |
| `GET` | `/api/wifi/scan` | redes visíveis (só em modo AP) |
| `POST` | `/api/wifi/provision` · `/api/wifi/forget` | salvar / esquecer credencial |
| `POST` | `/api/factory-reset` | limpa a NVS |

Contrato completo em [`src/net/ApiServer.cpp`](src/net/ApiServer.cpp) e
[`docs/sdd/006-api-rest-websocket.md`](docs/sdd/006-api-rest-websocket.md).

---

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | visão geral, BOM, divisão de responsabilidades, fluxo de provisionamento |
| [`docs/EPICS.md`](docs/EPICS.md) | roadmap por épicos, cada um com um SDD |
| [`docs/sdd/`](docs/sdd/) | design docs: OLED, sensor, PID, integração, Wi-Fi, API, app |
| [`docs/pid-calibracao.md`](docs/pid-calibracao.md) | log e método da calibração de Kp/Ki/Kd em bancada |

### Roadmap

| # | Épico | Status |
|---|---|---|
| 1 | Scaffold + modelo de dados + botão + cronômetro | ✅ |
| 2 | Sensor de temperatura (MAX6675 + calibração) | ✅ |
| 3 | Controle PID de temperatura + SSR | ✅ |
| 4 | Integração MVP + calibração no hardware | 🔧 em bancada |
| 5 | Wi-Fi + provisionamento (AP/STA, mDNS) | ✅ |
| 6 | API REST/WebSocket + persistência NVS | ✅ |
| 7 | App Android (React + Capacitor) | ✅ |
| — | Sensor de pressão real, balança (dose:yield), OTA | 📋 futuro |

O sensor de pressão ainda é `SensorFake` — o hardware é Fase 2. O OLED local foi
removido do projeto (queimou); toda a UI vive no app.

---

## Licença

A definir. Enquanto isso: use por sua conta e risco, sem garantia.
