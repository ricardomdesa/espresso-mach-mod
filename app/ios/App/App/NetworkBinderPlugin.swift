import Foundation
import Capacitor
import Network

/**
 * Contraparte iOS do NetworkBinder do Android.
 *
 * O iOS não expõe nada equivalente a `bindProcessToNetwork()`: quem escolhe a
 * interface é o sistema, e o WKWebView usa a URLSession dele. Então `bind()`
 * aqui é um no-op honesto (`requested: false`) — o que segura a Wi-Fi sem
 * internet no iPhone é o próprio usuário confirmando "Manter conexão" no
 * prompt do sistema, não o app.
 *
 * O que faltava de verdade no iOS era o diagnóstico: sem este plugin a chamada
 * a `NetworkBinder.status()` rejeitava e `diagnoseNetwork()` devolvia `null`,
 * então a tela de conexão nunca conseguia dizer por que a máquina não responde
 * (VPN ligada, celular fora da Wi-Fi, tráfego indo pelos dados móveis).
 */
@objc(NetworkBinderPlugin)
public class NetworkBinderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NetworkBinderPlugin"
    public let jsName = "NetworkBinder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "bind", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unbind", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise)
    ]

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.rmdsistemas.espresso.networkbinder")
    private var monitoring = false

    override public func load() {
        // `currentPath` só é confiável depois do start; um handler vazio basta,
        // a leitura é feita sob demanda em `status()`.
        monitor.pathUpdateHandler = { _ in }
        monitor.start(queue: monitorQueue)
        monitoring = true
    }

    deinit {
        if monitoring { monitor.cancel() }
    }

    @objc func bind(_ call: CAPPluginCall) {
        call.resolve(["requested": false])
    }

    @objc func unbind(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func status(_ call: CAPPluginCall) {
        let path = monitor.currentPath
        let wifiAvailable = path.availableInterfaces.contains { $0.type == .wifi }
        // `bound` no Android significa "os sockets do app estão presos à Wi-Fi".
        // O equivalente observável no iOS é: a rota que o app está usando agora
        // passa pela Wi-Fi. É essa a pergunta que o diagnóstico quer responder.
        let usingWifi = path.status == .satisfied && path.usesInterfaceType(.wifi)

        call.resolve([
            "vpnActive": Self.vpnActive(on: path),
            "wifiAvailable": wifiAvailable,
            "bound": usingWifi
        ])
    }

    /**
     * VPN só interessa aqui quando está de fato capturando o tráfego do app.
     *
     * Não dá para olhar só "existe uma interface utun": iOS e macOS mantêm
     * utun ociosas para Handoff, Wi-Fi Calling e afins, e checá-las (por
     * exemplo pelos escopos de `CFNetworkCopySystemProxySettings`) acusa VPN
     * em aparelho nenhum. A pergunta certa é se a interface *primária* do
     * caminho atual é um túnel — `availableInterfaces` vem ordenada por
     * preferência, então a primeira é a que está roteando.
     */
    private static func vpnActive(on path: NWPath) -> Bool {
        guard path.status == .satisfied,
              let primary = path.availableInterfaces.first else { return false }
        let tunnelPrefixes = ["utun", "ipsec", "ppp", "tap", "tun"]
        return tunnelPrefixes.contains { primary.name.hasPrefix($0) }
    }
}
