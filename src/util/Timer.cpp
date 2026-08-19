#include "Timer.h"

#include <stdio.h>

void Timer::start() {
    if (running_) return;
    running_ = true;
    startMs_ = millis();
}

void Timer::stop() {
    if (!running_) return;
    accumulatedMs_ += millis() - startMs_;
    running_ = false;
}

void Timer::toggle() {
    if (running_) {
        stop();
    } else {
        start();
    }
}

void Timer::reset() {
    running_ = false;
    accumulatedMs_ = 0;
    startMs_ = 0;
}

unsigned long Timer::elapsedMs() const {
    if (!running_) return accumulatedMs_;
    return accumulatedMs_ + (millis() - startMs_);
}

void Timer::format(char *buf, size_t bufLen) const {
    unsigned long totalSec = elapsedMs() / 1000;
    unsigned long hh = totalSec / 3600;
    unsigned long mm = (totalSec % 3600) / 60;
    unsigned long ss = totalSec % 60;

    if (hh > 0) {
        snprintf(buf, bufLen, "%lu:%02lu:%02lu", hh, mm, ss);
    } else {
        snprintf(buf, bufLen, "%02lu:%02lu", mm, ss);
    }
}
