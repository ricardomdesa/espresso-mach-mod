# SDD-001 — Épico 1: Display OLED + Navegação

- **Status:** Concluído — validado em hardware real (build, boot, I2C, visual, botão)
- **Épico:** 1 de 4 (MVP)
- **Pré-requisitos:** nenhum (primeiro épico)
- **Hardware alvo:** ESP32-C3 Super Mini, OLED SSD1306 128x64 I2C, 1 botão tátil

## 1. Problema

O MVP precisa de uma interface local mínima na máquina: temperatura atual/setpoint, pressão atual/setpoint e cronômetro de extração, legíveis no balcão. Não existe código ainda — este épico cria a fundação de firmware e a primeira entrega visível (tela OLED + navegação).

## 2. Objetivos

1. Entregar um firmware PlatformIO compilável e gravável no ESP32-C3 Super Mini.
2. Exibir as 3 informações centrais (temp, pressão, timer) no SSD1306 128x64.
3. Navegar entre telas com o botão físico.
4. Validar o hardware I2C cedo (scanner) antes de fixar pinagem.
5. Criar o `DisplayModel` (modelo de dados compartilhado) que os épicos 2–4 vão alimentar.

**Não-objetivos (MVP):** configuração via UI, setpoints editáveis, Wi-Fi/app, gráficos, persistência NVS, PID.

## 3. Contexto / Arquitetura Atual

- Documento raiz: `ARCHITECTURE.md` (decisões de hardware e divisão de responsabilidades).
- Sem código fonte ainda. Firmware alvo: ESP32-C3 (Xtensa RISC-V), 3.3V lógico.
- OLED suporta 2.2–5.5V → alimenta direto do 3.3V, sem level shifter.
- I2C default da C3 Super Mini: `SDA = GPIO8`, `SCL = GPIO9` — **confirmado** por hardware já em uso em outros projetos e validado via scanner no boot (endereço `0x3C` detectado).

## 4. Requisitos

### Funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|--------------------|
| F1 | Firmware compila com PlatformIO (framework Arduino) | `pio run` sem erros |
| F2 | Grava e roda no ESP32-C3 Super Mini | boot OK, OLED acende, sem crash/reboot loop |
| F3 | Scanner I2C detecta o OLED | endereço 0x3C (ou 0x3D) impresso no Serial |
| F4 | Tela inicial mostra temp atual, temp setpoint, pressão atual, pressão setpoint | valores legíveis, atualização ≥ 5 Hz |
| F5 | Cronômetro de extração inicia/para pelo botão (2º clique) | contagem correta, formatação `MM:SS` (hora se > 59min) |
| F6 | Botão navega entre telas (modo leitura) | ciclo sem deadlock |
| F7 | Botão segurar (≥ 1s) reseta o cronômetro | reset em qualquer tela |

### Não-funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|--------------------|
| N1 | Fonte única de dados (`DisplayModel`) | épicos 2–4 só alteram esse modelo; UI não lê sensores |
| N2 | UI bloqueia no máximo 5 ms por frame (48 FPS = 20.8 ms de orçamento) | medição com `micros()` no driver |
| N3 | Sem alocação dinâmica no loop | sem `new`/`malloc` em runtime |
| N4 | Código documentado em PT-BR | comentários e docs |

## 5. Decisões de Design (ADR)

### D1 — Driver: Adafruit SSD1306 + Adafruit GFX

- **Escolha:** libs oficiais via PlatformIO `lib_deps` (`adafruit/Adafruit SSD1306`, `adafruit/Adafruit GFX Library`).
- **Por quê:** testadas em massa no ESP32, suportam I2C, fonte integrada, sem custo de dev.
- **Alternativas:** U8g2 (mais leve, mas API mais complexa), driver raw (retrabalho).
- **Risco:** RAM/Flash do C3 (depende do build real); GFX em 128x64 usa ~1 KB de framebuffer — OK para o C3 (≈ 400 KB RAM).

### D2 — Gerenciador de telas: array estático + função de desenho

- **Escolha:** `Screen` com ponteiro de função `draw()`, array estático `const Screen screens[]`, índice global, sem alocação dinâmica.
- **Por quê:** simples, previsível, testável; telas adicionais = 1 struct + 1 desenho.
- **Alternativas:** máquina de estados formal (overkill), biblioteca de UI (peso desnecessário).

