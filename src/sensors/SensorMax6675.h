#pragma once

#include <Arduino.h>
#include <max6675.h>

#include "ISensor.h"

// Adapter ISensor sobre o MAX6675 (termopar tipo K, SPI bit-bang).
//
// - throttle de 250 ms: o chip converte a ~4 Hz; chamadas mais frequentes
//   devolvem o valor em cache sem tocar no barramento.
// - falha (termopar aberto -> readCelsius() = NAN, ou valor absurdo): mantém a
//   última leitura válida e loga no Serial, sem propagar NAN para a UI/PID.
// - msSinceLastValidRead(): usado pelo failsafe do PID (não sustentar o SSR
//   ligado com base numa leitura congelada).
class SensorMax6675 : public ISensor {
public:
    SensorMax6675(uint8_t sck, uint8_t cs, uint8_t so);

    float read() override;

    // Tempo desde a última leitura REAL válida. Antes da primeira, devolve um
    // valor grande de propósito (failsafe ativo até o termopar responder).
    unsigned long msSinceLastValidRead() const;

private:
    MAX6675 dev_;
    float lastValid_ = NAN;
    unsigned long lastReadMs_ = 0;
    unsigned long lastValidMs_ = 0;
    unsigned long lastFaultLogMs_ = 0;
    bool everValid_ = false;

    static constexpr unsigned long kThrottleMs = 250UL;
};
