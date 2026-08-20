#include "ApiServer.h"

#include <ArduinoJson.h>
#include <WiFi.h>
#include <functional>

#include "rede.h"

namespace {

constexpr size_t kStatusJsonSize = 512;
constexpr size_t kFrameJsonSize = 224;
constexpr size_t kMaxBodyBytes = 4096;

const char *kJson = "application/json";

// Buffers de trabalho dos handlers REST. São estáticos de propósito: a task do
// AsyncTCP tem pilha pequena (8 KB por padrão) e dois arrays de 3 KB em pilha
// a estouram. Todos os handlers rodam nessa mesma task, um de cada vez, então
// não há concorrência entre eles.
char g_scratchA[NvsConfig::kProfilesJsonCapacity];
char g_scratchB[NvsConfig::kProfilesJsonCapacity];

const char *modeName(MachineMode m) {
    switch (m) {
    case MachineMode::Extracting:
        return "extracting";
    case MachineMode::Heating:
        return "heating";
    case MachineMode::Error:
        return "error";
    case MachineMode::Idle:
    default:
        return "idle";
    }
}

// SSID é texto arbitrário do vizinho: aspas ou barras invertidas quebrariam o
// JSON montado à mão.
void jsonEscape(const char *in, char *out, size_t outLen) {
    size_t o = 0;
    for (size_t i = 0; in[i] != '\0' && o + 2 < outLen; i++) {
        const char c = in[i];
        if (c == '"' || c == '\\') {
            out[o++] = '\\';
            out[o++] = c;
        } else if (static_cast<unsigned char>(c) < 0x20) {
            continue; // controle: descarta
        } else {
            out[o++] = c;
        }
    }
    out[o] = '\0';
}

void sendError(AsyncWebServerRequest *request, int code, const char *msg) {
    char buf[160];
    snprintf(buf, sizeof(buf), "{\"error\":\"%s\"}", msg);
    request->send(code, kJson, buf);
}

using JsonHandler = std::function<void(AsyncWebServerRequest *, JsonVariantConst)>;

// Registra uma rota que recebe corpo JSON. O corpo chega em pedaços; só depois
// de completo o AsyncWebServer chama o handler da requisição.
void onJsonBody(AsyncWebServer &server, const char *uri, WebRequestMethodComposite method,
                JsonHandler handler) {
    server.on(
        uri, method,
        [handler](AsyncWebServerRequest *request) {
            JsonDocument doc;
            const char *body = static_cast<const char *>(request->_tempObject);
            if (body != nullptr) {
                const DeserializationError err = deserializeJson(doc, body);
                if (err) {
                    sendError(request, 400, "JSON invalido");
                    return;
                }
            }
            handler(request, doc.as<JsonVariantConst>());
        },
        nullptr,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            if (total == 0 || total > kMaxBodyBytes) return;
            if (index == 0) {
                // Liberado pelo destrutor de AsyncWebServerRequest.
                request->_tempObject = malloc(total + 1);
                if (request->_tempObject == nullptr) return;
                static_cast<char *>(request->_tempObject)[total] = '\0';
            }
            if (request->_tempObject == nullptr) return;
            memcpy(static_cast<char *>(request->_tempObject) + index, data, len);
        });
}

} // namespace

ApiServer::ApiServer(DisplayModel &model, NvsConfig &nvs, WifiProvisioner &wifi)
    : model_(model), nvs_(nvs), wifi_(wifi), server_(API_PORT), ws_(WS_PATH) {}

