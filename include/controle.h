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
constexpr float TEMP_MAX_SAFETY_C = 115.0f;

// Modo vaporização (app liga via PUT /api/steam {on:true}). Enquanto ativo o
// PID mira TEMP_STEAM_C em vez do setpoint de café — sem gravar NVS. Ao
// desligar, o firmware devolve o setpoint para TEMP_BREW_DEFAULT_C (decisão de
// produto: "sempre volta pra 70", ver DisplayModel::tempSetpoint_).
constexpr float TEMP_STEAM_C = 90.0f;
constexpr float TEMP_BREW_DEFAULT_C = 70.0f;

// Relé "temperatura pronta" (PIN_READY). Histerese em torno do alvo efetivo do
// PID (café ou vapor): fecha o relé quando a caldeira encosta no alvo, só abre
// se cair além da margem maior. Banda de 3 °C evita o relé bater ("chatter")
// perto do limiar. Sensor em falha força o relé aberto.
constexpr float READY_ON_MARGIN_C = 1.0f;  // liga: temp >= alvo - 1
constexpr float READY_OFF_MARGIN_C = 4.0f; // desliga: temp < alvo - 4

// Nível lógico que liga o SSR de aquecimento (ver pinos.h — a confirmar em bancada).
#define ACTUATOR_ON HIGH
#define ACTUATOR_OFF LOW