### D3 — Debounce do botão em software

- **Escolha:** debounce por tempo (estável por 50 ms), eventos `click` / `long_press`, com `millis()`.
- **Por quê:** botão tátil tem bounce real; debounce por interrupção + flag é mais complexo sem ganho aqui.

### D4 — Telas: 2 telas + cronômetro em destaque

- **Escolha:** Tela 1 = temp + pressão (layout do `ARCHITECTURE.md`); Tela 2 = cronômetro em destaque (fonte grande).
- **Por quê:** 128x64 é justo para 3 linhas + legibilidade no balcão; o documento já previa "pode virar 2 telas com botão de navegação".

### D8 — Layout respeita a fronteira amarelo/azul do painel físico (achado visual)

- **Achado (teste com hardware):** o OLED físico usado é bicolor — faixa amarela fixa em `y=0..15`, faixa azul em `y=16..63`. Texto grande (`setTextSize(2)`, 16px) posicionado cruzando `y=16` fica ilegível (metade em cada cor).
- **Fix:** todo texto respeita a fronteira — nada de `setCursor` com y entre ~10 e ~20 para texto de tamanho ≥2. Layout final da Tela 1: setpoints pequenos na faixa amarela (`y=4`), `TEMP`/`PRESSAO` lado a lado com valor grande abaixo, com espaço, tudo dentro da faixa azul (`y≥16`). Tela 2: temp/pressão atuais (sem unidade) na faixa amarela, status + cronômetro grande na faixa azul.
- **Por quê importa p/ próximos épicos:** qualquer tela nova (épicos 2-4) deve seguir essa mesma regra de layout.

### D7 — Volta da Tela 2 via long_press (achado em teste com hardware)

- **Achado (teste com botão físico):** com click fazendo `screens.next()` na Tela 1 mas `timer.toggle()` na Tela 2 (D2/fluxo original), não sobrava gesto pra voltar — usuário ficava preso na Tela 2 (start/stop/reset funcionavam, navegação não). Violava F6 ("ciclo sem deadlock").
- **Fix:** `long_press` passa a fazer reset **e**, se a tela ativa for a do timer, navega de volta pra Tela 1 (`screenManager.next()`, cicla de volta ao índice 0). Em qualquer outra tela, `long_press` só reseta (no-op visual, sem efeito colateral).
- **Por quê:** único gesto livre com 1 botão só; reset + volta é o fluxo natural (usuário termina extração, reseta, sai da tela do timer).
- **Efeito:** F7 ("reset em qualquer tela") preservado; F6 (ciclo sem deadlock) corrigido.

### D6 — Serial via USB CDC nativo (não UART0)

- **Achado (implementação):** `Serial` do Arduino core, por padrão no board `esp32-c3-devkitm-1`, mapeia p/ UART0 (pinos físicos não conectados no Super Mini) — não p/ o USB-C onboard. Só o bootloader ROM aparece na porta `/dev/cu.usbmodemXXXX`; `Serial.print()` do firmware some sem log e sem erro.
- **Fix:** `build_flags` no `platformio.ini`:
  ```ini
  build_flags =
      -D ARDUINO_USB_MODE=1
      -D ARDUINO_USB_CDC_ON_BOOT=1
  ```
  Roteia `Serial` pro USB-Serial-JTAG nativo, mesmo caminho físico do USB-C.
- **Sintoma se esquecido:** boot log mostra só ROM (`ESP-ROM:esp32c3-api1-...`), nada do `setup()` — parece crash mas é só Serial no lugar errado.

### D5 — Simulação de sensores (fakes) no épico 1

- **Escolha:** `SensorFake` implementando a interface dos sensores (temp e pressão), valores variando suavemente (seno/rampa).
- **Por quê:** sem hardware de sensores ainda, o display precisa de dados para validação visual; o mesmo contrato será usado pelos épicos 2–4 (fácil trocar o fake pelo real).

## 6. Estrutura de Código

