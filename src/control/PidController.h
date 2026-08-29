#pragma once

#include <Arduino.h>

#include "model/DisplayModel.h"
#include "sensors/SensorMax6675.h"

// PID posicional de temperatura. Roda continuamente desde o boot (a caldeira
// de espresso fica sempre quente). Lê o estado do DisplayModel — temperatura
// calibrada, setpoint e ganhos Kp/Ki/Kd — a cada cálculo, então mudanças por
// /api/pid e /api/setpoint/temp valem na hora.
//
// Só aquece: a saída e o termo integral são limitados a 0..100 %. Derivada
// calculada sobre a medição (não sobre o erro), para não dar chute quando o
// setpoint muda (ex.: início do preheat de um perfil).
//
// Dois failsafes forçam duty 0 %:
//  - leitura do termopar parada há mais de SENSOR_FAULT_TIMEOUT_MS;
//  - temperatura acima de TEMP_MAX_SAFETY_C.
class PidController {
public:
    PidController(DisplayModel &model, SensorMax6675 &tempRaw);

    void update();

    // Zera o estado interno (integral, derivada, duty, marca de tempo). Chamar
    // ao retomar o controle depois de uma pausa longa — ex.: sair do modo AP,
    // onde o loop fica segundos sem rodar — para a próxima passada não calcular
    // a derivada com um dt gigante.
    void reset();

    // Duty calculado (0..100 %). Consumido pelo HeaterOutput.
    float duty() const { return duty_; }

private:
    DisplayModel &model_;
    SensorMax6675 &tempRaw_;

    float duty_ = 0.0f;
    float integral_ = 0.0f;
    float lastTemp_ = 0.0f;
    unsigned long lastMs_ = 0;
};
