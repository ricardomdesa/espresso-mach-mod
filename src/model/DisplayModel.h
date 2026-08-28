#pragma once

#include "sensors/ISensor.h"
#include "util/Timer.h"

// Estado operacional publicado na API (campo "state"). Enquanto os épicos 2-4
// não entregam o PID real, é derivado do cronômetro e do erro de temperatura.
enum class MachineMode : uint8_t {
    Idle,
    Heating,
    Preheating, // aquecendo até o setpoint antes de rodar os passos de um perfil
    Steaming,   // modo vaporização: PID mirando TEMP_STEAM_C
    Extracting,
    Error,
};

// Ganhos do PID de temperatura. Editáveis pela API, persistidos em NVS.
struct PidGains {
    float kp;
    float ki;
    float kd;
};

// Fonte única de dados da máquina. Épicos 2-4 alimentam este model; a API e o
// main leem daqui, nunca dos sensores diretamente (N1).
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

    // Alvo efetivo que o PID persegue: TEMP_STEAM_C quando o modo vaporização
    // está ligado, senão o setpoint de café. Definido no .cpp (usa controle.h).
    float tempTarget() const;

    // Modo vaporização: o ApiServer liga/desliga via PUT /api/steam. Não é
    // persistido — desligado no boot. Ao desligar, o ApiServer devolve
    // tempSetpoint_ para TEMP_BREW_DEFAULT_C.
    bool steaming() const { return steaming_; }
    void setSteaming(bool on) { steaming_ = on; }

    const PidGains &pid() const { return pid_; }
    void setPid(const PidGains &g) { pid_ = g; }

    // Perfil de extração ativo (id vazio = nenhum).
    const char *activeProfileId() const { return activeProfileId_; }
    void setActiveProfileId(const char *id);

    // Ciclo de perfil pediu aquecimento antes de rodar os passos. O ApiServer
    // liga/desliga este flag; mode() o reporta como Preheating.
    bool preheating() const { return preheating_; }
    void setPreheating(bool on) { preheating_ = on; }

    // LED de iluminação: estado lógico da luz. O clique curto do botão físico e
    // a API (PUT /api/led) escrevem aqui; o main espelha no GPIO. Não é
    // persistido — ligado no boot.
    bool lightOn() const { return lightOn_; }
    void setLightOn(bool on) { lightOn_ = on; }

    // Bomba: estado lógico do relé (GPIO0). A API escreve aqui — manualmente
    // (PUT /api/pump) ou pelo ciclo de extração (start liga, stop desliga); o
    // main espelha no GPIO. Não é persistido — desligada no boot.
    bool pumpOn() const { return pumpOn_; }
    void setPumpOn(bool on) { pumpOn_ = on; }

    MachineMode mode() const;

    Timer &timer() { return timer_; }
    const Timer &timer() const { return timer_; }

private:
    ISensor &tempSensor_;
    ISensor &pressureSensor_;

    float tempCurrent_ = 0.0f;
    float tempSetpoint_ = 70.0f;    // default de fábrica; NVS sobrescreve
                                    // 70 C = leitura do termopar na parede
                                    // externa da caldeira (sem contato com a
                                    // agua) quando o termostato original corta.
                                    // Vaporizacao: subir p/ ~90 C via API/perfil.
    float pressureCurrent_ = 0.0f;
    float pressureSetpoint_ = 9.0f; // default de fábrica; NVS sobrescreve

    PidGains pid_{2.0f, 0.5f, 0.1f}; // defaults de fábrica

    char activeProfileId_[24] = {0};

    bool lightOn_ = true;  // ligado no boot; app/botão alternam depois
    bool pumpOn_ = false;  // relé da bomba; desligado no boot
    bool preheating_ = false; // ciclo de perfil aguardando temperatura
    bool steaming_ = false;   // modo vaporização (PID mira TEMP_STEAM_C)

    Timer timer_;
};
