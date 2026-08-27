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

// Failsafe 1: se a última leitura VÁLIDA do termopar for mais antiga que isto
// (sensor aberto/congelado), o PID força duty 0% — não sustenta o SSR ligado
// com base num valor que já não reflete a realidade.
constexpr unsigned long SENSOR_FAULT_TIMEOUT_MS = 10000UL;

// Failsafe 2: teto de segurança. Acima disto o duty é forçado a 0%
// independentemente do PID. O fusível físico da linha AC é a última camada.
constexpr float TEMP_MAX_SAFETY_C = 130.0f;

// Nível lógico que liga o SSR de aquecimento (ver pinos.h — a confirmar em bancada).
#define ACTUATOR_ON HIGH
#define ACTUATOR_OFF LOW
