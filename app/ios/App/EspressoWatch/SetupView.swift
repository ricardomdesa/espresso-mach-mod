import SwiftUI

/// Aparece quando o iPhone ainda não mandou a configuração. Permite digitar
/// IP e código na mão (útil no teste de rede da fase 1).
struct SetupView: View {
    @Environment(ConfigStore.self) private var config
    @State private var host = ""
    @State private var token = ""

    var body: some View {
        Form {
            Text("Conecte à máquina no app do iPhone, ou informe aqui.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            TextField("IP (ex.: 192.168.1.50)", text: $host)
                .textContentType(.URL)
            TextField("Código de pareamento", text: $token)
            Button("Salvar") {
                config.update(baseURL: host, token: token)
            }
            .disabled(ConfigStore.normalize(host) == nil)
        }
        .navigationTitle("Configurar")
    }
}
