#pragma once

#include "sensors/ISensor.h"
#include "util/Timer.h"

// Fonte única de dados da UI. Épicos 2-4 alimentam este model; a UI nunca
// lê sensores diretamente (N1).
class DisplayModel {
public:
    DisplayModel(ISensor &tempSensor, ISensor &pressureSensor);

    void update();

    float tempCurrent() const { return tempCurrent_; }
    float tempSetpoint() const { return tempSetpoint_; }
    float pressureCurrent() const { return pressureCurrent_; }
    float pressureSetpoint() const { return pressureSetpoint_; }

    Timer &timer() { return timer_; }
    const Timer &timer() const { return timer_; }

private:
    ISensor &tempSensor_;
    ISensor &pressureSensor_;

    float tempCurrent_ = 0.0f;
    float tempSetpoint_ = 93.0f;    // placeholder MVP, sem edição (não-objetivo)
    float pressureCurrent_ = 0.0f;
    float pressureSetpoint_ = 9.0f; // placeholder MVP, sem edição (não-objetivo)

    Timer timer_;
};
