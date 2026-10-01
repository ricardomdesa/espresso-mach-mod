# Calibração do PID de temperatura

Estudo de referência para o ajuste fino de Kp/Ki/Kd da caldeira.
Data de partida: 2026-08-28. Status: **em teste de bancada** (Fix 2 aplicado em 2026-10-01).

## 1. Como o laço funciona

Arquivos: `src/control/PidController.cpp`, `include/controle.h`, `src/model/DisplayModel.h`.

- `PidController::update()` roda a cada `PID_INTERVAL_MS` (200 ms).
- Lê `temp = model_.tempCurrent()` e `sp = model_.tempTarget()`
  (setpoint de café, ou `TEMP_STEAM_C = 90` quando o modo vaporização está ligado).
- `error = sp - temp`.
- Saída: `duty` 0–100 %. O `HeaterOutput` faz time-proportioning numa janela de
  `SSR_WINDOW_MS` (1 s) e liga/desliga o GPIO do SSR.

Fórmula (`PidController.cpp:60`):

```
out = Kp*error + integral - Kd*dTemp
```

- `integral += Ki*error*dt` só quando `|error| < PID_INTEGRAL_BAND_C` (8 °C); fora da banda
  é zerada. Clampada em `0..PID_INTEGRAL_MAX` (60) (`PidController.cpp:45-54`, `controle.h`).
- `dTemp = (temp - lastTemp)/dt` — **derivada sobre a medição**, não sobre o erro.
  Subtraída (`- Kd*dTemp`), evita "derivative kick" ao mudar o setpoint.
- `dt` em segundos, medido tick a tick.

### Papel de cada ganho

| Ganho | Age sobre | Efeito de subir | Efeito de descer |
|-------|-----------|-----------------|------------------|
| **Kp** | erro agora (`Kp*error`) | chega rápido, mais overshoot, oscila | sobe devagar, erro estacionário (Kp sozinho nunca zera erro) |
| **Ki** | erro acumulado no tempo | mata erro estacionário; se alto → windup, overshoot lento, oscilação de período longo | demora minutos pra assentar no alvo |
| **Kd** | velocidade da temperatura | amortece overshoot, freia na aproximação; se alto → nervoso, amplifica ruído do sensor | sem freio, mais overshoot |

## 2. Restrições do hardware

- **Sensor MAX6675**: converte a ~4 Hz (250 ms), quantização 0,25 °C.
  PID roda a 200 ms → às vezes usa a mesma leitura duas vezes; a derivada
  salta. Um degrau de 1 LSB do sensor sobre dt=0,2 s = 1,25 °C/s de `dTemp`
  → com Kd=5 isso vira ~6 % de jitter no duty por degrau de quantização.
- **Caldeira**: massa térmica alta, resposta em dezenas de segundos.
- **Sem resfriamento ativo.** Overshoot só volta por perda passiva (minutos) ou
  flush manual ligando a bomba. Logo: **erro assimétrico** — melhor errar
  levemente pra baixo e deixar a integral subir do que passar do alvo.

### Failsafes que interferem no teste

- `TEMP_MAX_SAFETY_C = 115` → acima disto duty forçado a 0, integral zerada
  (`PidController.cpp:25-31`).
- Leitura válida mais velha que `SENSOR_FAULT_TIMEOUT_MS = 10 s` → duty 0,
  integral zerada.
- Overshoot só na primeira subida pós-boot é esperado: integral parte do zero.

## 3. Ponto de partida (defaults de fábrica)

`src/model/DisplayModel.h:112` — `PidGains pid_{2.0f, 0.5f, 0.1f}`.
O app exibe exatamente estes valores. **São chute inicial, nunca calibrados.**

### Diagnóstico dos defaults

- **Kp=2**: erro 5 °C → só 10 % de duty. Fraco perto do alvo. Só satura com erro de 50 °C.
- **Ki=0.5**: `integral += 0.5*erro*dt` ≈ `+0.1*erro` por tick, 5 ticks/s. Enche
  0→100 em poucos segundos se o erro persiste. Agressivo.