void ApiServer::buildStatusJson(char *out, size_t outLen) const {
    char profileField[32];
    if (model_.activeProfileId()[0] == '\0') {
        snprintf(profileField, sizeof(profileField), "null");
    } else {
        snprintf(profileField, sizeof(profileField), "\"%s\"", model_.activeProfileId());
    }

    snprintf(out, outLen,
             "{\"api\":%d,\"temp\":%.2f,\"press\":%.2f,\"tempSetpoint\":%.2f,"
             "\"pressSetpoint\":%.2f,\"timer\":%.1f,\"state\":\"%s\",\"profile\":%s,"
             "\"uptime\":%lu,\"wifiMode\":\"%s\",\"ip\":\"%s\","
             "\"pid\":{\"kp\":%.3f,\"ki\":%.3f,\"kd\":%.3f},\"heap\":%lu}",
             API_VERSION, model_.tempCurrent(), model_.pressureCurrent(),
             model_.tempSetpoint(), model_.pressureSetpoint(),
             model_.timer().elapsedMs() / 1000.0f, modeName(model_.mode()), profileField,
             millis() / 1000UL, wifi_.mode() == WifiMode::Sta ? "sta" : "ap",
             wifi_.ip().toString().c_str(), model_.pid().kp, model_.pid().ki, model_.pid().kd,
             (unsigned long)ESP.getFreeHeap());
}

void ApiServer::sendStatus(AsyncWebServerRequest *request, int code) const {
    char buf[kStatusJsonSize];
    buildStatusJson(buf, sizeof(buf));
    request->send(code, kJson, buf);
}

void ApiServer::begin() {
    registerWebSocket();
    registerRoutes();
    server_.begin();
    Serial.println(F("[api] servidor HTTP/WS na porta 80"));
}

void ApiServer::registerWebSocket() {
    ws_.onEvent([this](AsyncWebSocket *, AsyncWebSocketClient *client, AwsEventType type,
                       void *, uint8_t *data, size_t len) {
        switch (type) {
        case WS_EVT_CONNECT:
            Serial.printf("[ws] cliente %u conectado\n", client->id());
            break;
        case WS_EVT_DISCONNECT:
            Serial.printf("[ws] cliente desconectado\n");
            break;
        case WS_EVT_DATA: {
            // Único comando aceito hoje: keepalive.
            if (len >= 4 && strstr(reinterpret_cast<const char *>(data), "ping") != nullptr) {
                client->text("{\"event\":\"pong\"}");
            }
            break;
        }
        default:
            break;
        }
    });
    server_.addHandler(&ws_);
}

