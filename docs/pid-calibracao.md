# Calibração do PID de temperatura

Estudo de referência para o ajuste fino de Kp/Ki/Kd da caldeira.
Data de partida: 2026-08-28. Status: **em teste de bancada.**

## 1. Como o laço funciona

Arquivos: `src/control/PidController.cpp`, `include/controle.h`, `src/model/DisplayModel.h`.

- `PidController::update()` roda a cada `PID_INTERVAL_MS` (200 ms).
- Lê `temp = model_.tempCurrent()` e `sp = model_.tempTarget()`
  (setpoint de café, ou `TEMP_STEAM_C = 90` quando o modo vaporização está ligado).
- `error = sp - temp`.
- Saída: `duty` 0–100 %. O `HeaterOutput` faz time-proportioning numa janela de
  `SSR_WINDOW_MS` (1 s) e liga/desliga o GPIO do SSR.

Fórmula (`PidController.cpp:47`):

```
out = Kp*error + integral - Kd*dTemp
```

- `integral += Ki*error*dt`, clampada hoje em `0..100` (`PidController.cpp:39-41`).
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

`src/model/DisplayModel.h:107` — `PidGains pid_{2.0f, 0.5f, 0.1f}`.
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

## 6. Log de testes

Preencher a cada rodada de bancada.

| Data | Kp | Ki | Kd | Código (fix 2?) | Tempo até 70 °C | Overshoot | Assentamento | Observações |
|------|----|----|----|-----------------|-----------------|-----------|--------------|-------------|
| 2026-08-28 | 2 | 0.5 | 0.1 | não (default) | lento | ~+7 °C | ruim (sem resf. ativo) | ponto de partida; windup |
| | | | | | | | | |