- **Kd=0.1**: `0.1*dTemp`. Caldeira sobe ~1–2 °C/s → freio de 0,1–0,2 %. Nulo na prática.

### Sintoma observado em bancada (2026-08-28)

> Temperatura demora a chegar nos 70 °C e depois passa, estabilizando ~7 °C acima.

Bate com o diagnóstico: Kp fraco (subida lenta) + Ki forte com **windup** (a
integral satura em 100 durante a subida longa; quando a temp chega a 70 a
integral ainda está em 100 e segura o duty alto → estoura) + Kd zero (sem freio).
Sem resfriamento ativo, o retorno é lento.

Observação de projeto: o clamp atual da integral (`0..100`) é o range inteiro da
saída — a integral sozinha consegue sustentar 100 % de duty. Deveria ser menor.

## 4. Plano de ajuste

### Fix 1 — só ganhos (testar primeiro)

Via `PUT /api/pid {kp,ki,kd}` — vale na hora, sem reboot, persiste em NVS
(`PidController.h:10-11`).

Primeira tentativa:

```
Kp 5 / Ki 0.08 / Kd 3
```

- Kp 5: erro 10 °C → 50 % de duty só do proporcional. Sobe rápido sem depender da integral.
- Ki 0.08: integral vira ajuste fino de regime, não o motor da subida.
- Kd 3: freia na aproximação. Perto do alvo, quando ainda sobe rápido, corta mais.

Alternativa mais suave para o primeiro teste: `Kp 4 / Ki 0.15 / Kd 2`.

### Fix 2 — código, se os ganhos não bastarem

> **Aplicado em 2026-10-01** (integração condicional, banda 8 °C, teto 60), no
> firmware e no simulador. Constantes `PID_INTEGRAL_BAND_C` / `PID_INTEGRAL_MAX`
> em `include/controle.h`. O anti-windup alternativo abaixo não foi aplicado.

**Integração condicional** (elimina windup na raiz). Em `PidController.cpp:39`,
só acumula integral perto do alvo:

```cpp
if (fabsf(error) < 8.0f) {
    integral_ += g.ki * error * dt;
} else {
    integral_ = 0.0f;          // longe do alvo: só Kp+Kd levam a caldeira
}
if (integral_ < 0.0f) integral_ = 0.0f;
if (integral_ > 60.0f) integral_ = 60.0f;   // teto menor: integral não domina a saída
```

**Anti-windup alternativo** (mais simples) — congela/desfaz a integral quando a saída satura:

```cpp
float out = g.kp * error + integral_ - g.kd * dTemp;
bool saturado = (out > 100.0f) || (out < 0.0f);
if (saturado) integral_ -= g.ki * error * dt;  // desfaz o acúmulo deste tick
```

### Fix 3 — feedforward da bomba (aplicado em 2026-10-01, revisto no Fix 4)

Sintoma: extração com set 92 °C e Kp 2.5 terminou com a caldeira em ~80 °C (queda de
~12 °C em 20–30 s). Com erro > 8 °C a integral era zerada pela banda do Fix 2 e só o
proporcional respondia: `2.5 * 12 = 30 %` de duty enquanto entrava água fria.

Primeira versão: bomba ligada **e** temperatura abaixo do alvo → duty 100 %, integral
congelada. **Não funcionou em bancada:** o termopar mostra a queda 30–60 s atrasado, a
condição "abaixo do alvo" quase nunca vale durante a extração, e o feedforward não entrou
(extração de 19 s: 100,2 → 94,2 °C no fim, mas 81,2 °C um minuto depois, com a bomba já
desligada).

### Fix 4 — feedforward sem esperar o sensor + integral revista (2026-10-01)

Constantes em `include/controle.h`, lógica em `PidController.cpp` (simulador igual).

Feedforward:

- Bomba ligada **e por `PUMP_FEEDFORWARD_TAIL_MS` (15 s) depois** → duty 100 %, integral
  congelada. Não depende do termopar mostrar a queda.