void ApiServer::registerRoutes() {
    // A app roda em http://localhost dentro da WebView: origem diferente da máquina.
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods",
                                         "GET, POST, PUT, DELETE, OPTIONS");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

    server_.onNotFound([](AsyncWebServerRequest *request) {
        if (request->method() == HTTP_OPTIONS) {
            request->send(204);
            return;
        }
        sendError(request, 404, "rota nao encontrada");
    });

    // --- Estado ---
    server_.on("/api/status", HTTP_GET,
               [this](AsyncWebServerRequest *request) { sendStatus(request); });

    // --- Setpoints e PID ---
    onJsonBody(server_, "/api/setpoint/temp", HTTP_PUT,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   if (!body["temp"].is<float>()) {
                       sendError(request, 400, "campo temp ausente");
                       return;
                   }
                   const float v = body["temp"].as<float>();
                   if (v < 20.0f || v > 130.0f) {
                       sendError(request, 400, "temp fora da faixa (20-130)");
                       return;
                   }
                   model_.setTempSetpoint(v);
                   nvs_.saveTempSetpoint(v);
                   sendStatus(request);
               });

    onJsonBody(server_, "/api/setpoint/pressure", HTTP_PUT,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   if (!body["press"].is<float>()) {
                       sendError(request, 400, "campo press ausente");
                       return;
                   }
                   const float v = body["press"].as<float>();
                   if (v < 0.0f || v > 15.0f) {
                       sendError(request, 400, "press fora da faixa (0-15)");
                       return;
                   }
                   model_.setPressureSetpoint(v);
                   nvs_.savePressureSetpoint(v);
                   sendStatus(request);
               });

    onJsonBody(server_, "/api/pid", HTTP_PUT,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   if (!body["kp"].is<float>() || !body["ki"].is<float>() ||
                       !body["kd"].is<float>()) {
                       sendError(request, 400, "campos kp/ki/kd obrigatorios");
                       return;
                   }
                   const PidGains g{body["kp"].as<float>(), body["ki"].as<float>(),
                                    body["kd"].as<float>()};
                   if (g.kp < 0 || g.ki < 0 || g.kd < 0) {
                       sendError(request, 400, "ganhos nao podem ser negativos");
                       return;
                   }
                   model_.setPid(g);
                   nvs_.savePid(g);
                   sendStatus(request);
               });

    // --- Extração ---
    server_.on("/api/extraction/start", HTTP_POST, [this](AsyncWebServerRequest *request) {
        model_.timer().reset();
        model_.timer().start();
        broadcastEvent("extraction_started");
        sendStatus(request);
    });

    server_.on("/api/extraction/stop", HTTP_POST, [this](AsyncWebServerRequest *request) {
        model_.timer().stop();
        broadcastEvent("extraction_stopped");
        sendStatus(request);
    });

    // --- Perfis de extração ---
    server_.on("/api/profiles", HTTP_GET, [this](AsyncWebServerRequest *request) {
        nvs_.loadProfilesJson(g_scratchA, sizeof(g_scratchA));
        request->send(200, kJson, g_scratchA);
    });

    onJsonBody(server_, "/api/profiles/active", HTTP_PUT,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   const char *id = body["id"] | "";
                   model_.setActiveProfileId(id);
                   nvs_.saveActiveProfileId(id);
                   sendStatus(request);
               });

    onJsonBody(server_, "/api/profiles", HTTP_POST,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   if (!body["name"].is<const char *>()) {
                       sendError(request, 400, "campo name obrigatorio");
                       return;
                   }

                   nvs_.loadProfilesJson(g_scratchA, sizeof(g_scratchA));
                   JsonDocument doc;
                   deserializeJson(doc, g_scratchA);
                   JsonArray arr = doc.isNull() ? doc.to<JsonArray>() : doc.as<JsonArray>();

                   JsonObject created = arr.add<JsonObject>();
                   created.set(body.as<JsonObjectConst>());
                   char id[24];
                   snprintf(id, sizeof(id), "p%lu", millis());
                   created["id"] = id;

                   if (serializeJson(doc, g_scratchB, sizeof(g_scratchB)) == 0) {
                       sendError(request, 507, "sem espaco para mais perfis");
                       return;
                   }
                   nvs_.saveProfilesJson(g_scratchB);

                   char single[768];
                   serializeJson(created, single, sizeof(single));
                   request->send(201, kJson, single);
               });

    // PUT/DELETE de um perfil específico: /api/profiles/{id}
    onJsonBody(server_, "^\\/api\\/profiles\\/([A-Za-z0-9_-]+)$", HTTP_PUT,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   const String id = request->pathArg(0);

                   nvs_.loadProfilesJson(g_scratchA, sizeof(g_scratchA));
                   JsonDocument doc;
                   deserializeJson(doc, g_scratchA);
                   JsonArray arr = doc.as<JsonArray>();

                   for (JsonObject p : arr) {
                       if (id != p["id"].as<const char *>()) continue;
                       p.set(body.as<JsonObjectConst>());
                       p["id"] = id;

                       if (serializeJson(doc, g_scratchB, sizeof(g_scratchB)) == 0) {
                           sendError(request, 507, "perfil grande demais");
                           return;
                       }
                       nvs_.saveProfilesJson(g_scratchB);

                       char single[768];
                       serializeJson(p, single, sizeof(single));
                       request->send(200, kJson, single);
                       return;
                   }
                   sendError(request, 404, "perfil nao encontrado");
               });

    server_.on("^\\/api\\/profiles\\/([A-Za-z0-9_-]+)$", HTTP_DELETE,
               [this](AsyncWebServerRequest *request) {
                   const String id = request->pathArg(0);

                   nvs_.loadProfilesJson(g_scratchA, sizeof(g_scratchA));
                   JsonDocument doc;
                   deserializeJson(doc, g_scratchA);
                   JsonArray arr = doc.as<JsonArray>();

                   for (size_t i = 0; i < arr.size(); i++) {
                       if (id != arr[i]["id"].as<const char *>()) continue;
                       arr.remove(i);
                       serializeJson(doc, g_scratchB, sizeof(g_scratchB));
                       nvs_.saveProfilesJson(g_scratchB);
                       if (id == model_.activeProfileId()) {
                           model_.setActiveProfileId("");
                           nvs_.saveActiveProfileId("");
                       }
                       request->send(204);
                       return;
                   }
                   sendError(request, 404, "perfil nao encontrado");
               });

    // --- Wi-Fi ---
    // Nunca varre aqui dentro: o rádio é um só e uma varredura síncrona tira o
    // AP do canal, derrubando a conexão do próprio celular que fez o pedido.
    // Responde o cache na hora e agenda a varredura para o loop principal.
    server_.on("/api/wifi/scan", HTTP_GET, [this](AsyncWebServerRequest *request) {
        wifi_.requestScan();

        size_t at = 0;
        at += snprintf(g_scratchA + at, sizeof(g_scratchA) - at, "{\"scanning\":%s,\"networks\":[",
                       wifi_.scanning() ? "true" : "false");
        for (uint8_t i = 0; i < wifi_.scanCount(); i++) {
            const WifiProvisioner::ScanEntry &e = wifi_.scanEntry(i);
            char ssid[sizeof(e.ssid) * 2];
            jsonEscape(e.ssid, ssid, sizeof(ssid));
            at += snprintf(g_scratchA + at, sizeof(g_scratchA) - at,
                           "%s{\"ssid\":\"%s\",\"rssi\":%d,\"secure\":%s}", i == 0 ? "" : ",",
                           ssid, e.rssi, e.secure ? "true" : "false");
            if (at >= sizeof(g_scratchA) - 4) break;
        }
        snprintf(g_scratchA + at, sizeof(g_scratchA) - at, "]}");
        request->send(200, kJson, g_scratchA);
    });

    onJsonBody(server_, "/api/wifi/provision", HTTP_POST,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   const char *ssid = body["ssid"] | "";
                   const char *pass = body["password"] | "";
                   if (!wifi_.provision(ssid, pass)) {
                       sendError(request, 400, "ssid obrigatorio");
                       return;
                   }
                   // A máquina reinicia logo em seguida para entrar na rede.
                   request->send(200, kJson, "{\"ok\":true,\"rebooting\":true}");
               });

    server_.on("/api/wifi/forget", HTTP_POST, [this](AsyncWebServerRequest *request) {
        wifi_.forget();
        request->send(200, kJson, "{\"ok\":true,\"rebooting\":true}");
    });

    server_.on("/api/factory-reset", HTTP_POST, [this](AsyncWebServerRequest *request) {
        nvs_.factoryReset();
        request->send(200, kJson, "{\"ok\":true,\"rebooting\":true}");
        wifi_.forget();
    });
}

