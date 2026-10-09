import Foundation

enum APIError: LocalizedError {
    case notConfigured
    case http(Int, String)
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Abra o app no iPhone e conecte à máquina."
        case .http(401, _):
            return "Código de pareamento inválido."
        case .http(_, let msg):
            return msg
        case .transport(let msg):
            return msg
        }
    }
}

/// Porta de app/src/api/client.ts. O watchOS não libera WebSocket para apps
/// comuns, então o relógio só fala REST e faz polling do status.
struct MachineAPI {
    let baseURL: URL
    let token: String?

    private static let session: URLSession = {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 5
        cfg.waitsForConnectivity = false
        return URLSession(configuration: cfg)
    }()

    func getStatus() async throws -> MachineStatus {
        try await request("GET", "/api/status")
    }

    func getProfiles() async throws -> [ExtractionProfile] {
        try await request("GET", "/api/profiles")
    }

    func setTempSetpoint(_ temp: Double) async throws -> MachineStatus {
        try await request("PUT", "/api/setpoint/temp", body: ["temp": temp])
    }

    func setLed(_ on: Bool) async throws -> MachineStatus {
        try await request("PUT", "/api/led", body: ["on": on])
    }

    func setPump(_ on: Bool) async throws -> MachineStatus {
        try await request("PUT", "/api/pump", body: ["on": on])
    }

    func setSteam(_ on: Bool, temp: Double? = nil) async throws -> MachineStatus {
        var body: [String: Any] = ["on": on]
        if let temp { body["temp"] = temp }
        return try await request("PUT", "/api/steam", body: body)
    }

    func startExtraction() async throws -> MachineStatus {
        try await request("POST", "/api/extraction/start")
    }

    func stopExtraction() async throws -> MachineStatus {
        try await request("POST", "/api/extraction/stop")
    }

    func setActiveProfile(_ id: String) async throws -> MachineStatus {
        try await request("PUT", "/api/profiles/active", body: ["id": id])
    }

    private func request<T: Decodable>(_ method: String, _ path: String,
                                       body: [String: Any]? = nil) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { req.setValue(token, forHTTPHeaderField: "X-Auth-Token") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await Self.session.data(for: req)
        } catch {
            throw APIError.transport("Máquina inalcançável")
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport("Resposta inválida")
        }
        guard (200..<300).contains(http.statusCode) else {
            // Firmware responde {"error":"..."} (sendError em ApiServer.cpp).
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                ?? "Erro \(http.statusCode)"
            throw APIError.http(http.statusCode, msg)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
