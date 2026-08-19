#include "Button.h"

Button::Button(uint8_t pin, unsigned long debounceMs, unsigned long longPressMs)
    : pin_(pin), debounceMs_(debounceMs), longPressMs_(longPressMs) {}

void Button::begin() {
    pinMode(pin_, INPUT_PULLUP);
    stableState_ = digitalRead(pin_);
    lastReading_ = stableState_;
    lastChangeMs_ = millis();
}

void Button::update() {
    clicked_ = false;
    longPressed_ = false;

    int reading = digitalRead(pin_);
    unsigned long now = millis();

    if (reading != lastReading_) {
        lastReading_ = reading;
        lastChangeMs_ = now;
    }

    if ((now - lastChangeMs_) >= debounceMs_ && reading != stableState_) {
        stableState_ = reading;

        if (stableState_ == LOW) {
            // Botão pressionado.
            pressStartMs_ = now;
            longPressFired_ = false;
        } else {
            // Botão solto: click só conta se long press não disparou antes.
            if (!longPressFired_) {
                clicked_ = true;
            }
        }
    }

    if (stableState_ == LOW && !longPressFired_ &&
        (now - pressStartMs_) >= longPressMs_) {
        longPressFired_ = true;
        longPressed_ = true;
    }
}
