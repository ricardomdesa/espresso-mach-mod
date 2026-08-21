#pragma once

#include "sensors/ISensor.h"
#include "util/Timer.h"

// Estado operacional publicado na API (campo "state"). Enquanto os épicos 2-4
// não entregam o PID real, é derivado do cronômetro e do erro de temperatura.
enum class MachineMode : uint8_t {
    Idle,
    Heating,
    Extracting,
    Error,
};

// Ganhos do PID de temperatura. Editáveis pela API, persistidos em NVS.
struct PidGains {
    float kp;
    float ki;
    float kd;
};

// Estado de rede exibido no OLED (sem depender da pilha de rede na UI).
enum class NetworkStatus : uint8_t {
    Offline,      // sem conexão: máquina offline ou aguardando hold do botão
    StaConnected, // STA conectado na rede do usuário (normal)
    ApActive,     // modo de configuração (AP no ar)
};

// Fonte única de dados da UI. Épicos 2-4 alimentam este model; a UI nunca
// lê sensores diretamente (N1).
class DisplayModel {
public:
    DisplayModel(ISensor &tempSensor, ISensor &pressureSensor);

    void update();

    float tempCurrent() const { return tempCurrent_; }
    float tempSetpoint() const { return tempSetpoint_; }
    float pressureCurrent() const { return pressureCurrent_; }
    float pressureSetpoint() const { return pressureSetpoint_; }

    void setTempSetpoint(float v) { tempSetpoint_ = v; }
    void setPressureSetpoint(float v) { pressureSetpoint_ = v; }

    const PidGains &pid() const { return pid_; }
    void setPid(const PidGains &g) { pid_ = g; }

    // Perfil de extração ativo (id vazio = nenhum).
    const char *activeProfileId() const { return activeProfileId_; }
    void setActiveProfileId(const char *id);

    // Rede (para o indicador do OLED). Preenchido pelo main, nunca pela UI.
    NetworkStatus networkStatus() const { return networkStatus_; }
    void setNetworkStatus(NetworkStatus s) { networkStatus_ = s; }

    MachineMode mode() const;

    Timer &timer() { return timer_; }
    const Timer &timer() const { return timer_; }

private:
    ISensor &tempSensor_;
    ISensor &pressureSensor_;

    float tempCurrent_ = 0.0f;
    float tempSetpoint_ = 93.0f;    // default de fábrica; NVS sobrescreve
    float pressureCurrent_ = 0.0f;
    float pressureSetpoint_ = 9.0f; // default de fábrica; NVS sobrescreve

    PidGains pid_{2.0f, 0.5f, 0.1f}; // defaults de fábrica

    char activeProfileId_[24] = {0};

    NetworkStatus networkStatus_ = NetworkStatus::Offline;

    Timer timer_;
};
