# SDD-002 — Épico 2: Sensor de Temperatura

- **Status:** Implementado (firmware). `SensorMax6675` (adapter, throttle 250 ms, trata `NAN`/valor absurdo mantendo o último válido, expõe `msSinceLastValidRead()` p/ o failsafe do PID) + `SensorCalibrated` (decorator offset/ganho, consts em `include/calibracao.h`). `main.cpp` usa `SensorCalibrated(SensorMax6675)` no lugar do `SensorFake` de temperatura; pressão continua fake. Pinos: `PIN_THERMO_SCK=5`, `PIN_THERMO_SO=6`, `PIN_THERMO_CS=7` (`include/pinos.h`). Lib: `adafruit/MAX6675 library`. **Pendente:** validação em hardware com o termopar e ajuste fino de `TEMP_CAL_OFFSET`/`TEMP_CAL_GAIN` contra termômetro de referência.
- **Épico:** 2 de 4 (MVP)
- **Pré-requisitos:** Épico 1 concluído (`DisplayModel`, `ISensor`, estrutura de firmware)
- **Hardware alvo:** ESP32-C3 Super Mini, módulo MAX6675 (SPI), termopar tipo K

## 1. Problema

O épico 1 entregou o display funcionando com temperatura simulada (`SensorFake`). Este épico troca o sensor de temperatura fake por leitura real via MAX6675, mantendo o contrato `ISensor` já validado. Sensor de pressão fica fora deste épico — adiado para a Fase 2 (ver `docs/EPICS.md`, linha 5+), então `pressureSensor` continua sendo `SensorFake` no `DisplayModel`.

## 2. Objetivos

1. Ler temperatura real do termopar K via módulo MAX6675 (SPI bit-bang).
2. Aplicar calibração de offset/ganho sobre a leitura bruta antes de publicar no `DisplayModel`.
3. Tratar falha do termopar (leitura inválida) sem travar o firmware ou corromper a UI.
4. Validar pinagem SPI em hardware antes de fixar em `pinos.h` (regra do projeto).
5. Preservar o contrato `DisplayModel(ISensor&, ISensor&)` — `pressureSensor` continua fake.

**Não-objetivos (deste épico):** sensor de pressão real, filtro de ruído/média móvel, calibração editável via NVS, PID (épico 3).

## 3. Contexto / Arquitetura Atual

- `DisplayModel` (épico 1) já recebe duas referências `ISensor&` no construtor e não conhece a origem dos dados (N1 do épico 1) — trocar o sensor de temperatura não exige mudar `DisplayModel` nem `Screens`.
- `ISensor` é interface pura (`float read()`), implementada hoje só por `SensorFake`.
- MAX6675 é um chip que já faz a linearização do termopar internamente e devolve temperatura em °C direto — não precisa de tabela de compensação de junta fria em software.
- MAX6675 atualiza a leitura interna a ~4 Hz (~250 ms por conversão). Ler mais rápido que isso apenas repete a última conversão, sem ganho.
- Biblioteca escolhida: `adafruit/MAX6675 library` (registry PlatformIO), bit-bang SPI por `digitalWrite`/`digitalRead` — não usa o barramento SPI de hardware, então não conflita com pinos SPI reservados.

## 4. Requisitos

### Funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|---------------------|
| F1 | Leitura real de temperatura substitui `SensorFake` no `DisplayModel` | Tela 1 mostra valor variando com o ambiente, não mais senoide fake |
| F2 | Calibração de offset/ganho aplicada sobre a leitura bruta do MAX6675 | valor exibido bate com termômetro de referência dentro de ±1°C após ajuste |
| F3 | Falha do termopar (aberto/desconectado) não trava o firmware nem corrompe a tela | leitura inválida detectada, último valor válido mantido, log no Serial |
| F4 | Pinagem SPI validada em hardware antes de fixar em `pinos.h` | teste isolado com leitura crua impressa no Serial, valor plausível (~temperatura ambiente) |
| F5 | `pressureSensor` continua `SensorFake` | `DisplayModel` recebe 2 `ISensor&`, sem mudança de assinatura |

### Não-funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|---------------------|
| N1 | Leitura não pode violar orçamento de frame da UI (5 ms, herdado do épico 1) | leitura throttled a 250 ms (frequência real do chip), sem I/O bloqueante no `loop()` |
| N2 | Sem alocação dinâmica em runtime | sem `new`/`malloc` |
| N3 | Pinos centralizados em `pinos.h`, consts de calibração centralizadas em arquivo próprio | sem número mágico espalhado no código |
| N4 | Código documentado em PT-BR | comentários e docs |