```
platformio.ini              # env: esp32-c3-super-mini (board: esp32-c3-devkitm-1)
src/
  main.cpp                  # setup/loop: init, botão, update de model, loop do screen manager
  model/DisplayModel.h      # struct com temp, setpoint, pressão, timer state
  model/DisplayModel.cpp
  sensors/ISensor.h         # interface virtual pura (read() → valor)
  sensors/SensorFake.h      # fake p/ validação visual
  sensors/SensorFake.cpp
  ui/ScreenManager.h        # array de telas, índice, navegação
  ui/ScreenManager.cpp
  ui/Screens.h              # declaração das telas (draw funcs)
  ui/Screens.cpp
  input/Button.h            # debounce + eventos (click, long_press)
  input/Button.cpp
  util/Timer.h              # cronômetro MM:SS
  util/Timer.cpp
include/                    # pinos e constantes (pinos.h)
```

### Fluxo do loop

```
loop()
  button.update()                 # debounce + eventos
  model.update(sensores)          # lê fakes, atualiza DisplayModel
  if (button.click)  screens.next() | timer.toggle()
  if (button.long_press) timer.reset()
  screens.draw(model)             # desenha tela ativa no OLED
```

### Pinagem (include/pinos.h)

```
#define PIN_BTN     2   // GPIO2 (botão tátil p/ GND, pull-up interno)
#define OLED_SDA    8
#define OLED_SCL    9
```

## 7. Testes

| Tipo | Escopo | Critério | Status |
|------|--------|----------|--------|
| Build | `pio run` | sem erros, sem warnings novos | ✅ SUCCESS (RAM 4.4%, Flash 22.5%) |
| Smoke | upload via USB | `pio run -t upload` OK | ✅ OK, porta `/dev/cu.usbmodem1101` |
| Hardware | gravação + boot | OLED acende, log de boot sem crash | ✅ boot limpo, heap 307216 bytes livres |
| I2C | scanner no boot | endereço do display no Serial | ✅ `Dispositivo I2C encontrado em 0x3C` |
| Visual | Tela 1 com fakes | temp/pressão variando, legíveis | ✅ confirmado (layout lado a lado, setpoints em cima) |
| Visual | Tela 2 com fakes | cronômetro grande, contando | ✅ confirmado (temp/pressão na faixa amarela) |
| Interação | botão | navega, start/stop, reset | ✅ confirmado — click navega/toggle, long_press reseta e volta à Tela 1 ([[D7]]) |

## 8. Riscos e Mitigações

| Risco | Impacto | Mitigação | Status |
|-------|---------|-----------|--------|
| Pinagem I2C varia por lote da C3 Super Mini | display não responde | scanner I2C no boot imprime endereço; ajustar `pinos.h` se necessário | **Resolvido** — GPIO8/9 confirmado, scanner acusa `0x3C` |
| Endereço I2C do display ser 0x3D | tela preta | scanner detecta e loga; constante centralizada | N/A — endereço real é `0x3C` |
| RAM insuficiente do C3 com GFX | crash/reboot | medição com `ESP.getFreeHeap()` no boot; se crítico, trocar D1 para U8g2 | **Resolvido** — 307 KB livres de 320 KB (4.4% uso), sem risco |
| Botão com bounce excessivo | navegação dupla | debounce 50 ms configurável | Pendente — botão físico ainda não instalado |
| `Serial` mapeado p/ UART0 em vez de USB nativo (achado durante impl.) | sem log de boot, parece crash | ver [[D6]] — `build_flags` USB CDC | **Resolvido** |

## 9. Plano de Implementação

1. Scaffold PlatformIO (`platformio.ini`, `src/`, `include/`).
2. `pinos.h` + `Button` (debounce, eventos).
3. `DisplayModel` + fakes de sensor.
4. `Timer` (formatação MM:SS, start/stop/reset).
5. Driver SSD1306 + scanner I2C no boot.
6. `ScreenManager` + `Screens` (2 telas).
7. `main.cpp` integrando tudo.
8. Smoke: build, upload, interação real no display.
9. Documentar calibração de pinagem no README do épico (ou no `docs/`).

## 10. Critérios de Aceite (resumo)

- [x] `pio run` limpo
- [x] Upload + boot sem crash
- [x] Scanner I2C detecta o OLED
- [x] Tela 1 e Tela 2 desenhadas com dados dos fakes
- [x] Botão: navega, start/stop do timer, long-press reset
- [x] `DisplayModel` consumido por telas (fonte única, por construção — `Screens.cpp` só lê `DisplayModel`)

## 11. Deferred (Fase 2 — fora deste épico)

- Setpoints/editáveis e persistência NVS
- Wi-Fi, mDNS, REST/WebSocket
- App React + Capacitor
- Gráficos e histórico
- Balança
