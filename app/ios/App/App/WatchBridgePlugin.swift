import Foundation
import Capacitor
import WatchConnectivity

/**
 * Entrega ao Apple Watch o endereço da máquina e o código de pareamento que o
 * app já guardou, para o relógio não precisar de setup próprio.
 *
 * Usa `updateApplicationContext`: o sistema guarda só o último valor e entrega
 * quando o relógio acordar, então dá para chamar sem checar se ele está por
 * perto ou com o app aberto.
 */
@objc(WatchBridgePlugin)
public class WatchBridgePlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "WatchBridgePlugin"
    public let jsName = "WatchBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise)
    ]

    // Contexto pedido antes da sessão terminar de ativar: aplicado no callback.
    private var pending: [String: Any]?

    override public func load() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    @objc func sync(_ call: CAPPluginCall) {
        guard WCSession.isSupported() else {
            call.resolve(["delivered": false])
            return
        }
        // Chaves ausentes = desconectado: o relógio limpa a configuração.
        var context: [String: Any] = [:]
        if let baseUrl = call.getString("baseUrl") { context["baseUrl"] = baseUrl }
        if let token = call.getString("token") { context["token"] = token }

        let session = WCSession.default
        guard session.activationState == .activated else {
            pending = context
            call.resolve(["delivered": false])
            return
        }
        push(context, call: call)
    }

    private func push(_ context: [String: Any], call: CAPPluginCall? = nil) {
        let session = WCSession.default
        guard session.isPaired, session.isWatchAppInstalled else {
            call?.resolve(["delivered": false])
            return
        }
        do {
            try session.updateApplicationContext(context)
            call?.resolve(["delivered": true])
        } catch {
            call?.reject("updateApplicationContext falhou", nil, error)
        }
    }

    // MARK: WCSessionDelegate

    public func session(_ session: WCSession,
                        activationDidCompleteWith state: WCSessionActivationState,
                        error: Error?) {
        guard state == .activated, let context = pending else { return }
        pending = nil
        DispatchQueue.main.async { self.push(context) }
    }

    public func sessionDidBecomeInactive(_ session: WCSession) {}

    // Troca de relógio pareado: reativa para a sessão apontar para o novo.
    public func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
}
