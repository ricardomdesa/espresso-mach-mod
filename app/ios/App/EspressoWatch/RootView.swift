import SwiftUI

struct RootView: View {
    @Environment(MachineStore.self) private var machine
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var machine = machine
        NavigationStack {
            Group {
                if machine.configured {
                    TabView {
                        DashboardView()
                        ControlsView()
                        SetpointView()
                        ProfilesView()
                    }
                    .tabViewStyle(.verticalPage)
                } else {
                    SetupView()
                }
            }
        }
        .alert("Erro", isPresented: Binding(
            get: { machine.errorMessage != nil },
            set: { if !$0 { machine.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(machine.errorMessage ?? "")
        }
        // Polling só com o app na tela: economiza bateria e o watchOS
        // suspende a rede em background de qualquer jeito.
        .onChange(of: scenePhase, initial: true) { _, phase in
            if phase == .active { machine.startPolling() } else { machine.stopPolling() }
        }
    }
}

/// Faixa de status comum às páginas: conexão + estado.
struct StatusHeader: View {
    @Environment(MachineStore.self) private var machine

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(machine.online ? Color.green : Color.red)
                .frame(width: 6, height: 6)
            Text(machine.online ? (machine.status?.state.label ?? "—") : "Offline")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}