## 5. Decisões de Design (ADR)

### D1 — Biblioteca: `adafruit/MAX6675 library`

- **Escolha:** lib oficial via `lib_deps`, bit-bang SPI (3 pinos: SCK, CS, SO/DO).
- **Por quê:** mesmo padrão do épico 1 (D1 — libs oficiais testadas), sem retrabalho de protocolo SPI do MAX6675. Bit-bang dispensa o barramento SPI de hardware do C3, evita conflito de pinos com periféricos futuros.
- **Alternativas:** driver raw (retrabalho sem ganho, chip já linear em °C), SPI de hardware (overkill para 1 leitura a cada 250 ms).

### D2 — `SensorMax6675 : ISensor` (adapter)

- **Escolha:** classe fina que envolve `Adafruit_MAX6675` e implementa `read()` chamando `readCelsius()`.
- **Por quê:** mantém `ISensor` como único contrato conhecido por `DisplayModel`/UI (N1 do épico 1) — troca de fake por real é 1 linha no `main.cpp`.

### D3 — `SensorCalibrated : ISensor` (decorator)

- **Escolha:** classe que envolve outro `ISensor&` e aplica `valor_calibrado = valor_bruto * ganho + offset`, com `ganho`/`offset` fixos em `#define`/consts (mesmo padrão de setpoints fixos do MVP, ver `docs/EPICS.md`).
- **Por quê:** termopar tipo K + MAX6675 costuma ter erro sistemático (junta fria, tolerância do chip); calibrar por decorator mantém `SensorMax6675` simples e reutiliza o mesmo decorator se a Fase 2 trocar de chip.
- **Alternativas:** calibração dentro do próprio `SensorMax6675` (acopla leitura a calibração, dificulta teste isolado).

### D4 — Falha do termopar: mantém último valor válido

- **Escolha:** `Adafruit_MAX6675::readCelsius()` retorna `NAN` em falha (termopar aberto/desconectado). `SensorMax6675::read()` detecta `isnan()`, loga no Serial e devolve o último valor válido em cache.
- **Por quê:** evita propagar `NAN` para `DisplayModel`/tela (texto corrompido) ou travar o loop; simples o suficiente pro MVP sem UI de erro dedicada.
- **Risco aceito:** falha prolongada do termopar fica "invisível" na tela (mostra último valor). Aceitável no MVP porque o usuário está presente durante a extração; UI de alarme fica pra Fase 2 se necessário.

### D5 — Throttle de leitura a 250 ms

- **Escolha:** `SensorMax6675` guarda `millis()` da última leitura real; chamadas de `read()` mais frequentes que 250 ms devolvem o valor em cache sem tocar no SPI.
- **Por quê:** respeita a frequência real de conversão do chip (~4 Hz) e mantém N1 (orçamento de 5 ms por frame) mesmo que o `loop()` rode bem mais rápido que isso.

### D6 — `pressureSensor` permanece `SensorFake`

- **Escolha:** nenhuma mudança em `pressureSensor` — sensor de pressão fica fora deste épico (decisão do usuário, ver `docs/EPICS.md` linha 5+).
- **Por quê:** evita implementar hardware/calibração de pressão sem o transdutor em mãos; `DisplayModel` já é agnóstico à origem do dado, então a troca futura não exige mudança de contrato.

## 6. Estrutura de Código

```
include/
  pinos.h                    # + MAX6675_SCK, MAX6675_CS, MAX6675_SO
  calibracao.h                # novo — TEMP_CAL_OFFSET, TEMP_CAL_GAIN (consts fixas MVP)
src/
  sensors/
    ISensor.h                 # sem mudança
    SensorFake.h/.cpp         # sem mudança (segue usado p/ pressão)
    SensorMax6675.h           # novo — adapter ISensor sobre Adafruit_MAX6675
    SensorMax6675.cpp
    SensorCalibrated.h        # novo — decorator ISensor (offset/ganho)
    SensorCalibrated.cpp
  main.cpp                    # troca tempSensor: SensorFake -> SensorCalibrated(SensorMax6675)
```

### Composição em `main.cpp`

