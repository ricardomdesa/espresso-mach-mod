# Philco Espresso Mod — Arquitetura

## Visão Geral

Cafeteira Philco Espresso modificada com ESP32: controle PID de temperatura (caldeira) e controle de pressão/vazão da bomba (profiling). Sistema dividido em duas camadas de interface:

- **Display OLED (local, na máquina):** só infos básicas, leitura rápida no balcão.
- **App React + Capacitor (mobile):** toda configuração, perfis de extração, gráficos, ajuste PID.

## Escopo MVP

MVP é **offline** — sem Wi-Fi, sem app, sem WebSocket. ESP32 roda standalone:

- PID de temperatura + controle de pressão/vazão funcionando sozinhos, sem depender de rede.
- OLED como única interface: temp, pressão, cronômetro.
- Setpoints (temp/pressão alvo) e Kp/Ki/Kd fixos no código (`#define` ou consts) nesta fase — ajuste via reflash, não via UI.
- Botão físico só pra navegação entre telas do OLED (não pra configurar parâmetros).

Tudo que envolve **Wi-Fi, WebSocket, REST, provisionamento, app Capacitor e balança** vira **Fase 2 (pós-MVP)** — seções abaixo descrevem o alvo futuro, não o que entra no MVP.

## BOM / Componentes

**Temperatura**
- Termopar Tipo K + módulo **MAX6675** (SPI) — opção mais barata/comum.
- Alternativa: **PT100 + MAX31865** — mais precisão, menos ruído, mais caro.
- Fixação: pasta térmica alta temperatura, preso na carcaça externa da caldeira.

**Pressão**
- Transdutor de pressão **0–1.2 MPa (0–150 PSI)**, saída analógica **0.5–4.5V**.
- Instalação: conexão em "T" na linha de alta pressão (entre bomba e caldeira/grupo).
- **Divisor de tensão** obrigatório na entrada do ADC — transdutor sai até 4.5V, ESP32-C3 ADC aceita só até 3.3V. Sem isso queima o GPIO.

**Aquecimento (atuador temperatura)**
- **SSR (Relé Estado Sólido) AC, 25A**, chaveado por PWM baixa frequência.
- Resistência de aquecimento original da caldeira (reaproveitada).

**Bomba (atuador pressão/vazão)**
- **Módulo Dimmer AC Digital** com detector de **Zero-Cross**, controlando a bomba vibratória Ulka original.

**Display + navegação**
- OLED **SSD1306 128x64** I2C.
- 1 **botão físico** (tátil) pra navegação entre telas.

**MCU**
- **ESP32-C3 Super Mini**.

**Suporte / segurança elétrica**
- Fonte 5V/3.3V isolada pro ESP32 — nunca puxar direto da rede AC sem isolamento.
- Fusível na linha AC da resistência (proteção contra SSR travado ligado).
- Isolamento galvânico entre lado AC (SSR/dimmer) e lado DC (ESP32) — confirmar optoacoplador no datasheet do módulo específico.
- Gabinete isolando toda parte de 110/220V do usuário.

## Divisão de Responsabilidades

### ESP32 + OLED (display físico)

Mostra somente:

| Campo | Fonte |
|---|---|
| Temperatura atual | Termopar Tipo K (MAX6675) ou PT100 (MAX31865) |
| Temperatura ideal (setpoint) | Definido via app, salvo em NVS/flash do ESP32 |
| Pressão atual | Transdutor 0–1.2 MPa (0.5–4.5V) via ADC |
| Pressão ideal (setpoint do perfil ativo) | Definido via app |
| Cronômetro de extração | Contagem local no firmware, start/stop atrelado ao início/fim do disparo da bomba |

Não incluir no OLED: gráficos de extração, tuning PID (Kp/Ki/Kd), edição de perfis, histórico. Isso fica só no app.

**Hardware confirmado:** OLED SSD1306 128x64px, 2.2–5.5V, 30x27mm, I2C (SCL/SDA). MCU: ESP32-C3 Super Mini.

Pinagem I2C ESP32-C3 Super Mini (default): `SDA = GPIO8`, `SCL = GPIO9`. Confirmar na prática com `Wire.begin(8, 9)` — alguns lotes da Super Mini variam silkscreen, testar com scanner I2C antes de fixar no firmware.

Atenção: ESP32-C3 Super Mini roda em 3.3V lógico — display aceita 2.2–5.5V então é compatível direto, sem level shifter.

Layout sugerido — a validar se cabe tudo sem poluir, pode virar 2 telas com botão de navegação:

```
┌────────────────────┐
│ TEMP   93.0 / 92.4°C│
│ PRESS   9.0 / 8.7bar│
│ TIMER      00:23    │
└────────────────────┘
```

