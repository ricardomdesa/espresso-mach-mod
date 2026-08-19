# SDD-003 — Épico 3: Controle PID Temperatura + Bomba

- **Status:** Pendente (não implementado)
- **Épico:** 3 de 4 (MVP)
- **Pré-requisitos:** Épico 2 concluído (`SensorCalibrated` de temperatura publicando no `DisplayModel`)
- **Hardware alvo:** ESP32-C3 Super Mini, SSR 25A (3-32VDC controle), módulo dimmer AC digital com detector de zero-cross, bomba vibratória Ulka original

## 1. Problema

Os épicos 1-2 entregaram leitura real de temperatura, mas nenhum atuador. Este épico fecha a malha de controle de temperatura (PID + SSR) e entrega o driver de potência da bomba (dimmer AC zero-cross). Ainda não liga a bomba ao ciclo de extração real (start/stop/cronômetro) — isso é o épico 4. Controle de pressão em malha fechada fica fora de escopo: sensor de pressão foi adiado pra Fase 2 (ver `docs/EPICS.md` linha 5+), então a bomba roda em potência fixa neste épico, sem realimentação.

## 2. Objetivos

1. Fechar a malha PID de temperatura: `SensorCalibrated` (épico 2) → PID → SSR, mantendo `TEMP_SETPOINT` fixo.
2. Acionar o SSR por time-proportioning (janela de tempo fixa, duty % vindo do PID) — não PWM de alta frequência.
3. Entregar o driver da bomba (dimmer AC + zero-cross), controlável por potência fixa, testável isoladamente.
4. Manter setpoint e ganhos (Kp/Ki/Kd, potência da bomba) fixos em consts (mesma convenção dos épicos anteriores).
5. Rodar o loop PID continuamente desde o boot, sem travar a UI (orçamento de frame herdado do épico 1).

**Não-objetivos (deste épico):** controle de pressão/vazão em malha fechada (sem sensor), start/stop da bomba atrelado ao cronômetro/extração real (épico 4), setpoints editáveis, perfil de extração (rampa/pré-infusão).

## 3. Contexto / Arquitetura Atual

- `SensorCalibrated` (épico 2) já publica temperatura calibrada; PID lê direto dessa instância (ou via `DisplayModel::tempCurrent()` — decisão em D2).
- `ARCHITECTURE.md` já fixa os atuadores: SSR 25A AC (aquecimento, PWM baixa frequência) e módulo dimmer AC digital com zero-cross (bomba Ulka).
- SSR comprado pelo usuário: entrada de controle 3-32VDC, 25A/127V na saída. GPIO do ESP32-C3 é 3.3V lógico — dentro da faixa, mas no limite inferior; testar acionamento direto antes de decidir se precisa de transistor NPN como chave baixa (decisão de hardware já discutida, ver D5).
- Regra do projeto: hardware validado no início do épico que o usa, antes de fixar pinagem definitiva (mesmo padrão do scanner I2C no épico 1 e do teste de pinagem SPI no épico 2).

## 4. Requisitos

### Funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|---------------------|
| F1 | PID de temperatura roda continuamente desde o boot | temperatura converge e se estabiliza em torno de `TEMP_SETPOINT` (±1-2°C) |
| F2 | SSR acionado por time-proportioning (janela fixa, duty vindo do PID) | duty 0-100% mapeado corretamente pra tempo ligado dentro da janela, sem `delay()` bloqueante |
| F3 | Driver da bomba (dimmer AC zero-cross) liga/desliga e ajusta potência fixa | bomba gira com potência configurada em `PUMP_POWER_PERCENT`, testável isolado (sem depender do cronômetro) |
| F4 | Pinagem de SSR, zero-cross e disparo do dimmer validada em hardware antes de fixar em `pinos.h` | teste isolado confirma acionamento correto de cada sinal |
| F5 | Falha de leitura de temperatura (último valor mantido, épico 2 D4) não gera duty 100% indefinido por engano | comportamento documentado e testado (ver D6) |

