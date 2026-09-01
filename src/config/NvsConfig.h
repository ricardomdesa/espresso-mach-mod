#pragma once

#include <Arduino.h>
#include <Preferences.h>

#include "model/DisplayModel.h"

// Persistência em NVS (épico 6, D6): credencial de Wi-Fi, setpoints, ganhos
// do PID e perfis de extração. No primeiro boot os defaults do model são
// gravados, então o comportamento não muda em relação ao MVP.
//
// Os perfis são guardados como um blob JSON único (array). Simplifica o CRUD
// e cabe folgado no limite de 4000 bytes por entrada da NVS.
class NvsConfig {
public:
    static constexpr size_t kProfilesJsonCapacity = 3072;

    void begin();

    // --- Credencial de Wi-Fi ---
    bool hasWifiCredentials();
    // Copia o SSID salvo para `out`. Retorna false se não houver credencial.
    bool loadWifiSsid(char *out, size_t outLen);
    bool loadWifiPassword(char *out, size_t outLen);
    void saveWifiCredentials(const char *ssid, const char *password);
    void clearWifiCredentials();

    // One-shot "abrir AP no boot" (hold do botão). O boot lê e limpa.
    bool consumeForceAp();
    void setForceAp();

    // --- Controle (setpoints + PID) ---
    // Carrega para o model; grava os defaults do model se a NVS estiver vazia.
    void loadControl(DisplayModel &model);
    void saveTempSetpoint(float v);
    void savePressureSetpoint(float v);
    void savePid(const PidGains &g);
    void saveActiveProfileId(const char *id);

    // --- Perfis de extração (blob JSON) ---
    // Copia o array JSON de perfis para `out`; devolve "[]" se vazio.
    void loadProfilesJson(char *out, size_t outLen);
    void saveProfilesJson(const char *json);

    // Contador monotônico persistido para IDs de perfil: millis() reinicia a
    // cada boot e colidiria com IDs já usados, quebrando PUT/DELETE por ID.
    uint32_t nextProfileId();

    // Restaura tudo para os valores de fábrica (inclusive Wi-Fi). A chave da
    // API não vive aqui: é fixa, compilada no firmware (API_AUTH_KEY).
    void factoryReset();

private:
    Preferences prefs_;
    bool open(bool readOnly);
    void close();
};