**Botão físico extra:** 1 botão (ou encoder) pra alternar entre telas caso não caiba tudo numa tela só, ex: tela 1 = temp+pressão, tela 2 = cronômetro em destaque durante a extração. Mesmo botão pode servir de start/stop manual do cronômetro se necessário. Definição fica pendente até testar layout real no display escolhido (depende do tamanho — 128x64 é justo pra 3 linhas + status).

### ESP32 (firmware — lógica de controle)

- Roda o loop PID de temperatura (SSR via PWM baixa frequência).
- Roda controle de pressão/vazão (dimmer AC + zero-cross na bomba Ulka).
- MVP: setpoints fixos no firmware. Fase 2: expõe setpoints/leituras via API local (Wi-Fi: WebSocket ou HTTP REST) para o app Capacitor consumir/alterar.
- MVP: sem persistência de config (fixo no código). Fase 2: persiste setpoint/perfil em NVS.
- OLED só lê variáveis já calculadas pelo loop de controle (não faz lógica própria).

### App React + Capacitor (mobile) — Fase 2, fora do MVP

Responsável por tudo que não é essencial no display físico:

- Ajuste de parâmetros PID (Kp, Ki, Kd).
- Definição de setpoint de temperatura alvo.
- Criação/edição de perfis de extração (pré-infusão, rampa de pressão, declínio).
- Gráficos em tempo real (temperatura x tempo, pressão x tempo) durante a extração.
- Histórico de extrações.
- Comunicação com ESP32 via Wi-Fi local (mesma rede) — REST/WebSocket.

## Comunicação ESP32 ↔ App — Fase 2, fora do MVP

- Protocolo: WebSocket para streaming de leituras em tempo real (temp/pressão a cada X ms) + REST para comandos (setpoint, start/stop perfil, salvar config PID).
- Display OLED consome os mesmos valores internos do firmware, sem round-trip de rede.

### Provisionamento Wi-Fi (padrão IoT: AP + STA)

Mesmo fluxo de interruptor/câmera Wi-Fi smart, com uma diferença de segurança: **o AP nunca abre sozinho**.

1. **Primeiro boot / sem credencial salva:** ESP32 fica **offline** (sem AP, sem STA). O firmware MVP funciona normalmente.
2. **Entrada no modo de configuração:** usuário segura o botão da tela inicial por **10 segundos** (barra de progresso no OLED). O firmware seta uma flag one-shot na NVS e reinicia; o boot lê a flag e sobe o AP `Philco-Setup` (IP fixo `192.168.4.1`). O OLED muda para a **tela de pareamento** (SSID/IP), que substitui a navegação normal enquanto o AP está no ar.
3. **Pareamento:** celular conecta nesse SSID e o app coleta SSID/senha da rede de casa.
4. **Provisionamento:** app envia credencial via HTTP POST pro ESP32, que salva em NVS, derruba AP, conecta como STA na rede de casa.
5. **Uso normal:** ESP32 na rede de casa. Descoberta via **mDNS** — dispositivo publica hostname `philco.local`, app resolve esse nome em vez de guardar IP fixo (evita quebrar com IP dinâmico do DHCP).
6. **Falha de conexão:** se perder STA (troca de roteador, senha errada), a máquina fica offline — **não** volta sozinha pro AP. Reconfigurar exige o mesmo hold de 10 s.

**Por quê:** AP aberto na rede do usuário é um vetor de acesso (qualquer vizinho poderia reprovisionar a máquina). Exigir hold físico de 10 s garante que o AP só aparece com acesso à máquina.

Implementação: AP/STA manual em `WifiProvisioner` (sem WiFiManager — o portal cativo não é usado; quem coleta SSID/senha é o app). Habilitar mDNS via `ESPmDNS.h` (`MDNS.begin("philco")`).

## Melhorias Futuras

- **Balança integrada (peso do café/extração):** ideia é usar peso pra parar extração automaticamente por proporção (ex: dose:yield 1:2) em vez de só tempo. Pendente definir:
  - Balança compatível (ex. balanças de café com saída Bluetooth tipo Acaia, ou célula de carga + HX711 acoplada direto no ESP32 — mais barato, mais trabalho de calibração).
  - Se comunica direto com ESP32 (HX711 via GPIO) ou via app (Bluetooth da balança pro celular, celular repassa pro ESP32).
  - Se aparece no OLED também ou fica só no app (peso provavelmente entra na tela do cronômetro).

## Pendências / Decisões em Aberto

**MVP:**
- [ ] Validar se temp+pressão+timer cabem numa tela só ou precisa de 2 telas + botão de navegação.
- [ ] Definir valores fixos iniciais de Kp/Ki/Kd e setpoints (temp/pressão) pra primeira versão do firmware.

**Fase 2 (pós-MVP):**
- [ ] Definir protocolo final (WebSocket vs REST puro vs MQTT) para o app.
- [ ] Estrutura de perfis de extração (JSON local no ESP32 vs enviado pelo app a cada extração).
- [ ] Balança: escolher hardware (HX711+célula de carga vs balança Bluetooth existente).