### Não-funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|---------------------|
| N1 | Loop PID + SSR não bloqueia o `loop()` além do orçamento de frame (5 ms, herdado do épico 1) | sem `delay()` no caminho do PID/SSR; time-proportioning por `millis()` |
| N2 | Sem alocação dinâmica em runtime | sem `new`/`malloc` |
| N3 | Pinos e ganhos centralizados (`pinos.h`, `controle.h`) | sem número mágico espalhado no código |
| N4 | Código documentado em PT-BR | comentários e docs |

## 5. Decisões de Design (ADR)

### D1 — Biblioteca PID: `br3ttb/PID` (PID_v1)

- **Escolha:** lib padrão de mercado (Brett Beauregard), amplamente usada em mods de máquina de espresso.
- **Por quê:** anti-windup e forma de cálculo já testados/documentados; evita reinventar PID discreto do zero pra um problema já resolvido.
- **Alternativas:** PID caseiro (mais controle, mas retrabalho sem ganho real pro MVP).

### D2 — `PidController` lê `SensorCalibrated` diretamente, não via `DisplayModel`

- **Escolha:** o loop de controle (`PidController`) recebe `ISensor&` (a mesma instância `SensorCalibrated` de temperatura) no construtor, independente do `DisplayModel`.
- **Por quê:** mantém a UI (`DisplayModel`) e o controle (`PidController`) como consumidores paralelos do mesmo sensor, sem acoplar um ao outro — `DisplayModel` continua só "fonte única pra UI" (N1 do épico 1), controle é outro consumidor do mesmo `ISensor`.

### D3 — SSR por time-proportioning, janela fixa (`SSR_WINDOW_MS`)

- **Escolha:** `HeaterOutput` recebe duty 0-100% do PID e liga/desliga o GPIO do SSR dentro de uma janela fixa (ex.: 1000 ms), via `millis()`, sem bloquear o loop.
- **Por quê:** SSR já faz o chaveamento fino internamente; o software só precisa decidir "ligado ou desligado" a cada instante dentro da janela — padrão comum em mods de PID de espresso (ex.: Gaggiuino e afins). Janela de 1s é curta o bastante pra não gerar ripple perceptível na caldeira (massa térmica alta) e longa o bastante pra não estressar o SSR com chaveamento rápido demais.
- **Alternativas:** PWM real via `ledc` do ESP32 em frequência alta (sem necessidade — a caldeira não responde nessa velocidade, só desgasta o SSR à toa).

### D4 — Bomba: `RBDdimmer` (driver AC zero-cross)

- **Escolha:** lib `ingelobito/RBDdimmer` (ou fork oficial RobotDyn específico pra ESP32, a confirmar disponibilidade exata no registry no início da implementação) — usa interrupção no pino de zero-cross do módulo dimmer e timer de hardware pra disparar o TRIAC no ângulo de fase correspondente à potência desejada.
- **Por quê:** disparo de TRIAC por ângulo de fase é sensível a timing (microssegundos); reimplementar isso à mão é retrabalho arriscado quando já existe lib madura pro protocolo do módulo RobotDyn (mesmo módulo citado em `ARCHITECTURE.md`).
- **Risco:** disponibilidade/qualidade da porta pra ESP32-C3 (RISC-V, sem os mesmos periféricos de timer do Xtensa clássico) — validar cedo com um teste isolado (bomba girando em potência fixa) antes de integrar ao restante do firmware.

### D5 — Acionamento do SSR: GPIO direto, com fallback de transistor documentado

- **Escolha:** tentar acionar o SSR (3-32VDC) direto pelo GPIO 3.3V do ESP32-C3. Se o teste de bancada mostrar acionamento não confiável, adicionar transistor NPN (ex. BC547/2N2222) como chave baixa entre GPIO e SSR-, alimentando o SSR de um trilho de 5V à parte (decisão já mapeada, não é incerteza nova).
- **Por quê:** simplicidade primeiro; a maioria dos SSR 3-32VDC aciona direto com 3.3V, mas fica documentado o plano B pra não bloquear o épico se o teste falhar.

