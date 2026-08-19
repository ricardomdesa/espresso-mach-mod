#pragma once

#include <Arduino.h>

// Debounce por tempo + detecção de click / long_press.
// Botão ativo em LOW (pull-up interno, ligado ao GND).
class Button {
public:
    explicit Button(uint8_t pin, unsigned long debounceMs = 50,
                     unsigned long longPressMs = 1000);

    void begin();
    void update();

    // Verdadeiro por um ciclo de update() após soltar o botão (click curto).
    bool clicked() const { return clicked_; }

    // Verdadeiro por um ciclo de update() ao atingir o limiar de long press.
    bool longPressed() const { return longPressed_; }

private:
    uint8_t pin_;
    unsigned long debounceMs_;
    unsigned long longPressMs_;

    int stableState_ = HIGH;
    int lastReading_ = HIGH;
    unsigned long lastChangeMs_ = 0;
    unsigned long pressStartMs_ = 0;

    bool longPressFired_ = false;
    bool clicked_ = false;
    bool longPressed_ = false;
};
