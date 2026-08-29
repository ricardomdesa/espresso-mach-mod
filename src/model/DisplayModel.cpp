#include "DisplayModel.h"

#include <math.h>
#include <string.h>

#include "controle.h"

namespace {
// Margem para considerar a caldeira "em temperatura".
constexpr float kTempToleranceC = 2.0f;
} // namespace

DisplayModel::DisplayModel(ISensor &tempSensor, ISensor &pressureSensor)
    : tempSensor_(tempSensor), pressureSensor_(pressureSensor) {}

void DisplayModel::update() {
    tempCurrent_ = tempSensor_.read();
    pressureCurrent_ = pressureSensor_.read();

    // Relé "temperatura pronta" com histerese em torno do alvo efetivo. O
    // sensorAgeMs_ vem do main (leitura do loop anterior — defasagem de um
    // ciclo, irrelevante). Sensor em falha derruba o relé.
    const float target = tempTarget();
    if (sensorAgeMs_ >= SENSOR_FAULT_TIMEOUT_MS) {
        ready_ = false;
    } else if (tempCurrent_ >= target - READY_ON_MARGIN_C) {
        ready_ = true;
    } else if (tempCurrent_ < target - READY_OFF_MARGIN_C) {
        ready_ = false;
    }
}

void DisplayModel::setActiveProfileId(const char *id) {
    if (id == nullptr) {
        activeProfileId_[0] = '\0';
        return;
    }
    strncpy(activeProfileId_, id, sizeof(activeProfileId_) - 1);
    activeProfileId_[sizeof(activeProfileId_) - 1] = '\0';
}

float DisplayModel::tempTarget() const {
    return steaming_ ? TEMP_STEAM_C : tempSetpoint_;
}

MachineMode DisplayModel::mode() const {
    if (timer_.isRunning()) {
        return MachineMode::Extracting;
    }
    if (preheating_) {
        return MachineMode::Preheating;
    }
    if (steaming_) {
        return MachineMode::Steaming;
    }
    // Só "aquecendo" quando de fato abaixo do alvo (SSR trabalhando). Acima do
    // alvo a caldeira está só coasting pra baixo — reporta Idle, não Heating.
    if (tempCurrent_ < tempTarget() - kTempToleranceC) {
        return MachineMode::Heating;
    }
    return MachineMode::Idle;
}
