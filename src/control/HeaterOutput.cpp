#include "HeaterOutput.h"

#include "controle.h"

HeaterOutput::HeaterOutput(uint8_t pin) : pin_(pin) {}

void HeaterOutput::begin() {
    pinMode(pin_, OUTPUT);
    digitalWrite(pin_, ACTUATOR_OFF);
    applied_ = 0;
    windowStartMs_ = millis();
}

void HeaterOutput::update(float dutyPct) {
    const unsigned long now = millis();

    // Avança a janela (recomeça exatamente no múltiplo, não em "now", pra não
    // acumular deriva se o loop atrasar).
    if (now - windowStartMs_ >= SSR_WINDOW_MS) {
        windowStartMs_ += SSR_WINDOW_MS * ((now - windowStartMs_) / SSR_WINDOW_MS);
    }

    if (dutyPct < 0.0f) dutyPct = 0.0f;
    if (dutyPct > 100.0f) dutyPct = 100.0f;
    const unsigned long onMs =
        static_cast<unsigned long>((dutyPct / 100.0f) * SSR_WINDOW_MS);

    const bool on = (now - windowStartMs_) < onMs;
    const int want = on ? ACTUATOR_ON : ACTUATOR_OFF;
    if (want != applied_) {
        digitalWrite(pin_, want);
        applied_ = want;
    }
}
