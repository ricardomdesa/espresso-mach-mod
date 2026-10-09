import SwiftUI

struct DashboardView: View {
    @Environment(MachineStore.self) private var machine

    var body: some View {
        let status = machine.status
        let running = status?.isRunning ?? false

        VStack(spacing: 6) {
            StatusHeader()

            Text(status.map { String(format: "%.1f°", $0.temp) } ?? "--")
                .font(.system(size: 48, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tempColor(status))

            if let status {
                Text(status.steam
                     ? String(format: "Vapor %.0f°", status.steamSetpoint)
                     : String(format: "Alvo %.1f°", status.tempSetpoint))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if running, let timer = status?.timer {
                Text(formatTimer(timer))
                    .font(.title3.monospacedDigit())
            }

            Button {
                Task { await machine.toggleExtraction() }
            } label: {
                Label(running ? "Parar" : "Extrair",
                      systemImage: running ? "stop.fill" : "play.fill")
                    .frame(maxWidth: .infinity)
            }
            .tint(running ? .red : .brown)
            .disabled(!machine.canCommand || (status?.wifiMode == "ap" && !running))
        }
        .navigationTitle("ESPresso")
    }

    private func tempColor(_ status: MachineStatus?) -> Color {
        guard let status, machine.online else { return .secondary }
        return status.ready ? .green : .orange
    }

    private func formatTimer(_ seconds: Double) -> String {
        let s = Int(seconds.rounded(.down))
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}
