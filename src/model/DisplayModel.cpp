#include "DisplayModel.h"

DisplayModel::DisplayModel(ISensor &tempSensor, ISensor &pressureSensor)
    : tempSensor_(tempSensor), pressureSensor_(pressureSensor) {}

void DisplayModel::update() {
    tempCurrent_ = tempSensor_.read();
    pressureCurrent_ = pressureSensor_.read();
}
