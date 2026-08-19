#pragma once

#include "ISensor.h"

// Fake de sensor: valor oscila suavemente (seno) em torno de um centro,
// para validação visual do display sem hardware de sensores.
class SensorFake : public ISensor {
public:
    SensorFake(float center, float amplitude, float periodMs);

    float read() override;

private:
    float center_;
    float amplitude_;
    float periodMs_;
};
