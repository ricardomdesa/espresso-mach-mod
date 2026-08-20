#include "NvsConfig.h"

#include <string.h>

namespace {

// Namespace da NVS. Chaves têm limite de 15 caracteres.
constexpr const char *kNamespace = "philco";

constexpr const char *kKeyWifiSsid = "wifi_ssid";
constexpr const char *kKeyWifiPass = "wifi_pass";
constexpr const char *kKeyTempSp = "temp_sp";
constexpr const char *kKeyPressSp = "press_sp";
constexpr const char *kKeyKp = "kp";
constexpr const char *kKeyKi = "ki";
constexpr const char *kKeyKd = "kd";
constexpr const char *kKeyActiveProf = "active_prof";
constexpr const char *kKeyProfiles = "profiles";

} // namespace

bool NvsConfig::open(bool readOnly) {
    return prefs_.begin(kNamespace, readOnly);
}

void NvsConfig::close() {
    prefs_.end();
}

void NvsConfig::begin() {
    // Só garante que o namespace existe; a leitura real é por operação para
    // não manter o handle da NVS aberto durante todo o runtime.
    if (open(false)) {
        close();
    }
}

bool NvsConfig::hasWifiCredentials() {
    if (!open(true)) return false;
    const bool has = prefs_.isKey(kKeyWifiSsid);
    close();
    return has;
}

bool NvsConfig::loadWifiSsid(char *out, size_t outLen) {
    if (out == nullptr || outLen == 0) return false;
    out[0] = '\0';
    if (!open(true)) return false;
    const size_t n = prefs_.getString(kKeyWifiSsid, out, outLen);
    close();
    return n > 0 && out[0] != '\0';
}

bool NvsConfig::loadWifiPassword(char *out, size_t outLen) {
    if (out == nullptr || outLen == 0) return false;
    out[0] = '\0';
    if (!open(true)) return false;
    prefs_.getString(kKeyWifiPass, out, outLen);
    close();
    return true;
}

void NvsConfig::saveWifiCredentials(const char *ssid, const char *password) {
    if (!open(false)) return;
    prefs_.putString(kKeyWifiSsid, ssid != nullptr ? ssid : "");
    prefs_.putString(kKeyWifiPass, password != nullptr ? password : "");
    close();
    // N2: a senha nunca é logada.
}

void NvsConfig::clearWifiCredentials() {
    if (!open(false)) return;
    prefs_.remove(kKeyWifiSsid);
    prefs_.remove(kKeyWifiPass);
    close();
}

void NvsConfig::loadControl(DisplayModel &model) {
    if (!open(false)) return;

    if (!prefs_.isKey(kKeyTempSp)) {
        // Primeiro boot: grava os defaults do MVP (D6).
        prefs_.putFloat(kKeyTempSp, model.tempSetpoint());
        prefs_.putFloat(kKeyPressSp, model.pressureSetpoint());
        prefs_.putFloat(kKeyKp, model.pid().kp);
        prefs_.putFloat(kKeyKi, model.pid().ki);
        prefs_.putFloat(kKeyKd, model.pid().kd);
    } else {
        model.setTempSetpoint(prefs_.getFloat(kKeyTempSp, model.tempSetpoint()));
        model.setPressureSetpoint(prefs_.getFloat(kKeyPressSp, model.pressureSetpoint()));
        PidGains g{
            prefs_.getFloat(kKeyKp, model.pid().kp),
            prefs_.getFloat(kKeyKi, model.pid().ki),
            prefs_.getFloat(kKeyKd, model.pid().kd),
        };
        model.setPid(g);
    }

    char activeId[24] = {0};
    prefs_.getString(kKeyActiveProf, activeId, sizeof(activeId));
    model.setActiveProfileId(activeId);

    close();
}

void NvsConfig::saveTempSetpoint(float v) {
    if (!open(false)) return;
    prefs_.putFloat(kKeyTempSp, v);
    close();
}

void NvsConfig::savePressureSetpoint(float v) {
    if (!open(false)) return;
    prefs_.putFloat(kKeyPressSp, v);
    close();
}

void NvsConfig::savePid(const PidGains &g) {
    if (!open(false)) return;
    prefs_.putFloat(kKeyKp, g.kp);
    prefs_.putFloat(kKeyKi, g.ki);
    prefs_.putFloat(kKeyKd, g.kd);
    close();
}

void NvsConfig::saveActiveProfileId(const char *id) {
    if (!open(false)) return;
    prefs_.putString(kKeyActiveProf, id != nullptr ? id : "");
    close();
}

void NvsConfig::loadProfilesJson(char *out, size_t outLen) {
    if (out == nullptr || outLen < 3) return;
    out[0] = '\0';
    if (open(true)) {
        prefs_.getString(kKeyProfiles, out, outLen);
        close();
    }
    if (out[0] == '\0') {
        strncpy(out, "[]", outLen - 1);
        out[outLen - 1] = '\0';
    }
}

void NvsConfig::saveProfilesJson(const char *json) {
    if (json == nullptr) return;
    if (!open(false)) return;
    prefs_.putString(kKeyProfiles, json);
    close();
}

void NvsConfig::factoryReset() {
    if (!open(false)) return;
    prefs_.clear();
    close();
}
