import XCTest

class InteractionService {
    static let shared = InteractionService()

    private func findElement(_ json: [String: Any]) -> XCUIElement? {
        guard let app = AccessibilityService.shared.currentApp() else { return nil }

        if let id = json["identifier"] as? String, !id.isEmpty {
            let el = app.descendants(matching: .any).matching(identifier: id).firstMatch
            if el.exists { return el }
        }
        if let label = json["label"] as? String, !label.isEmpty {
            let el = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
            if el.exists { return el }
        }
        return nil
    }

    func tap(_ json: [String: Any]) -> [String: Any] {
        if let x = json["x"] as? Double, let y = json["y"] as? Double {
            guard let app = AccessibilityService.shared.currentApp() else {
                return ["error": "no app attached"]
            }
            let coord = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
                .withOffset(CGVector(dx: x, dy: y))
            coord.tap()
            return ["success": true, "method": "coordinate"]
        }
        guard let el = findElement(json) else { return ["error": "element not found"] }
        el.tap()
        return ["success": true, "identifier": el.identifier, "label": el.label]
    }

    func longPress(_ json: [String: Any]) -> [String: Any] {
        guard let el = findElement(json) else { return ["error": "element not found"] }
        let duration = json["duration"] as? Double ?? 1.0
        el.press(forDuration: duration)
        return ["success": true]
    }

    func swipe(_ json: [String: Any]) -> [String: Any] {
        guard let direction = json["direction"] as? String else { return ["error": "missing direction"] }
        let target: XCUIElement
        if let el = findElement(json) {
            target = el
        } else if let app = AccessibilityService.shared.currentApp() {
            target = app
        } else {
            return ["error": "no target"]
        }

        switch direction {
        case "up": target.swipeUp()
        case "down": target.swipeDown()
        case "left": target.swipeLeft()
        case "right": target.swipeRight()
        default: return ["error": "invalid direction: \(direction)"]
        }
        return ["success": true]
    }

    func typeText(_ json: [String: Any]) -> [String: Any] {
        guard let text = json["text"] as? String else { return ["error": "missing text"] }
        if let el = findElement(json) {
            el.tap()
            el.typeText(text)
        } else {
            guard let app = AccessibilityService.shared.currentApp() else {
                return ["error": "no app attached"]
            }
            app.typeText(text)
        }
        return ["success": true]
    }

    func clearText(_ json: [String: Any]) -> [String: Any] {
        guard let el = findElement(json) else { return ["error": "element not found"] }
        el.tap()
        guard let value = el.value as? String else { return ["success": true] }
        let deleteString = String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count)
        el.typeText(deleteString)
        return ["success": true]
    }

    func scroll(_ json: [String: Any]) -> [String: Any] {
        return swipe(json)
    }

    func waitForElement(_ json: [String: Any]) -> [String: Any] {
        guard let app = AccessibilityService.shared.currentApp() else {
            return ["error": "no app attached"]
        }
        let timeout = json["timeout"] as? Double ?? 5.0
        let shouldExist = (json["exists"] as? Bool) ?? true

        if let id = json["identifier"] as? String, !id.isEmpty {
            let el = app.descendants(matching: .any).matching(identifier: id).firstMatch
            let result = el.waitForExistence(timeout: timeout)
            return shouldExist == result ? ["success": true] : ["success": false, "timedOut": true]
        }
        return ["error": "must specify identifier"]
    }

    func elementExists(_ json: [String: Any]) -> [String: Any] {
        guard let el = findElement(json) else { return ["exists": false] }
        return ["exists": el.exists]
    }

    func elementInfo(_ json: [String: Any]) -> [String: Any] {
        guard let el = findElement(json) else { return ["error": "element not found"] }
        return [
            "identifier": el.identifier,
            "label": el.label,
            "value": el.value as? String ?? "",
            "placeholderValue": el.placeholderValue ?? "",
            "isEnabled": el.isEnabled,
            "isHittable": el.isHittable,
            "isSelected": el.isSelected,
            "frame": [
                "x": el.frame.origin.x,
                "y": el.frame.origin.y,
                "width": el.frame.size.width,
                "height": el.frame.size.height,
            ],
        ]
    }

    func drag(_ json: [String: Any]) -> [String: Any] {
        guard let app = AccessibilityService.shared.currentApp() else {
            return ["error": "no app attached"]
        }
        guard let fromX = json["fromX"] as? Double, let fromY = json["fromY"] as? Double,
              let toX = json["toX"] as? Double, let toY = json["toY"] as? Double else {
            return ["error": "missing coordinates (fromX, fromY, toX, toY)"]
        }
        let from = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: fromX, dy: fromY))
        let to = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: toX, dy: toY))
        from.press(forDuration: 0.5, thenDragTo: to)
        return ["success": true]
    }

    func pinch(_ json: [String: Any]) -> [String: Any] {
        guard let el = findElement(json) ?? AccessibilityService.shared.currentApp() else {
            return ["error": "no target"]
        }
        let scale = json["scale"] as? Double ?? 2.0
        let velocity = json["velocity"] as? Double ?? 1.0
        el.pinch(withScale: CGFloat(scale), velocity: CGFloat(velocity))
        return ["success": true]
    }
}
