import XCTest

class AccessibilityService {
    static let shared = AccessibilityService()
    private var app: XCUIApplication?

    func attach(bundleIdentifier: String) -> Bool {
        app = XCUIApplication(bundleIdentifier: bundleIdentifier)
        return app?.state == .runningForeground || app?.state == .runningBackground
    }

    func currentApp() -> XCUIApplication? { app }

    func getTree() -> [[String: Any]] {
        guard let app = app else { return [] }
        return [serializeElement(app, depth: 0)]
    }

    func findElements(identifier: String?, label: String?, elementType: String?) -> [[String: Any]] {
        guard let app = app else { return [] }
        let elements = app.descendants(matching: .any).allElementsBoundByAccessibilityElement

        var results: [[String: Any]] = []
        for element in elements {
            if let identifier = identifier, !identifier.isEmpty, element.identifier != identifier { continue }
            if let label = label, !label.isEmpty, element.label != label { continue }
            if let elementType = elementType, !elementType.isEmpty,
               describeType(element.elementType) != elementType { continue }
            results.append(serializeElement(element, depth: 0))
        }

        return results
    }

    private func serializeElement(_ element: XCUIElement, depth: Int) -> [String: Any] {
        guard depth < 15 else { return ["_truncated": true] }

        var node: [String: Any] = [
            "type": describeType(element.elementType),
            "identifier": element.identifier,
            "label": element.label,
            "value": element.value as? String ?? "",
            "isEnabled": element.isEnabled,
            "isHittable": element.isHittable,
            "frame": [
                "x": element.frame.origin.x,
                "y": element.frame.origin.y,
                "width": element.frame.size.width,
                "height": element.frame.size.height,
            ],
        ]

        let children = element.children(matching: .any)
        let count = children.count
        if count > 0 {
            var childNodes: [[String: Any]] = []
            for i in 0..<min(count, 100) {
                childNodes.append(serializeElement(children.element(boundBy: i), depth: depth + 1))
            }
            node["children"] = childNodes
        }

        return node
    }

    private func describeType(_ type: XCUIElement.ElementType) -> String {
        switch type {
        case .button: return "button"
        case .staticText: return "staticText"
        case .textField: return "textField"
        case .secureTextField: return "secureTextField"
        case .image: return "image"
        case .scrollView: return "scrollView"
        case .table: return "table"
        case .cell: return "cell"
        case .switch: return "switch"
        case .slider: return "slider"
        case .navigationBar: return "navigationBar"
        case .tabBar: return "tabBar"
        case .other: return "other"
        case .application: return "application"
        case .window: return "window"
        default: return "unknown(\(type.rawValue))"
        }
    }
}
