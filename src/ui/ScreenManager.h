#pragma once

#include <Adafruit_SSD1306.h>

#include "model/DisplayModel.h"

using DrawFn = void (*)(Adafruit_SSD1306 &, const DisplayModel &);

struct Screen {
    DrawFn draw;
};

// Array estático de telas, índice global, sem alocação dinâmica (D2).
class ScreenManager {
public:
    ScreenManager(const Screen *screens, size_t count);

    void next();
    void draw(Adafruit_SSD1306 &display, const DisplayModel &model) const;

    size_t index() const { return index_; }

private:
    const Screen *screens_;
    size_t count_;
    size_t index_ = 0;
};
