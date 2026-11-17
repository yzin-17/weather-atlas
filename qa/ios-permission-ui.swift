import XCTest

// 通过 XCTest 点击实际系统弹窗，可在没有 Simulator.app 图形界面时运行。
final class PermissionUI: XCTestCase {
  func testCopyCityLink() {
    let app = XCUIApplication(bundleIdentifier: "dev.weatheratlas.weatherAtlas")
    app.launch()
    let copy = app.buttons.matching(
      NSPredicate(format: "label MATCHES %@", "Copy city link|复制城市链接|複製城市連結|도시 링크 복사")
    ).firstMatch
    XCTAssertTrue(copy.waitForExistence(timeout: 20))
    copy.tap()
  }
  private func monitor(_ pattern: String, handled: @escaping () -> Void) -> NSObjectProtocol {
    addUIInterruptionMonitor(withDescription: "定位权限") { alert in
      let button = alert.buttons.matching(NSPredicate(format: "label MATCHES %@", pattern))
        .firstMatch
      guard button.exists else { return false }
      let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      image.name = "实际系统定位权限弹窗"
      image.lifetime = .keepAlways
      self.add(image)
      button.tap()
      handled()
      return true
    }
  }
  func testFirstDenial() {
    var handled = false
    let handler = monitor("Don[’']t Allow|不允许|不允許|허용 안 함") { handled = true }
    defer { removeUIInterruptionMonitor(handler) }
    let app = XCUIApplication(bundleIdentifier: "dev.weatheratlas.weatherAtlas")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.terminate()
    app.launch()
    let locate = app.buttons.matching(
      NSPredicate(format: "label CONTAINS %@ OR label CONTAINS %@", "Use my location", "使用当前位置")
    ).firstMatch
    XCTAssertTrue(locate.waitForExistence(timeout: 20))
    locate.tap()
    if handled { return }
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let deny = springboard.buttons.matching(
      NSPredicate(format: "label MATCHES %@", "Don[’']t Allow|不允许|不允許|허용 안 함")
    ).firstMatch
    XCTAssertTrue(deny.waitForExistence(timeout: 10))
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = "iOS 首次定位权限弹窗"
    attachment.lifetime = .keepAlways
    add(attachment)
    deny.tap()
    XCTAssertTrue(
      app.staticTexts.matching(
        NSPredicate(format: "label CONTAINS %@ OR label CONTAINS %@", "permission", "定位权限")
      ).firstMatch.waitForExistence(timeout: 10))
  }
  func testFirstGrant() {
    var handled = false
    let handler = monitor("Allow Once|允许一次|允許一次|한 번 허용") { handled = true }
    defer { removeUIInterruptionMonitor(handler) }
    let app = XCUIApplication(bundleIdentifier: "dev.weatheratlas.weatherAtlas")
    app.terminate()
    app.launch()
    let locate = app.buttons.matching(
      NSPredicate(format: "label CONTAINS %@ OR label CONTAINS %@", "Use my location", "使用当前位置")
    ).firstMatch
    XCTAssertTrue(locate.waitForExistence(timeout: 20))
    locate.tap()
    if handled { return }
    let allow = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons.matching(
      NSPredicate(format: "label MATCHES %@", "Allow Once|允许一次|允許一次|한 번 허용")
    ).firstMatch
    XCTAssertTrue(allow.waitForExistence(timeout: 10))
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = "iOS 首次定位权限允许"
    attachment.lifetime = .keepAlways
    add(attachment)
    allow.tap()
    XCTAssertFalse(allow.waitForExistence(timeout: 2))
    XCTAssertEqual(app.state, .runningForeground)
  }
}
