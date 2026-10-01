#pragma once

#include <Arduino.h>

// Constantes do laço de controle de temperatura (PID + SSR).
// Os ganhos Kp/Ki/Kd e o setpoint NÃO ficam aqui: vêm do DisplayModel
// (persistidos em NVS, editáveis por /api/pid e /api/setpoint/temp).

// Janela do time-proportioning do SSR. O PID entrega um duty 0-100% e o
// HeaterOutput liga/desliga o GPIO dentro desta janela. 1 s é curto o
// suficiente para não gerar ripple perceptível na caldeira (massa térmica
// alta) e longo o suficiente para não estressar o SSR com chaveamento rápido.
constexpr unsigned long SSR_WINDOW_MS = 1000UL;

// Intervalo mínimo entre cálculos do PID. Mais rápido que isso não ajuda:
// o MAX6675 só converte a ~4 Hz e a caldeira responde em dezenas de segundos.
constexpr unsigned long PID_INTERVAL_MS = 200UL;

// Anti-windup. A integral só acumula perto do alvo (|erro| < banda) e tem teto
// abaixo de 100 %. Fora da banda ela fica congelada (guarda o duty de regime e
// ajuda a recuperar depois de uma extração). Passou do alvo por mais de
// PID_INTEGRAL_RESET_ABOVE_C, ela é cortada pela metade e passa a esvaziar
// PID_INTEGRAL_UNWIND_GAIN vezes mais rápido: numa caldeira com atraso térmico
// todo calor já entregue continua empurrando a temperatura, então a integral
// não pode seguir empurrando. (Zerar de vez fazia a caldeira oscilar quando o
// duty de regime é alto.) Sem isso a integral saturava na subida e mantinha
// duty > 0 até setpoint + 100/Kp (~+20 °C com Kp 5) — ver docs/pid-calibracao.md.
// O teto precisa ficar acima do duty de regime (perdas da caldeira no alvo).
// O limiar de reset fica acima dos saltos de leitura do MAX6675 (~1 °C), senão
// ruído zera a integral parado no alvo e a caldeira cai abaixo do ponto.
constexpr float PID_INTEGRAL_BAND_C = 8.0f;
constexpr float PID_INTEGRAL_MAX = 60.0f;
constexpr float PID_INTEGRAL_RESET_ABOVE_C = 1.5f;
constexpr float PID_INTEGRAL_UNWIND_GAIN = 5.0f;

// Destrava abaixo da banda. Com a integral congelada fora da banda, só Kp
// aquece ali — no máximo Kp * banda de duty na borda (20 % com Kp 2.5). Se a
// caldeira precisar de mais que isso para subir, ela empaca abaixo do alvo.
// Então, abaixo da banda, se a temperatura subir menos que PID_STALL_MIN_RISE_C
// numa janela de PID_STALL_WINDOW_MS, a integral volta a acumular (com o erro
// limitado à banda). Na subida normal a temperatura sobe bem mais que isso e a
// integral fica parada.
constexpr unsigned long PID_STALL_WINDOW_MS = 10000UL;
constexpr float PID_STALL_MIN_RISE_C = 0.5f;

// Feedforward da bomba. Com a bomba ligada (extração/flush) entra água fria na
// caldeira, e o termopar só mostra a queda 30–60 s depois — em bancada a
// temperatura seguiu caindo 13 °C depois da bomba desligar. Esperar o erro
// aparecer é tarde demais. Então, com a bomba ligada e por
// PUMP_FEEDFORWARD_TAIL_MS depois dela desligar, o duty vai direto para
// PUMP_FEEDFORWARD_DUTY e a integral fica congelada. Só não entra se a caldeira
// já estiver mais de PUMP_FEEDFORWARD_MAX_ABOVE_C acima do alvo. Os failsafes
// continuam valendo.
constexpr float PUMP_FEEDFORWARD_DUTY = 100.0f;
constexpr float PUMP_FEEDFORWARD_MAX_ABOVE_C = 5.0f;
constexpr unsigned long PUMP_FEEDFORWARD_TAIL_MS = 15000UL;

// Failsafe 1: se a última leitura VÁLIDA do termopar for mais antiga que isto
// (sensor aberto/congelado), o PID força duty 0% — não sustenta o SSR ligado
// com base num valor que já não reflete a realidade.
constexpr unsigned long SENSOR_FAULT_TIMEOUT_MS = 10000UL;

// Failsafe 2: teto de segurança. Acima disto o duty é forçado a 0%
// independentemente do PID. O fusível físico da linha AC é a última camada.
constexpr float TEMP_MAX_SAFETY_C = 115.0f;

// Modo vaporização (app liga via PUT /api/steam {on:true}). Enquanto ativo o
// PID mira o alvo de vapor (DisplayModel::steamSetpoint_) em vez do setpoint de
// café — sem gravar NVS. Ao desligar, o firmware devolve o setpoint de café
// para TEMP_BREW_DEFAULT_C (decisão de produto: "sempre volta pra 70", ver
// DisplayModel::tempSetpoint_).
constexpr float TEMP_STEAM_C = 90.0f; // default do alvo de vapor (não persiste)
constexpr float TEMP_BREW_DEFAULT_C = 70.0f;

// Faixa aceita para o alvo de vapor editável (PUT /api/steam {temp}). Teto = o
// próprio teto de segurança; piso evita "vapor" que quase não gera vapor.
constexpr float TEMP_STEAM_MIN_C = 80.0f;
constexpr float TEMP_STEAM_MAX_C = TEMP_MAX_SAFETY_C;

// Relé "temperatura pronta" (PIN_READY). Histerese em torno do alvo efetivo do
// PID (café ou vapor): fecha o relé quando a caldeira encosta no alvo, só abre
// se cair além da margem maior. Banda de 3 °C evita o relé bater ("chatter")
// perto do limiar. Sensor em falha força o relé aberto.
constexpr float READY_ON_MARGIN_C = 1.0f;  // liga: temp >= alvo - 1
constexpr float READY_OFF_MARGIN_C = 4.0f; // desliga: temp < alvo - 4

// Nível lógico que liga o SSR de aquecimento (ver pinos.h — a confirmar em bancada).
#define ACTUATOR_ON HIGH
#define ACTUATOR_OFF LOW
