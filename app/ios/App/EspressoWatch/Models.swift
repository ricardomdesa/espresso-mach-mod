import Foundation

// Espelho de app/src/api/types.ts — só os campos que o relógio usa.

enum MachineState: String, Codable {
    case idle, heating, preheating, steaming, extracting, error

    var label: String {
        switch self {
        case .idle: return "Ocioso"
        case .heating: return "Aquecendo"
        case .preheating: return "Pré-aquecendo"
        case .steaming: return "Vapor"
        case .extracting: return "Extraindo"
        case .error: return "Erro"
        }
    }
}

struct MachineStatus: Codable, Equatable {
    var temp: Double
    var tempSetpoint: Double
    var timer: Double
    var state: MachineState
    var profile: String?
    var ip: String?
    var led: Bool
    var pump: Bool
    var steam: Bool
    var steamSetpoint: Double
    var ready: Bool
    var wifiMode: String

    /// Ciclo em andamento: extraindo ou aquecendo para o perfil. Mesmo critério
    /// do `isRunning` do DashboardScreen.
    var isRunning: Bool { state == .extracting || state == .preheating }
}

struct ProfileStep: Codable, Equatable {
    var seconds: Double
    var pump: Bool
}

struct ExtractionProfile: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var description: String?
    var temperature_c: Double
    var steps: [ProfileStep]
}

enum Limits {
    // Faixas validadas pelo firmware (src/net/ApiServer.cpp).
    static let brewMin = 20.0
    static let brewMax = 115.0
    static let steamMin = 80.0
    static let steamMax = 115.0
}
