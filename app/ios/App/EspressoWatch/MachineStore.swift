import Foundation
import WatchKit

/// Estado ao vivo da máquina. Polling de /api/status a cada 1 s enquanto o app
/// está ativo; backoff até 10 s quando a máquina some.
@MainActor
@Observable
final class MachineStore {
    private(set) var status: MachineStatus?
    private(set) var profiles: [ExtractionProfile] = []
    private(set) var online = false
    private(set) var busy = false
    var errorMessage: String?

    private let config: ConfigStore
    private var pollTask: Task<Void, Never>?

    private static let pollInterval: Duration = .seconds(1)
    private static let maxBackoff: Duration = .seconds(10)

    init(config: ConfigStore) {
        self.config = config
    }

    var configured: Bool { config.baseURL != nil }
    var canCommand: Bool { online && config.token != nil && !busy }

    func startPolling() {
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            var delay = Self.pollInterval
            while !Task.isCancelled {
                guard let self else { return }
                let ok = await self.refresh()
                delay = ok ? Self.pollInterval : min(delay * 2, Self.maxBackoff)
                try? await Task.sleep(for: delay)
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    @discardableResult
    func refresh() async -> Bool {
        guard let api = config.api else {
            online = false
            return false
        }
        do {
            apply(try await api.getStatus())
            online = true
            return true
        } catch {
            online = false
            return false
        }
    }

    func loadProfiles() async {
        guard let api = config.api else { return }
        if let list = try? await api.getProfiles() { profiles = list }
    }

    // MARK: comandos

    func toggleExtraction() async {
        let running = status?.isRunning ?? false
        await run { running ? try await $0.stopExtraction() : try await $0.startExtraction() }
    }

    func setLed(_ on: Bool) async { await run { try await $0.setLed(on) } }
    func setPump(_ on: Bool) async { await run { try await $0.setPump(on) } }
    func setSteam(_ on: Bool, temp: Double? = nil) async {
        await run { try await $0.setSteam(on, temp: temp) }
    }
    func setSetpoint(_ temp: Double) async { await run { try await $0.setTempSetpoint(temp) } }
    func activateProfile(_ id: String) async { await run { try await $0.setActiveProfile(id) } }

    /// Todo endpoint mutante devolve o status novo: aplica na hora, sem esperar
    /// o próximo poll.
    private func run(_ action: (MachineAPI) async throws -> MachineStatus) async {
        guard let api = config.api else { return }
        busy = true
        defer { busy = false }
        do {
            apply(try await action(api))
            online = true
        } catch {
            errorMessage = error.localizedDescription
            WKInterfaceDevice.current().play(.failure)
        }
    }

    private func apply(_ new: MachineStatus) {
        let old = status
        status = new
        guard let old else { return }
        let device = WKInterfaceDevice.current()
        if !old.isRunning && new.isRunning {
            device.play(.start)
        } else if old.isRunning && !new.isRunning {
            device.play(.stop)
        } else if !old.ready && new.ready {
            device.play(.success)
        }
    }
}
