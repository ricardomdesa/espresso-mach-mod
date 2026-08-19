# SDD-004 — Épico 4: Integração MVP + Calibração

- **Status:** Pendente (não implementado)
- **Épico:** 4 de 4 (MVP)
- **Pré-requisitos:** Épico 3 concluído (`PidController`+`HeaterOutput` fechando malha de temperatura, `PumpDimmer` testado isolado)
- **Hardware alvo:** máquina completa montada (ESP32-C3, MAX6675, SSR, dimmer+bomba Ulka, OLED, botão)

## 1. Problema

Os épicos 1-3 entregaram os componentes isolados: display+navegação, sensor de temperatura, malha PID e driver da bomba testado em bancada. Falta ligar a bomba ao ciclo real de extração (o mesmo gesto que já inicia/para o cronômetro, desde o épico 1) e validar o sistema completo puxando café de verdade — é aqui que aparecem os problemas que só existem sob carga real (queda de temperatura ao extrair, ruído elétrico dos atuadores juntos, overshoot pós-extração). Fecha o MVP.

## 2. Objetivos

1. Ligar `PumpDimmer` ao mesmo gesto que já controla o `Timer` (Tela 2, épico 1) — start/stop simultâneo, sem novo gesto de botão.
2. Validar o sistema com extração real (água e depois café), sob a carga térmica real de uma extração.
3. Ajustar Kp/Ki/Kd e `SSR_WINDOW_MS` (épico 3) no hardware real — os valores dos SDDs anteriores eram conservadores/provisórios.
4. Confirmar checklist de segurança elétrica de `ARCHITECTURE.md` (fusível, isolamento galvânico, gabinete) antes de qualquer teste com água quente.
5. Consolidar e documentar os valores finais de calibração (temperatura, PID, potência da bomba) — fecha as pendências marcadas "a validar" nos SDDs 002 e 003.

**Não-objetivos (deste épico, seguem Fase 2):** perfis de extração (pré-infusão/rampa/declínio), controle de pressão em malha fechada, setpoints editáveis via app/NVS.

## 3. Contexto / Arquitetura Atual

- `Timer` (épico 1) já tem `toggle()`/`reset()` acionado pelo botão na Tela 2; `PumpDimmer` (épico 3) tem `start()`/`stop()`/`setPower()` mas ainda não é chamado por ninguém no `loop()` principal — só testado isolado em bancada.
- `PidController`+`HeaterOutput` (épico 3) já rodam continuamente desde o boot, independente da extração — isso não muda aqui, a caldeira sempre tenta manter `TEMP_SETPOINT`, extração ou não.
- `ARCHITECTURE.md` já lista os itens de segurança elétrica (fusível na linha do SSR, isolamento galvânico AC/DC, gabinete) como pendências de hardware — este épico é o ponto natural de confirmar que estão implementados, já que é quando a máquina roda de verdade pela primeira vez.

## 4. Requisitos

### Funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|---------------------|
| F1 | Clique na Tela 2 inicia `Timer` e `PumpDimmer` juntos | bomba liga no mesmo instante que o cronômetro começa a contar |
| F2 | Clique de novo na Tela 2 para `Timer` e `PumpDimmer` juntos | bomba desliga no mesmo instante que o cronômetro para |
| F3 | `long_press` (reset, épico 1) também garante bomba desligada | reset nunca deixa a bomba girando |
| F4 | PID de temperatura reage à queda de temperatura durante a extração sem desligar/travar | temperatura volta a `TEMP_SETPOINT` após o fim da extração, sem overshoot perigoso |
| F5 | Checklist de segurança elétrica confirmado antes do primeiro teste com água quente | fusível instalado, isolamento galvânico confirmado, gabinete fechado nas partes de rede |

### Não-funcionais

| ID | Requisito | Critério de aceite |
|----|-----------|---------------------|
| N1 | Integração não introduz `delay()` bloqueante no `loop()` | orçamento de frame (5 ms, épico 1) preservado |
| N2 | Sem alocação dinâmica em runtime | sem `new`/`malloc` |
| N3 | Valores finais de calibração documentados nos SDDs correspondentes | `controle.h`/`calibracao.h` com consts finais, comentário indicando origem (teste real) |
| N4 | Código documentado em PT-BR | comentários e docs |

## 5. Decisões de Design (ADR)

### D1 — Vínculo Timer↔Bomba direto no `main.cpp`, sem classe nova

- **Escolha:** no mesmo ponto do `loop()` onde `button.clicked()` já chama `model.timer().toggle()` (Tela 2), adicionar a chamada equivalente em `pumpDimmer` (`start()`/`stop()` conforme o novo estado do timer). Mesma coisa no `long_press` (reset força `pumpDimmer.stop()`).
- **Por quê:** é literalmente 2-3 linhas a mais no `loop()` já existente; criar uma classe `ExtractionController` só pra isso seria abstração sem ganho — não há terceiro consumidor desse vínculo previsto no MVP.
- **Alternativa considerada e descartada:** classe dedicada de orquestração — overkill pro tamanho real do vínculo (`if timer.running() then pump.start() else pump.stop()`).

### D2 — PID continua sempre ativo, extração não pausa o controle de temperatura

- **Escolha:** nenhuma mudança em `PidController`/`HeaterOutput` — continuam rodando a cada `loop()` independente do estado do timer/bomba.
- **Por quê:** é assim que uma máquina de espresso real se comporta (caldeira sempre regula, extração é só a bomba ligando); qualquer pausa no PID durante a extração seria uma mudança de comportamento não pedida e complicaria o tuning.

### D3 — Calibração é processo empírico documentado, não código

