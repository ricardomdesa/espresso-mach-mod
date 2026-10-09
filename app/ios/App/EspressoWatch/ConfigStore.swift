import Foundation
import WatchConnectivity

/// Recebe baseUrl + código de pareamento do app iPhone (WatchBridgePlugin) via
/// `applicationContext` e guarda no relógio. Também aceita ajuste manual, para
/// quando o iPhone não está por perto.
@MainActor
@Observable
final class ConfigStore: NSObject {
    private static let baseURLKey = "philco.baseUrl"
    private static let tokenKey = "philco.token"

    private(set) var baseURL: URL?
    private(set) var token: String?

    override init() {
        let defaults = UserDefaults.standard
        baseURL = defaults.string(forKey: Self.baseURLKey).flatMap(URL.init(string:))
        token = defaults.string(forKey: Self.tokenKey)
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    var api: MachineAPI? {
        baseURL.map { MachineAPI(baseURL: $0, token: token) }
    }

    /// Endereço mDNS da máquina (MDNS.begin("philco") no firmware). Usado
    /// quando o IP salvo para de responder — o DHCP pode ter trocado o IP.
    static let mdnsURL = URL(string: "http://philco.local")!

    /// API pelo mDNS, ou nil se o endereço salvo já é o mDNS.
    var fallbackAPI: MachineAPI? {
        guard let baseURL, baseURL.host != Self.mdnsURL.host else { return nil }
        return MachineAPI(baseURL: Self.mdnsURL, token: token)
    }

    /// Troca o IP guardado mantendo o código de pareamento.
    func adoptIP(_ ip: String) {
        update(baseURL: ip, token: token)
    }

    func update(baseURL raw: String?, token: String?) {
        let url = raw.flatMap(Self.normalize)
        let tok = token?.trimmingCharacters(in: .whitespaces)
        baseURL = url
        self.token = (tok?.isEmpty ?? true) ? nil : tok
        let defaults = UserDefaults.standard
        defaults.set(url?.absoluteString, forKey: Self.baseURLKey)
        defaults.set(self.token, forKey: Self.tokenKey)
    }

    /// Aceita "192.168.1.50", "philco.local" ou URL completa.
    static func normalize(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        let withScheme = trimmed.contains("://") ? trimmed : "http://\(trimmed)"
        return URL(string: withScheme.hasSuffix("/") ? String(withScheme.dropLast()) : withScheme)
    }

    fileprivate func apply(_ context: [String: Any]) {
        update(baseURL: context["baseUrl"] as? String, token: context["token"] as? String)
    }
}

extension ConfigStore: WCSessionDelegate {
    nonisolated func session(_ session: WCSession,
                             activationDidCompleteWith state: WCSessionActivationState,
                             error: Error?) {
        let context = session.receivedApplicationContext
        guard !context.isEmpty else { return }
        Task { @MainActor in self.apply(context) }
    }

    nonisolated func session(_ session: WCSession,
                             didReceiveApplicationContext context: [String: Any]) {
        Task { @MainActor in self.apply(context) }
    }
}
