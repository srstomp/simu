import Foundation

class Routes {
    static func handle(method: String, path: String, body: String?) -> (Int, String) {
        let json: [String: Any]? = {
            guard let body = body, let data = body.data(using: .utf8) else { return nil }
            return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        }()

        switch (method, path) {
        case ("GET", "/health"):
            return (200, "{\"status\":\"ok\"}")

        case ("POST", "/attach"):
            guard let bundleId = json?["bundleIdentifier"] as? String else {
                return (400, "{\"error\":\"missing bundleIdentifier\"}")
            }
            let ok = AccessibilityService.shared.attach(bundleIdentifier: bundleId)
            return ok
                ? (200, "{\"success\":true}")
                : (400, "{\"error\":\"app not running or not found\"}")

        case ("GET", "/ui/tree"):
            return (200, toJSON(AccessibilityService.shared.getTree()))

        case ("POST", "/ui/find"):
            let results = AccessibilityService.shared.findElements(
                identifier: json?["identifier"] as? String,
                label: json?["label"] as? String,
                elementType: json?["elementType"] as? String
            )
            return (200, toJSON(results))

        case ("POST", "/ui/tap"):
            return (200, toJSON(InteractionService.shared.tap(json ?? [:])))
        case ("POST", "/ui/longPress"):
            return (200, toJSON(InteractionService.shared.longPress(json ?? [:])))
        case ("POST", "/ui/swipe"):
            return (200, toJSON(InteractionService.shared.swipe(json ?? [:])))
        case ("POST", "/ui/type"):
            return (200, toJSON(InteractionService.shared.typeText(json ?? [:])))
        case ("POST", "/ui/clear"):
            return (200, toJSON(InteractionService.shared.clearText(json ?? [:])))
        case ("POST", "/ui/scroll"):
            return (200, toJSON(InteractionService.shared.scroll(json ?? [:])))
        case ("POST", "/ui/wait"):
            return (200, toJSON(InteractionService.shared.waitForElement(json ?? [:])))
        case ("POST", "/ui/exists"):
            return (200, toJSON(InteractionService.shared.elementExists(json ?? [:])))
        case ("POST", "/ui/info"):
            return (200, toJSON(InteractionService.shared.elementInfo(json ?? [:])))
        case ("POST", "/ui/drag"):
            return (200, toJSON(InteractionService.shared.drag(json ?? [:])))
        case ("POST", "/ui/pinch"):
            return (200, toJSON(InteractionService.shared.pinch(json ?? [:])))

        default:
            return (404, "{\"error\":\"not found\"}")
        }
    }

    private static func toJSON(_ obj: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
              let str = String(data: data, encoding: .utf8) else {
            return "{\"error\":\"serialization failed\"}"
        }
        return str
    }
}
