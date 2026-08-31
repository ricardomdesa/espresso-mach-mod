#include "PidController.h"

#include "controle.h"

PidController::PidController(DisplayModel &model, SensorMax6675 &tempRaw)
    : model_(model), tempRaw_(tempRaw) {}

void PidController::reset() {
    duty_ = 0.0f;
    integral_ = 0.0f;
    lastTemp_ = 0.0f;
    lastMs_ = 0; // força a próxima passada a só semear o estado
}

void PidController::update() {
    const unsigned long now = millis();
    if (lastMs_ != 0 && now - lastMs_ < PID_INTERVAL_MS) return;

    const float temp = model_.tempCurrent();

    // Primeira passada: só semeia o estado, sem calcular derivada com dt errado.
    if (lastMs_ == 0) {
        lastMs_ = now;
        lastTemp_ = temp;
        return;
    }

    const float dt = (now - lastMs_) / 1000.0f;
    lastMs_ = now;

    // Failsafes: leitura congelada ou sobretemperatura -> desliga e zera a integral.
    if (tempRaw_.msSinceLastValidRead() > SENSOR_FAULT_TIMEOUT_MS ||
        temp > TEMP_MAX_SAFETY_C) {
        duty_ = 0.0f;
        integral_ = 0.0f;
        lastTemp_ = temp;
        return;
    }

    const float sp = model_.tempTarget(); // TEMP_STEAM_C se vaporização ligada
    const PidGains g = model_.pid();

    const float error = sp - temp;

    // Integral com anti-windup: clampada ao próprio range de saída.
    integral_ += g.ki * error * dt;
    if (integral_ < 0.0f) integral_ = 0.0f;
    if (integral_ > 100.0f) integral_ = 100.0f;

    // Derivada sobre a medição (sinal invertido em relação à derivada do erro).
    const float dTemp = (temp - lastTemp_) / dt;
    lastTemp_ = temp;

    float out = g.kp * error + integral_ - g.kd * dTemp;
    if (out < 0.0f) out = 0.0f;
    if (out > 100.0f) out = 100.0f;
    duty_ = out;
}