- Só não entra se a caldeira estiver mais de `PUMP_FEEDFORWARD_MAX_ABOVE_C` (5 °C) acima do alvo.
- Só vale para bomba acionada pelo ESP (app/botão/perfil), que é quem seta `pumpOn`.

Integral:

- **Dentro da banda (±8 °C):** acumula normalmente.
- **Abaixo da banda:** congelada (antes era zerada) — guarda o duty de regime e ajuda a
  recuperar depois da extração. Exceção: se a temperatura subir menos de
  `PID_STALL_MIN_RISE_C` (0,5 °C) em `PID_STALL_WINDOW_MS` (10 s), acumula com o erro
  limitado à banda. Sem isso, com a integral parada só Kp aquece e a caldeira empaca onde
  `Kp * erro` = perdas (no simulador com perdas altas, Kp 2.5 parava em 79 °C).
- **Acima do alvo + `PID_INTEGRAL_RESET_ABOVE_C` (1,5 °C):** ao cruzar, a integral é
  cortada pela metade e passa a esvaziar `PID_INTEGRAL_UNWIND_GAIN` (5×) mais rápido.
  Motivo: em bancada, depois de um flush, a integral acumulou ~30 pontos na subida de
  84 → 92 °C e manteve 18–30 % de duty até 96 °C — pico de 100,8 °C (+8,8). Zerar de vez
  foi testado no simulador e faz a caldeira oscilar quando o duty de regime é alto.
  O limiar de 1,5 °C fica acima dos saltos de leitura do MAX6675 (~1 °C).

Simulador (planta sem atraso térmico, não modela a água da bomba): estabiliza em 92,0 °C
com Kp 2, 2.5 e 5 e duty de regime de 5 %, 14 % e 38 %, pico ≤ 93,4 °C.

A validar em bancada: queda na extração, pico depois da extração e recuperação após flush.

### Ordem de trabalho

1. Só ganhos `5 / 0.08 / 3`. Teste de degrau (ex.: 20 °C → 70 °C).
2. Ainda passa > 2–3 °C → aplica integração condicional + teto de 60.
3. Sobe devagar demais no fim da aproximação → afrouxa a banda pra 10 °C ou Ki 0.12.
4. Duty serrilhando rápido → baixa Kd.
5. Oscilação lenta e ampla (período de dezenas de s) → baixa Ki.

## 5. Método de sintonia do zero (Ziegler-Nichols manual)

Se quiser recomeçar limpo em vez de ajustar por tentativa:

1. Zera Ki e Kd. Só Kp.
2. Sobe Kp até a temperatura oscilar de forma sustentada em torno do alvo
   (amplitude constante). Esse Kp = `Ku`; período da oscilação = `Tu` (segundos).
3. PID clássico: `Kp = 0.6*Ku`, `Ki = 1.2*Ku/Tu`, `Kd = 0.075*Ku*Tu`.
   Versão conservadora (menos overshoot): `Kp = 0.33*Ku`, `Ki = 0.66*Ku/Tu`, `Kd = 0.11*Ku*Tu`.
4. Ajuste fino pelo teste de degrau, conforme a seção 4.

### Achados de bancada (2026-10-01)

- **Fix 2 resolveu o windup.** Acima do alvo o duty fica em 0 % (antes ficava > 0 até ~108 °C).
- **O overshoot que sobra é atraso térmico.** Depois do duty zerar, o termopar continua
  subindo por 1–2 min (até +10 °C com Kp 5). A energia já está na resistência/metal quando
  o PID enxerga. Ganho sozinho não compensa isso; Kp menor só reduz a energia "em trânsito".
- **Kd está limitado pelo ruído do MAX6675.** Degraus de 0,25 °C e saltos isolados de ~1 °C,
  derivados a cada 200 ms, viram pulsos de 2–15 % de duty com Kd 3. Subir Kd sem filtrar a
  derivada piora isso.