void ApiServer::broadcastEvent(const char *event) {
    char buf[96];
    snprintf(buf, sizeof(buf), "{\"event\":\"%s\"}", event);
    ws_.textAll(buf);
}

void ApiServer::broadcastError(const char *msg) {
    char buf[160];
    snprintf(buf, sizeof(buf), "{\"event\":\"error\",\"msg\":\"%s\"}", msg);
    ws_.textAll(buf);
}

void ApiServer::loop() {
    const unsigned long now = millis();
    if (now - lastStreamMs_ < WS_STREAM_INTERVAL_MS) return;
    lastStreamMs_ = now;

    ws_.cleanupClients();
    if (ws_.count() == 0) return;

    char profileField[32];
    if (model_.activeProfileId()[0] == '\0') {
        snprintf(profileField, sizeof(profileField), "null");
    } else {
        snprintf(profileField, sizeof(profileField), "\"%s\"", model_.activeProfileId());
    }

    // D5/N2: frame montado com snprintf em buffer da pilha, sem alocação.
    char frame[kFrameJsonSize];
    snprintf(frame, sizeof(frame),
             "{\"t\":%lu,\"temp\":%.2f,\"press\":%.2f,\"timer\":%.1f,\"state\":\"%s\","
             "\"profile\":%s}",
             now, model_.tempCurrent(), model_.pressureCurrent(),
             model_.timer().elapsedMs() / 1000.0f, modeName(model_.mode()), profileField);
    ws_.textAll(frame);
}