### D6 — Failsafe simples: PID não roda sem leitura válida recente

- **Escolha:** `PidController` consulta também um "sensor válido nos últimos N segundos" antes de aplicar o duty calculado; se a leitura estiver em fallback (episódio 2, D4 — último valor mantido) por mais que um limite (ex. 10 s sem atualização real), força duty 0% e loga no Serial.
- **Por quê:** evita que uma falha silenciosa do termopar (último valor válido "congelado", ex. 90°C) sustente o SSR ligado indefinidamente com base num valor que já não reflete a realidade. Fusível físico na linha AC (já previsto em `ARCHITECTURE.md`) continua como última camada de proteção, isso aqui é a primeira.
- **Como:** `SensorMax6675` (épico 2) passa a expor também `msSinceLastValidRead()` além de `read()`, sem quebrar `ISensor`.

## 6. Estrutura de Código

```
include/
  pinos.h                    # + SSR_PIN, PUMP_ZC_PIN, PUMP_PSM_PIN
  controle.h                  # novo — TEMP_SETPOINT, PID_KP/KI/KD, SSR_WINDOW_MS, PUMP_POWER_PERCENT
src/
  control/
    PidController.h           # novo — wrapper sobre PID_v1, expõe compute() -> duty 0-100%
    PidController.cpp
    HeaterOutput.h             # novo — time-proportioning do SSR (millis(), sem delay)
    HeaterOutput.cpp
    PumpDimmer.h                # novo — wrapper sobre RBDdimmer, start()/stop()/setPower()
    PumpDimmer.cpp
  sensors/
    SensorMax6675.h/.cpp       # + msSinceLastValidRead() (D6)
  main.cpp                     # instancia PidController+HeaterOutput no loop; PumpDimmer testável isolado
```

### Fluxo do loop (adição sobre o fluxo do épico 1)

```
loop()
  button.update()
  model.update()                       # como já era (épico 1-2)
  pidController.compute()              # calcula duty a partir da leitura calibrada
  heaterOutput.update(pidController.duty())  # liga/desliga SSR dentro da janela, via millis()
  ...                                   # navegação/timer como já era
  screenManager.draw(display, model)
```

`PumpDimmer` não entra no `loop()` principal neste épico — testado isolado (bancada), integração ao ciclo de extração fica pro épico 4.

### Pinagem proposta (`include/pinos.h`) — a validar em hardware antes de fixar

```
#define SSR_PIN      7   // controle do SSR (3-32VDC), direto ou via transistor (D5)
#define PUMP_ZC_PIN  10  // entrada de interrupção — sinal de zero-cross do módulo dimmer
#define PUMP_PSM_PIN 20  // saída — pulso de disparo do TRIAC (PSM do módulo dimmer)
```

Pinos livres fora dos já usados nos épicos 1-2 (`PIN_BTN=2`, `OLED_SDA=8`, `OLED_SCL=9`, `MAX6675_SCK=4`, `MAX6675_CS=5`, `MAX6675_SO=6`) e fora dos pinos de USB nativo (18/19).

## 7. Testes

| Tipo | Escopo | Critério | Status |
|------|--------|----------|--------|
| Build | `pio run` | sem erros, sem warnings novos | Pendente |
| Hardware | acionamento do SSR (GPIO direto) | SSR fecha contato AC de forma confiável; se não, aplicar D5 | Pendente |
| Hardware | zero-cross + disparo do dimmer | bomba gira em potência fixa configurada, sem tremular/travar | Pendente |
| Controle | resposta do PID | temperatura sobe e estabiliza em `TEMP_SETPOINT` ±1-2°C, sem oscilação sustentada | Pendente |
| Failsafe | simular leitura de temperatura travada (D6) | duty força 0% após o limite de tempo sem leitura válida, log no Serial | Pendente |
| Regressão | UI (épicos 1-2) | tela e navegação continuam funcionando com o loop de controle ativo | Pendente |