- **Resfriamento passivo é lento** (~1 °C/min), por isso qualquer overshoot dura minutos.

Próximos passos:

1. Partida a frio com `Kp 2.5 / Ki 0.08 / Kd 3` (o caso de uso diário) e registrar aqui.
2. Se ainda passar > 3 °C: filtrar a derivada (média móvel / EMA sobre `dTemp`) e então
   testar Kd alto (30–60) para frear antes do alvo. Paliativo sem código: alvo com offset
   (ex.: set 90 para ~92–93 real).

## 6. Log de testes

Preencher a cada rodada de bancada.

| Data | Kp | Ki | Kd | Código (fix 2?) | Tempo até 70 °C | Overshoot | Assentamento | Observações |
|------|----|----|----|-----------------|-----------------|-----------|--------------|-------------|
| 2026-08-28 | 2 | 0.5 | 0.1 | não (default) | lento | ~+7 °C | ruim (sem resf. ativo) | ponto de partida; windup |
| 2026-10-01 | 5 | 0.08 | 3 | não | — | ~+22 °C (set 88 → 110 °C após ~10 min ligada) | não assenta, precisa de flush | uso diário. Windup: integral satura em 100 na subida e só deixa o duty zerar em ~setpoint + 100/Kp ≈ 108 °C. Ganhos sozinhos não resolvem → Fix 2 |
| 2026-10-01 | 5 | 0.08 | 3 | sim (banda 8, teto 60) | — | sim.: 0 °C (antes 96,6 °C) | — | só simulador (planta sem atraso térmico); validar em bancada |
| 2026-10-01 | 5 | 0.08 | 3 | sim (banda 8, teto 60) | 28 → 92 °C em 2:58 | **+10,5 °C** (pico 102,5 °C, ~1,5 min após cruzar o alvo) | resfria ~1,2 °C/min sem flush | bancada, partida a frio, set 92. Duty caiu como esperado na aproximação (57 % @82 °C → 0 % @93,8 °C), mas a temperatura seguiu subindo ~1,5 min com duty 0 %: atraso térmico resistência → termopar |
| 2026-10-01 | 2.5 | 0.08 | 3 | sim (banda 8, teto 60) | 62 → 92 °C em ~3 min | **+6,0 °C** (pico 98,0 °C) | resfria ~0,5–1 °C/min | bancada, recuperação após flush (não é partida a frio — não comparável 1:1). Subida perto do alvo ~11 °C/min vs ~27 °C/min com Kp 5. Kp 2,5 em uso (NVS) |
| 2026-10-01 | 2.5 | 0.08 | 3 | sim (banda 8, teto 60) | — | extração: 92 → ~80 °C no fim (20–30 s) | — | bancada. PID dá só ~30 % de duty durante a extração (integral zerada pela banda). Motivou o Fix 3 (feedforward da bomba) |
| 2026-10-01 | 2.5 | 0.08 | 3 | Fix 2 + Fix 3 v1 | 38,5 → 92 °C em 3:18 | **+4,75 °C** (pico 96,75 °C) | — | bancada, partida a frio. Kp 5 a frio tinha dado +10,5 °C |
| 2026-10-01 | 2.5 | 0.08 | 3 | Fix 2 + Fix 3 v1 | recuperação 84 → 92 °C | **+8,8 °C** (pico 100,8 °C) | — | bancada, após flush. Ficou ~1,5 min presa em 84–86 °C (borda da banda, integral zerada, ~20 % de duty); dentro da banda a integral encheu ~30 e segurou 18–30 % de duty até 96 °C. Motivou o Fix 4 |
| 2026-10-01 | 2.5 | 0.08 | 3 | Fix 2 + Fix 3 v1 | — | extração 19 s: 100,2 → 94,2 °C no fim, **81,2 °C** 1 min depois | — | bancada. Feedforward não entrou (sensor atrasado, nunca abaixo do alvo com a bomba ligada). Motivou o Fix 4 |
| | | | | | | | | |
