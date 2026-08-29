#include "SensorCalibrated.h"

SensorCalibrated::SensorCalibrated(ISensor &inner, float offset, float gain)
    : inner_(inner), offset_(offset), gain_(gain) {}

float SensorCalibrated::read() {
    return inner_.read() * gain_ + offset_;
}
