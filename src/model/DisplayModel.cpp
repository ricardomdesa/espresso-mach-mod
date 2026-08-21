#include "DisplayModel.h"

#include <math.h>
#include <string.h>

namespace {
// Margem para considerar a caldeira "em temperatura".
constexpr float kTempToleranceC = 2.0f;
} // namespace

DisplayModel::DisplayModel(ISensor &tempSensor, ISensor &pressureSensor)
    : tempSensor_(tempSensor), pressureSensor_(pressureSensor) {}

void DisplayModel::update() {
    tempCurrent_ = tempSensor_.read();
    pressureCurrent_ = pressureSensor_.read();
}

void DisplayModel::setActiveProfileId(const char *id) {
    if (id == nullptr) {
        activeProfileId_[0] = '\0';
        return;
    }
    strncpy(activeProfileId_, id, sizeof(activeProfileId_) - 1);
    activeProfileId_[sizeof(activeProfileId_) - 1] = '\0';
}

MachineMode DisplayModel::mode() const {
    if (timer_.isRunning()) {
        return MachineMode::Extracting;
    }
    if (fabsf(tempCurrent_ - tempSetpoint_) > kTempToleranceC) {
        return MachineMode::Heating;
    }
    return MachineMode::Idle;
}
