import SwiftUI

struct ProfilesView: View {
    @Environment(MachineStore.self) private var machine

    var body: some View {
        List {
            if machine.profiles.isEmpty {
                Text("Nenhum perfil")
                    .foregroundStyle(.secondary)
            }
            ForEach(machine.profiles) { profile in
                Button {
                    Task { await machine.activateProfile(profile.id) }
                } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(profile.name)
                            Text(String(format: "%.0f°", profile.temperature_c))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if isActive(profile) {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.green)
                        }
                    }
                }
                .disabled(!machine.canCommand || (machine.status?.isRunning ?? false))
            }
        }
        .navigationTitle("Perfis")
        .task { await machine.loadProfiles() }
    }

    // Firmware devolve id ou nome em `profile` (mesma regra do ProfilesScreen).
    private func isActive(_ p: ExtractionProfile) -> Bool {
        let active = machine.status?.profile
        return active == p.id || active == p.name
    }
}
