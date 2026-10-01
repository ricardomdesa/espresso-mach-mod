#include "PidController.h"

#include "controle.h"

PidController::PidController(DisplayModel &model, SensorMax6675 &tempRaw)
    : model_(model), tempRaw_(tempRaw) {}

void PidController::reset() {
    duty_ = 0.0f;
    integral_ = 0.0f;
    lastTemp_ = 0.0f;
    lastPumpOnMs_ = 0;
    stallRefMs_ = 0;
    stalled_ = false;
    wasAbove_ = false;
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

    // Feedforward da bomba: água fria entrando, aquece já em vez de esperar o
    // termopar (atrasado) mostrar a queda. Vale com a bomba ligada e por um
    // rabo de PUMP_FEEDFORWARD_TAIL_MS depois; não entra se a caldeira já
    // estiver bem acima do alvo.
    if (model_.pumpOn()) lastPumpOnMs_ = now;
    const bool pumpRecent =
        lastPumpOnMs_ != 0 && now - lastPumpOnMs_ < PUMP_FEEDFORWARD_TAIL_MS;
    const bool feedforward = pumpRecent && error > -PUMP_FEEDFORWARD_MAX_ABOVE_C;

    // Integral (anti-windup, ver controle.h): acumula dentro da banda; abaixo
    // dela fica congelada, salvo se a temperatura empacou; passou do alvo,
    // esvazia rápido. Congelada durante o feedforward.
    if (stallRefMs_ == 0 || now - stallRefMs_ >= PID_STALL_WINDOW_MS) {
        stalled_ = stallRefMs_ != 0 && temp - stallRefTemp_ < PID_STALL_MIN_RISE_C;
        stallRefMs_ = now;
        stallRefTemp_ = temp;
    }
    // Passou do alvo: corta a integral pela metade ao cruzar e depois esvazia
    // PID_INTEGRAL_UNWIND_GAIN vezes mais rápido que o normal.
    const bool above = error < -PID_INTEGRAL_RESET_ABOVE_C;
    if (above && !wasAbove_) integral_ *= 0.5f;
    wasAbove_ = above;
    if (above) {
        if (!feedforward) integral_ += g.ki * error * dt * PID_INTEGRAL_UNWIND_GAIN;
    } else if (!feedforward) {
        if (fabsf(error) < PID_INTEGRAL_BAND_C) {
            integral_ += g.ki * error * dt;
        } else if (stalled_) {
            integral_ += g.ki * PID_INTEGRAL_BAND_C * dt;
        }
    }
    if (integral_ < 0.0f) integral_ = 0.0f;
    if (integral_ > PID_INTEGRAL_MAX) integral_ = PID_INTEGRAL_MAX;

    // Derivada sobre a medição (sinal invertido em relação à derivada do erro).
    const float dTemp = (temp - lastTemp_) / dt;
    lastTemp_ = temp;

    float out = g.kp * error + integral_ - g.kd * dTemp;
    if (out < 0.0f) out = 0.0f;
    if (out > 100.0f) out = 100.0f;
    if (feedforward && out < PUMP_FEEDFORWARD_DUTY) out = PUMP_FEEDFORWARD_DUTY;
    duty_ = out;
}
