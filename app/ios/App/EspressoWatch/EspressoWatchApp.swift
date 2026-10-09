import SwiftUI

@main
struct EspressoWatchApp: App {
    @State private var config: ConfigStore
    @State private var machine: MachineStore

    init() {
        let config = ConfigStore()
        _config = State(initialValue: config)
        _machine = State(initialValue: MachineStore(config: config))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(config)
                .environment(machine)
        }
    }
}
