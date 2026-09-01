import UIKit
import Capacitor

/**
 * O bridge do Capacitor só descobre sozinho os plugins que vêm de um pod.
 * O NetworkBinder mora dentro do próprio app, então precisa ser registrado
 * na mão — senão `NetworkBinder.status()` rejeita e o diagnóstico de rede
 * some no iOS.
 */
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NetworkBinderPlugin())
    }
}