```cpp
SensorMax6675 tempRaw(MAX6675_SCK, MAX6675_CS, MAX6675_SO);
SensorCalibrated tempSensor(tempRaw, TEMP_CAL_OFFSET, TEMP_CAL_GAIN);
SensorFake pressureSensor(9.0f, 0.5f, 3000.0f); // inalterado — pressão fora de escopo
DisplayModel model(tempSensor, pressureSensor);
```

### Pinagem proposta (`include/pinos.h`) — a validar em hardware antes de fixar

```
#define MAX6675_SCK 4  // clock (bit-bang)
#define MAX6675_CS  5  // chip select
#define MAX6675_SO  6  // MISO / DO do MAX6675
```

Pinos livres na C3 Super Mini fora dos já usados (`PIN_BTN=2`, `OLED_SDA=8`, `OLED_SCL=9`) e fora dos pinos de USB nativo (18/19, reservados pelo `ARDUINO_USB_CDC_ON_BOOT`). Confirmar com teste de leitura crua no boot antes de soldar/fixar definitivamente, seguindo a mesma regra aplicada ao I2C no épico 1.

## 7. Testes

| Tipo | Escopo | Critério | Status |
|------|--------|----------|--------|
| Build | `pio run` | sem erros, sem warnings novos | Pendente |
| Smoke | upload via USB | `pio run -t upload` OK | Pendente |
| Hardware | leitura crua no boot | valor plausível (~temperatura ambiente, 15-35°C) | Pendente |
| Calibração | comparação com termômetro de referência | erro ≤ ±1°C após ajuste de offset/ganho | Pendente |
| Falha | termopar desconectado propositalmente | `NAN` detectado, último valor mantido, log no Serial, sem crash | Pendente |
| Visual | Tela 1 com sensor real | temperatura real substitui fake, pressão continua fake | Pendente |

## 8. Riscos e Mitigações

| Risco | Impacto | Mitigação | Status |
|-------|---------|-----------|--------|
| Pinagem SPI bit-bang varia por lote/fiação | leitura não responde ou lixo | teste isolado com leitura crua no Serial antes de fixar `pinos.h` (mesma abordagem do scanner I2C do épico 1) | Pendente |
| Termopar com erro sistemático (junta fria, tolerância do chip) | temperatura exibida incorreta | calibração de offset/ganho (D3), ajustada contra termômetro de referência | Pendente |
| Termopar aberto/mau contato em campo | leitura `NAN` intermitente | D4 — mantém último valor válido + log; se virar problema real, considerar alarme na Fase 2 | Mitigado por design |
| Ruído na leitura (linha longa até o termopar) | valor "pulando" na tela | fora de escopo deste épico; se necessário, adicionar média móvel simples depois (Deferred) | Deferred |

## 9. Plano de Implementação

1. Teste isolado de pinagem SPI (sketch mínimo, leitura crua impressa no Serial) antes de tocar no firmware principal.
2. Fixar pinos validados em `pinos.h`.
3. `SensorMax6675` (adapter sobre `Adafruit_MAX6675`, com throttle de 250 ms e tratamento de `NAN`).
4. `SensorCalibrated` (decorator offset/ganho) + `calibracao.h` com consts iniciais (`offset=0`, `gain=1`).
5. Trocar `tempSensor` em `main.cpp` (`SensorFake` → `SensorCalibrated(SensorMax6675)`); manter `pressureSensor` fake.
6. Smoke: build, upload, leitura real na Tela 1.
7. Calibração fina: comparar com termômetro de referência, ajustar `TEMP_CAL_OFFSET`/`TEMP_CAL_GAIN`.
8. Teste de falha: desconectar termopar propositalmente, confirmar comportamento do D4.
9. Documentar valores finais de calibração e pinagem confirmada neste SDD.

## 10. Critérios de Aceite (resumo)

- [ ] `pio run` limpo
- [ ] Upload + boot sem crash
- [ ] Pinagem SPI validada em hardware e fixada em `pinos.h`
- [ ] Tela 1 mostra temperatura real do MAX6675 (fake removido para temperatura)
- [ ] `pressureSensor` continua `SensorFake` (sem regressão)
- [ ] Calibração documentada (offset/ganho finais registrados)
- [ ] Falha de termopar não trava firmware (comportamento validado em teste real)

## 11. Deferred (Fase 2 / fora deste épico)

- Sensor de pressão real (transdutor 0–150 PSI) — ver `docs/EPICS.md` linha 5+
- Filtro de ruído / média móvel na leitura de temperatura
- Calibração editável via NVS/UI (hoje fixa em `#define`)
- Alarme de falha de termopar na UI
