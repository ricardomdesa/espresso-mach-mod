#pragma once

#include <Arduino.h>

// Cronômetro de extração: start/stop/reset, formatação MM:SS (ou H:MM:SS
// acima de 59 minutos).
class Timer {
public:
    void start();
    void stop();
    void toggle();
    void reset();

    bool isRunning() const { return running_; }
    unsigned long elapsedMs() const;

    // Preenche buf (mín. 12 bytes) com "MM:SS" ou "H:MM:SS".
    void format(char *buf, size_t bufLen) const;

private:
    bool running_ = false;
    unsigned long startMs_ = 0;
    unsigned long accumulatedMs_ = 0;
};