## 8. Riscos e Mitigações

| Risco | Impacto | Mitigação | Status |
|-------|---------|-----------|--------|
| GPIO 3.3V não aciona o SSR de forma confiável | caldeira não aquece | D5 — transistor NPN como chave baixa (plano B já mapeado) | Pendente validação |
| Overshoot/oscilação de temperatura com Kp/Ki/Kd chutados | temperatura instável, risco de queimar café/usuário | ajuste fino no hardware real (épico 4 já prevê isso no escopo); começar com ganhos conservadores | Aceito, mitigado no épico 4 |
| Porta do `RBDdimmer` pra ESP32-C3 (RISC-V) instável ou inexistente | bomba não controla potência corretamente | teste isolado cedo (D4); fallback: controle on/off simples sem dimming, se a lib não portar bem | Pendente validação |
| Falha de termopar sustenta SSR ligado com valor "congelado" | superaquecimento | D6 — failsafe por tempo sem leitura válida + fusível físico (já previsto em `ARCHITECTURE.md`) | Mitigado por design |
| Chaveamento do SSR gera ruído elétrico afetando leitura do termopar (SPI bit-bang, épico 2) | leitura de temperatura ruidosa/errática | isolar fiação do termopar longe do cabeamento AC; validar durante o teste de hardware deste épico | Pendente validação |

## 9. Plano de Implementação

1. Teste isolado do SSR: acionamento direto por GPIO, confirmar fechamento de contato AC (aplicar D5 se necessário).
2. Teste isolado do dimmer: zero-cross + disparo do TRIAC, bomba girando em potência fixa.
3. Fixar pinagem validada em `pinos.h` + `controle.h` com consts iniciais (Kp/Ki/Kd conservadores, `TEMP_SETPOINT`, `PUMP_POWER_PERCENT`).
4. `PidController` (wrapper `PID_v1`) lendo `SensorCalibrated` de temperatura.
5. `HeaterOutput` (time-proportioning do SSR, `millis()`, janela `SSR_WINDOW_MS`).
6. `msSinceLastValidRead()` em `SensorMax6675` + failsafe D6 no `PidController`.
7. `PumpDimmer` (wrapper `RBDdimmer`), testável isolado (sem integrar ao loop principal).
8. Integrar `PidController` + `HeaterOutput` ao `loop()` principal; smoke test com UI (épicos 1-2) intacta.
9. Teste de resposta térmica real: boot a frio, medir tempo até estabilizar em `TEMP_SETPOINT`, ajustar ganhos.
10. Documentar ganhos finais e comportamento observado neste SDD.

## 10. Critérios de Aceite (resumo)

- [ ] `pio run` limpo
- [ ] SSR aciona de forma confiável (direto ou via transistor, D5 documentado)
- [ ] Temperatura converge e estabiliza em `TEMP_SETPOINT` (±1-2°C) sem oscilação sustentada
- [ ] Bomba gira em potência fixa via `PumpDimmer`, testado isolado
- [ ] Failsafe D6 validado (duty força 0% se leitura travar além do limite)
- [ ] UI e navegação dos épicos 1-2 sem regressão com o loop de controle ativo
- [ ] Pinagem final documentada em `pinos.h`

## 11. Deferred (Fase 2 / fora deste épico)

- Controle de pressão/vazão em malha fechada (depende do sensor de pressão, `docs/EPICS.md` linha 5+)
- Perfis de extração (pré-infusão, rampa de pressão, declínio)
- Setpoints e ganhos editáveis via app/NVS
- Start/stop da bomba atrelado ao cronômetro/extração real (épico 4)
