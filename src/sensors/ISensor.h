#pragma once

// Interface virtual pura para sensores. Épicos futuros trocam SensorFake por
// implementação real sem alterar model/ui.
class ISensor {
public:
    virtual ~ISensor() = default;
    virtual float read() = 0;
};
