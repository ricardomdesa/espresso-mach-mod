#pragma once

#include "ISensor.h"

// Decorator ISensor: aplica calibração linear sobre outro sensor.
//   valor = bruto * ganho + offset
// Mantém o sensor de baixo (ex.: SensorMax6675) sem conhecer calibração,
// e serve para qualquer troca futura de chip.
class SensorCalibrated : public ISensor {
public:
    SensorCalibrated(ISensor &inner, float offset, float gain);

    float read() override;

private:
    ISensor &inner_;
    float offset_;
    float gain_;
};
