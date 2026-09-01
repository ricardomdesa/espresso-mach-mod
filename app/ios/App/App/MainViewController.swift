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

    /**
     * Trava o zoom da WKWebView.
     *
     * A meta viewport sozinha não segura: a WebView aceita pinch e guarda a
     * escala entre sessões, então um toque errado no painel deixava a tela
     * ampliada e cortada nas bordas até reinstalar o app. Num painel de
     * controle não há nada para ampliar — o layout já é responsivo.
     */
    override func viewDidLoad() {
        super.viewDidLoad()
        guard let scrollView = webView?.scrollView else { return }
        scrollView.minimumZoomScale = 1
        scrollView.maximumZoomScale = 1
        scrollView.bouncesZoom = false
        scrollView.pinchGestureRecognizer?.isEnabled = false
    }
}
