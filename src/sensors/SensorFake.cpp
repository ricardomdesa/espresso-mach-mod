#include "SensorFake.h"

#include <Arduino.h>
#include <math.h>

SensorFake::SensorFake(float center, float amplitude, float periodMs)
    : center_(center), amplitude_(amplitude), periodMs_(periodMs) {}

float SensorFake::read() {
    float phase = (millis() % (unsigned long)periodMs_) / periodMs_;
    return center_ + amplitude_ * sinf(phase * 2.0f * PI);
}
