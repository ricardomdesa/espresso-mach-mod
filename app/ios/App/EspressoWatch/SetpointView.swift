import SwiftUI

/// Setpoint de café pela Digital Crown; só envia ao confirmar.
struct SetpointView: View {
    @Environment(MachineStore.self) private var machine
    @State private var draft = 93.0
    @State private var editing = false

    var body: some View {
        let current = machine.status?.tempSetpoint

        VStack(spacing: 8) {
            Text("Setpoint")
                .font(.footnote)
                .foregroundStyle(.secondary)

            Text(String(format: "%.1f°", draft))
                .font(.system(size: 40, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(draft == current ? .primary : Color.orange)
                .focusable()
                .digitalCrownRotation($draft, from: Limits.brewMin, through: Limits.brewMax,
                                      by: 0.5, sensitivity: .medium,
                                      isContinuous: false, isHapticFeedbackEnabled: true)
                .onChange(of: draft) { editing = true }

            Button("Salvar") {
                Task {
                    await machine.setSetpoint(draft)
                    editing = false
                }
            }
            .disabled(!machine.canCommand || draft == current || machine.status?.steam == true)
        }
        .navigationTitle("Temperatura")
        // Acompanha a máquina enquanto o usuário não mexe na coroa.
        .onChange(of: current, initial: true) { _, value in
            if !editing, let value { draft = value }
        }
    }
}
