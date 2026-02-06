import XCTest

final class SimuBridgeTests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    func testRunBridge() throws {
        let server = HTTPServer()
        server.setRouteHandler { method, path, body in
            Routes.handle(method: method, path: path, body: body)
        }

        let started = expectation(description: "server started")

        server.start { port in
            guard let port = port else {
                XCTFail("Failed to start server")
                return
            }

            let portFilePath = NSTemporaryDirectory() + "simu-bridge-port"
            try? "\(port)".write(toFile: portFilePath, atomically: true, encoding: .utf8)
            print("SIMU_BRIDGE_PORT=\(port)")
            print("SIMU_BRIDGE_PORT_FILE=\(portFilePath)")
            started.fulfill()
        }

        wait(for: [started], timeout: 5.0)

        // Keep test alive indefinitely
        while true {
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 1.0))
        }
    }
}
