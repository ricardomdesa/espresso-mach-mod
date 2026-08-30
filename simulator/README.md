# ESP32 simulado (`simulator/`)

Servidor em Go que finge ser a máquina: expõe os **mesmos endpoints REST + WebSocket**
que o firmware (`src/net/ApiServer.cpp`), para o app rodar contra ele sem hardware —
inclusive no emulador Android. A temperatura é simulada por um modelo térmico + PID
(porte fiel de `src/control/PidController.cpp`) e é ajustável por endpoints `/sim/*`.
Tem uma tela web mostrando SSR, relé da bomba, LED e relé "pronto".

## Rodar

### Docker (recomendado)

```sh
cd simulator
docker compose up --build
```

Sobe em `http://localhost:8080`. Tela web em `http://localhost:8080/`.

### Local

```sh
cd simulator
go run .            # http://localhost:8080
go run . -port 9000 -no-auth
```

Flags (ou variáveis de ambiente):

| Flag | Env | Default | O quê |
|---|---|---|---|
| `-port` | `SIM_PORT` | `8080` | porta HTTP |
| `-token` | `SIM_AUTH_TOKEN` | `sim-token` | valor exigido no header `X-Auth-Token` |
| `-no-auth` | `SIM_AUTH_DISABLED` | `false` | aceita qualquer token |
| `-ip` | `SIM_IP` | `192.168.1.50` | valor do campo `status.ip` |
| `-init-temp` | `SIM_INIT_TEMP` | `25` | temperatura inicial da caldeira (°C) |
| `-init-ambient` | `SIM_INIT_AMBIENT` | `25` | temperatura ambiente (°C) |

## Ligar o app (emulador Android)

O `10.0.2.2` do emulador aponta para o `localhost` da máquina host. A
auto-descoberta do app (mDNS `philco.local` / varredura de subnet) **não** alcança
esse endereço — use o **endereço manual**:

1. Suba o simulador no host (Docker ou `go run .`).
2. App → tela de Setup → campo **"Endereço manual"** → `10.0.2.2:8080` → Conectar.
   (O campo aceita `host:porta` e prefixa `http://`; o WebSocket vira
   `ws://10.0.2.2:8080/ws`.)
3. Genymotion usa `10.0.3.2`. Simulador iOS / web dev usam `localhost:8080`.

O fluxo de provisionamento também funciona: ponha o simulador em modo AP
(`POST /sim/wifi-mode {"mode":"ap"}` ou pela tela web), e `POST /api/wifi/provision`
devolve o token — daí em diante o app usa o header `X-Auth-Token`.

## Endpoints espelhados (`/api/*` e `/ws`)

Contrato idêntico ao firmware — ver `src/net/ApiServer.cpp` e `app/src/api/`:

- `GET /api/status`
- `PUT /api/setpoint/temp` `{temp}` · `PUT /api/setpoint/pressure` `{press}`
- `PUT /api/led` `{on}` · `PUT /api/pump` `{on}` · `PUT /api/steam` `{on,temp?}`
- `PUT /api/pid` `{kp,ki,kd}`
- `POST /api/extraction/start` · `POST /api/extraction/stop`
- `GET/POST /api/profiles` · `PUT/DELETE /api/profiles/{id}` · `PUT /api/profiles/active` `{id}`
- `GET /api/wifi/scan` · `POST /api/wifi/provision` · `POST /api/wifi/forget` · `POST /api/factory-reset`
- `GET /ws` — frame de streaming a cada 100 ms; manda texto com `ping` e recebe `{"event":"pong"}`;
  eventos `extraction_started` / `extraction_stopped` / `error`.

Endpoints que mudam estado exigem `X-Auth-Token` (menos `provision` em modo AP), CORS
liberado (`*`), `OPTIONS` responde 204 — tudo como no firmware.

## Controles da simulação (`/sim/*` — sem token)

| Rota | Corpo | Efeito |
|---|---|---|
| `GET /sim/state` | — | status + planta + fase do executor |
| `POST /sim/temp` | `{temp}` | força a temperatura da caldeira (degrau) |
| `POST /sim/ambient` | `{temp}` | temperatura ambiente |
| `POST /sim/pressure` | `{press}` | força a pressão |
| `POST /sim/plant` | `{heaterWatts?,thermalMass?,lossCoeff?,noise?}` | ajusta o modelo térmico |
| `POST /sim/sensor-fault` | `{on}` | congela a idade da leitura → failsafe do PID (duty 0) após ~10 s |
| `POST /sim/mode` | `{manual:bool}` ou `{mode:"auto"\|"manual"}` | manual = congela a planta (temperatura fixada à mão) |
| `POST /sim/wifi-mode` | `{mode:"ap"\|"sta"\|"offline"}` | testa os 409 de modo de configuração |
| `POST /sim/scenario` | `{name}` | preset: `cold-start`, `at-temp`, `hot`, `steam` |
| `POST /sim/reset` | — | volta aos defaults de fábrica |

### Exemplos

```sh
curl localhost:8080/sim/state
curl -XPOST localhost:8080/sim/temp     -d '{"temp":93}'
curl -XPOST localhost:8080/sim/scenario -d '{"name":"cold-start"}'
curl -XPUT  localhost:8080/api/setpoint/temp -H 'X-Auth-Token: sim-token' -d '{"temp":94}'
```

## Modelo térmico

`dT/dt = (heaterWatts·duty/100 − lossCoeff·(T − ambiente)) / thermalMass`, integrado a
~50 Hz. `duty` vem de um PID posicional idêntico ao do firmware (anti-windup na
integral, derivada sobre a medição, cadência 200 ms, failsafes de leitura parada e
sobretemperatura em 115 °C). A leitura reportada leva ruído gaussiano (`noise`, °C).
Pressão segue a bomba com atraso de ~0,5 s. Constantes default: 1400 W, 1200 J/°C,
8 W/°C — cold-start chega a ~92 °C em poucos minutos. Ajuste por `/sim/plant`.
