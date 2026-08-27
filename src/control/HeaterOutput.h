#pragma once

#include <Arduino.h>

// Time-proportioning do SSR de aquecimento: recebe um duty 0..100 % e liga/
// desliga o GPIO dentro de uma janela fixa (SSR_WINDOW_MS), via millis(),
// sem delay(). O SSR já faz o chaveamento fino no zero-cross da rede; aqui só
// se decide "ligado ou desligado" a cada instante da janela.
class HeaterOutput {
public:
    explicit HeaterOutput(uint8_t pin);

    void begin(); // pinMode + desliga

    void update(float dutyPct);

private:
    uint8_t pin_;
    unsigned long windowStartMs_ = 0;
    int applied_ = -1; // -1 = ainda não escrito; força o primeiro digitalWrite
};
