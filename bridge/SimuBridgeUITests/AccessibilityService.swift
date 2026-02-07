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
        return [serializeElement(app, depth: 0, maxDepth: 6)]
    }

    func findElements(identifier: String?, label: String?, elementType: String?) -> [[String: Any]] {
        guard let app = app else { return [] }

        var query: XCUIElementQuery

        // Use XCUITest's built-in matching for speed
        if let elementType = elementType, !elementType.isEmpty,
           let type = parseType(elementType) {
            query = app.descendants(matching: type)
        } else {
            query = app.descendants(matching: .any)
        }

        // Apply predicate for identifier/label filtering (server-side, much faster)
        var predicates: [NSPredicate] = []
        if let identifier = identifier, !identifier.isEmpty {
            predicates.append(NSPredicate(format: "identifier == %@", identifier))
        }
        if let label = label, !label.isEmpty {
            predicates.append(NSPredicate(format: "label == %@", label))
        }
        if !predicates.isEmpty {
            query = query.matching(NSCompoundPredicate(andPredicateWithSubpredicates: predicates))
        }

        let count = query.count
        guard count > 0 && count < 200 else {
            return count == 0 ? [] : [["_tooManyResults": count]]
        }

        var results: [[String: Any]] = []
        for i in 0..<min(count, 20) {
            results.append(serializeElement(query.element(boundBy: i), depth: 0, maxDepth: 0))
        }
        return results
    }

    private func serializeElement(_ element: XCUIElement, depth: Int, maxDepth: Int) -> [String: Any] {
        guard depth <= maxDepth else { return ["_truncated": true] }

        var node: [String: Any] = [
            "type": describeType(element.elementType),
            "identifier": element.identifier,
            "label": element.label,
        ]

        // Only add optional fields if non-empty
        if let v = element.value as? String, !v.isEmpty { node["value"] = v }
        if !element.isEnabled { node["isEnabled"] = false }

        let frame = element.frame
        node["frame"] = [
            "x": Int(frame.origin.x),
            "y": Int(frame.origin.y),
            "width": Int(frame.size.width),
            "height": Int(frame.size.height),
        ]

        if depth < maxDepth {
            let children = element.children(matching: .any)
            let count = children.count
            if count > 0 {
                var childNodes: [[String: Any]] = []
                for i in 0..<min(count, 30) {
                    childNodes.append(serializeElement(children.element(boundBy: i), depth: depth + 1, maxDepth: maxDepth))
                }
                if count > 30 { childNodes.append(["_truncated": "\(count - 30) more"]) }
                node["children"] = childNodes
            }
        }

        return node
    }

    private func parseType(_ name: String) -> XCUIElement.ElementType? {
        switch name {
        case "button": return .button
        case "staticText": return .staticText
        case "textField": return .textField
        case "secureTextField": return .secureTextField
        case "image": return .image
        case "scrollView": return .scrollView
        case "table": return .table
        case "cell": return .cell
        case "switch": return .switch
        case "slider": return .slider
        case "navigationBar": return .navigationBar
        case "tabBar": return .tabBar
        case "other": return .other
        case "window": return .window
        default: return nil
        }
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
