#include "SensorMax6675.h"

#include <math.h>

SensorMax6675::SensorMax6675(uint8_t sck, uint8_t cs, uint8_t so) : dev_(sck, cs, so) {}

float SensorMax6675::read() {
    const unsigned long now = millis();
    if (lastReadMs_ != 0 && now - lastReadMs_ < kThrottleMs) {
        return everValid_ ? lastValid_ : 0.0f;
    }
    lastReadMs_ = now;

    const float c = dev_.readCelsius();
    // NAN = termopar aberto/desconectado. Fora de 0..400 °C = ruído/curto.
    if (isnan(c) || c < 0.0f || c > 400.0f) {
        // Log no máximo a cada 5 s: sem termopar isto seria dezenas de linhas/min.
        if (lastFaultLogMs_ == 0 || now - lastFaultLogMs_ >= 5000UL) {
            Serial.println(F("[temp] leitura invalida do termopar; mantendo ultimo valor"));
            lastFaultLogMs_ = now;
        }
        return everValid_ ? lastValid_ : 0.0f;
    }

    lastValid_ = c;
    lastValidMs_ = now;
    everValid_ = true;
    return c;
}

unsigned long SensorMax6675::msSinceLastValidRead() const {
    if (!everValid_) return 0xFFFFFFFFUL; // nunca leu: failsafe ativo
    return millis() - lastValidMs_;
}
