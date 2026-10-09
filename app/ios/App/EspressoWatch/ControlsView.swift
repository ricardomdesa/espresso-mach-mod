import SwiftUI

struct ControlsView: View {
    @Environment(MachineStore.self) private var machine
    @State private var steamTarget = 90.0

    var body: some View {
        let status = machine.status
        let running = status?.isRunning ?? false

        List {
            Toggle("Bomba", isOn: binding(\.pump) { await machine.setPump($0) })
                .disabled(!machine.canCommand || status?.wifiMode == "ap")

            Toggle("LED", isOn: binding(\.led) { await machine.setLed($0) })
                .disabled(!machine.canCommand)

            Toggle("Vapor", isOn: binding(\.steam) { await machine.setSteam($0, temp: steamTarget) })
                .disabled(!machine.canCommand || (running && !(status?.steam ?? false)))

            Stepper(value: $steamTarget, in: Limits.steamMin...Limits.steamMax, step: 1) {
                Text(String(format: "Alvo vapor %.0f°", steamTarget))
                    .font(.footnote)
            }
            .onChange(of: steamTarget) { _, t in
                // Com o vapor ligado, o ajuste vale na hora (como no SteamScreen).
                guard status?.steam == true else { return }
                Task { await machine.setSteam(true, temp: t) }
            }
            .disabled(!machine.canCommand)
        }
        .navigationTitle("Controles")
        .onAppear {
            if let t = status?.steamSetpoint { steamTarget = t }
        }
    }

    /// Toggle que reflete o status da máquina e manda o comando ao mudar.
    private func binding(_ key: KeyPath<MachineStatus, Bool>,
                         action: @escaping (Bool) async -> Void) -> Binding<Bool> {
        Binding(
            get: { machine.status?[keyPath: key] ?? false },
            set: { on in Task { await action(on) } }
        )
    }
}
