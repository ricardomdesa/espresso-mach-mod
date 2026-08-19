#include "ScreenManager.h"

ScreenManager::ScreenManager(const Screen *screens, size_t count)
    : screens_(screens), count_(count) {}

void ScreenManager::next() {
    index_ = (index_ + 1) % count_;
}

void ScreenManager::draw(Adafruit_SSD1306 &display, const DisplayModel &model) const {
    screens_[index_].draw(display, model);
}
