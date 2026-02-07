import Foundation
import Network

class HTTPServer {
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "com.simu.httpserver", attributes: .concurrent)
    private var routeHandler: ((String, String, String?) -> (Int, String))?

    func setRouteHandler(_ handler: @escaping (String, String, String?) -> (Int, String)) {
        self.routeHandler = handler
    }

    func start(completion: @escaping (UInt16?) -> Void) {
        do {
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            listener = try NWListener(using: params, on: .any)

            listener?.newConnectionHandler = { [weak self] conn in
                self?.handleConnection(conn)
            }

            listener?.stateUpdateHandler = { [weak self] state in
                switch state {
                case .ready:
                    completion(self?.listener?.port?.rawValue)
                case .failed:
                    completion(nil)
                default:
                    break
                }
            }

            listener?.start(queue: queue)
        } catch {
            completion(nil)
        }
    }

    private func handleConnection(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, _, _ in
            guard let data = data, let request = String(data: data, encoding: .utf8) else {
                connection.cancel()
                return
            }

            let (method, path, body) = self?.parseRequest(request) ?? ("", "", nil)

            // XCUITest operations must run on the main thread
            var status = 404
            var responseBody = "{\"error\":\"no handler\"}"
            let semaphore = DispatchSemaphore(value: 0)
            DispatchQueue.main.async {
                let result = self?.routeHandler?(method, path, body) ?? (404, "{\"error\":\"no handler\"}")
                status = result.0
                responseBody = result.1
                semaphore.signal()
            }
            semaphore.wait()

            let statusText = status == 200 ? "OK" : status == 400 ? "Bad Request" : "Not Found"
            let response = "HTTP/1.1 \(status) \(statusText)\r\nContent-Type: application/json\r\nContent-Length: \(responseBody.utf8.count)\r\nConnection: close\r\n\r\n\(responseBody)"

            connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }

    private func parseRequest(_ raw: String) -> (String, String, String?) {
        let headerBody = raw.components(separatedBy: "\r\n\r\n")
        let body = headerBody.count > 1 && !headerBody[1].isEmpty ? headerBody[1] : nil
        let lines = headerBody[0].components(separatedBy: "\r\n")
        guard let first = lines.first else { return ("", "", nil) }
        let parts = first.components(separatedBy: " ")
        guard parts.count >= 2 else { return ("", "", nil) }
        return (parts[0], parts[1], body)
    }

    func stop() {
        listener?.cancel()
    }
}