- **Escolha:** ajuste de Kp/Ki/Kd, `SSR_WINDOW_MS` e potência da bomba acontece testando na máquina real (várias extrações, observando overshoot/tempo de recuperação) e os valores finais são fixados em `controle.h` com um comentário de contexto (ex.: "ajustado em extração real, ver SDD-004 §9").
- **Por quê:** setpoints/ganhos fixos em `#define` é decisão já tomada desde `ARCHITECTURE.md` pro MVP; não há UI de tuning nesta fase, então o "resultado" da calibração é o valor final commitado, não um mecanismo novo.

## 6. Estrutura de Código

Nenhum arquivo novo. Mudança concentrada em:

```
src/main.cpp   # loop(): pumpDimmer.start()/stop() junto do timer().toggle()/reset()
include/controle.h  # valores finais de Kp/Ki/Kd, SSR_WINDOW_MS, PUMP_POWER_PERCENT (ajustados)
include/calibracao.h  # valores finais de TEMP_CAL_OFFSET/GAIN (confirmados sob carga real)
```

### Fluxo do loop (ajuste sobre o épico 3)

```
loop()
  button.update()
  model.update()
  pidController.compute()
  heaterOutput.update(pidController.duty())

  if (button.clicked()) {
    if (screenManager.index() == kTimerScreenIndex) {
      model.timer().toggle();
      model.timer().running() ? pumpDimmer.start() : pumpDimmer.stop();  // novo (F1/F2)
    } else {
      screenManager.next();
    }
  }
  if (button.longPressed()) {
    model.timer().reset();
    pumpDimmer.stop();                                                  // novo (F3)
    if (screenManager.index() == kTimerScreenIndex) screenManager.next();
  }

  screenManager.draw(display, model);
```

## 7. Testes

| Tipo | Escopo | Critério | Status |
|------|--------|----------|--------|
| Build | `pio run` | sem erros, sem warnings novos | Pendente |
| Segurança | checklist elétrico (`ARCHITECTURE.md`) | fusível, isolamento, gabinete confirmados antes de energizar com água | Pendente |
| Integração (seco) | clique na Tela 2 | timer e bomba iniciam/param juntos, sem água | Pendente |
| Integração (água) | extração só com água (sem café) | bomba puxa água, temperatura reage, sem vazamento/curto | Pendente |
| Extração real | café de verdade, tempo típico (~25-30s) | temperatura volta ao setpoint após o fim, sem overshoot perigoso | Pendente |
| Regressão | UI/navegação (épicos 1-3) | nada quebra com a integração | Pendente |
| Calibração | múltiplas extrações seguidas | comportamento térmico consistente, ganhos finais documentados | Pendente |

## 8. Riscos e Mitigações

| Risco | Impacto | Mitigação | Status |
|-------|---------|-----------|--------|
| Queda abrupta de temperatura durante extração causa overshoot depois | café/usuário em risco, extração inconsistente | tuning iterativo dos ganhos PID com extrações reais (D3); começar conservador (herdado do épico 3) | Pendente validação |
| SSR + dimmer da bomba ligados juntos geram ruído elétrico compartilhado, afetando leitura SPI do termopar (já sinalizado no épico 3) | leitura de temperatura errática justo durante a extração | validar sob carga real neste épico; se necessário, revisar fiação/blindagem do termopar | Pendente validação |
| Checklist de segurança elétrica incompleto no primeiro teste com água quente | risco de choque/curto/queimadura | F5 — checklist é bloqueante, não pular pra "testar rápido" | Bloqueante por design |
| `PumpDimmer` (RBDdimmer, épico 3) instável sob uso prolongado/repetido | bomba trava ligada ou não liga | testes repetidos (múltiplas extrações seguidas) neste épico expõem isso antes do uso real | Pendente validação |

## 9. Plano de Implementação

1. Confirmar checklist de segurança elétrica de `ARCHITECTURE.md` (fusível, isolamento, gabinete) — bloqueante antes do passo 4.
2. Vínculo Timer↔Bomba no `main.cpp` (D1).
3. Teste seco (sem água): clique liga/desliga timer+bomba juntos, `long_press` sempre para a bomba.
4. Teste com água (sem café): extração completa, observar resposta térmica e funcionamento mecânico.
5. Teste com café real: 2-3 extrações, medir tempo de recuperação térmica pós-extração.
6. Ajustar Kp/Ki/Kd e `SSR_WINDOW_MS` (`controle.h`) conforme observado; repetir 4-5 até estabilizar.
7. Confirmar/reajustar `TEMP_CAL_OFFSET`/`TEMP_CAL_GAIN` (`calibracao.h`) sob carga real, não só em bancada fria.
8. Documentar valores finais neste SDD (§10) e atualizar comentários nos SDDs 002/003 apontando pra cá.
9. Marcar MVP (épicos 1-4) como concluído em `docs/EPICS.md`.

## 10. Critérios de Aceite (resumo)

- [ ] Checklist de segurança elétrica confirmado
- [ ] Clique na Tela 2 inicia/para timer e bomba juntos (F1/F2)
- [ ] `long_press` sempre garante bomba desligada (F3)
- [ ] Extração real com café testada, temperatura recupera sem overshoot perigoso (F4)
- [ ] Ganhos PID finais, `SSR_WINDOW_MS`, potência da bomba e calibração de temperatura documentados
- [ ] UI/navegação dos épicos 1-3 sem regressão
- [ ] MVP (épicos 1-4) considerado concluído

## 11. Deferred (Fase 2 / fora deste épico)

- Perfis de extração (pré-infusão, rampa de pressão, declínio) — ver `docs/EPICS.md` linha 5+
- Controle de pressão/vazão em malha fechada (depende do sensor de pressão)
- Setpoints e ganhos editáveis via app/NVS
- Wi-Fi, mDNS, REST/WebSocket, app Capacitor, balança
