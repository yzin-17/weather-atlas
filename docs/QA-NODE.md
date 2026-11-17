# Node 验收工具

项目自编验收和交付脚本使用严格 TypeScript，由 Node 原生类型擦除执行。Swift 的 XCTest 与 OCR、Kotlin 平台入口、Flutter／Dart、CocoaPods 的 Podfile 及原生工程配置继续保留。

## 安装和测试

```bash
npm ci
npm run test:qa
npm run typecheck
npm run typecheck:audit
npm run test:format-hook
```

ZIP 读写使用锁定版本的 `yazl`／`yauzl`，另以 `crc-32` 检查每个解压条目的真实 CRC。大文件按流读取，不将完整 APK 或框架装入内存；凭据检查覆盖数据块边界。

## iOS 权限验收

原来的 `qa/ios-permission-project.rb` 改为：

```bash
node qa/ios-permission-project.ts /tmp/weather-qa/ios-permission-probe qa/ios-permission-ui.swift
```

Node 将版本化的原生工程模板和指定 Swift 测试写入输出目录，不修改产品工程；不再需要 Ruby 的 `xcodeproj` API。接着用 Xcode 准备可运行的测试包：

```bash
xcodebuild build-for-testing \
  -project /tmp/weather-qa/ios-permission-probe/PermissionProbe.xcodeproj \
  -scheme PermissionUI \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/weather-qa/ios-permission-probe/build \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO
```

原来的 `qa/ios-language-permissions.py` 改为：

```bash
node qa/ios-language-permissions.ts 模拟器ID /tmp/weather-qa 正常App路径
```

参数与输出命名保持一致，依次检查 en、zh-Hant、ko。脚本会重启指定模拟器并重新安装 Weather Atlas，因此使用专用验收设备；结果目录需使用未运行过的新目录，避免覆盖已有 `.xcresult`。结束、失败和中断时只恢复原来的 `AppleLanguages` 与 `AppleLocale`，不覆盖其他偏好。恢复失败会明确记录，不能被报告为成功。

系统偏好由 `defaults`／`plutil` 读取；数组用 JSON，标量用 raw，以适配 macOS 的 plist 转换规则。Swift 继续负责真正的系统弹窗点击。

## 交付打包和校验

```bash
DELIVERY_DIR=/tmp/weather-delivery node qa/package-delivery.ts
DELIVERY_DIR=/tmp/weather-delivery node qa/verify-delivery.ts
```

两条命令的接口不变。源码 ZIP、ZIP/APK 的 CRC、模型密钥检查、测试入口拒绝和交付清单 SHA-256 均由 Node 实现，已经移除内嵌 Python。iOS `.app` 与资源分支的归档仍使用 macOS 原生 `ditto`。

交付验证的额外业务规则通过 `verifyDelivery` 参数表达；迁移默认保留原有后缀匹配和入口检查。是否要求某项功能标记由调用方决定，避免把未提交的功能规则混入迁移提交。

只需归档原始验收资料时：

```bash
node qa/archive-evidence.ts /tmp/Weather-Atlas-Verification-Evidence.zip
```

ZIP 以 `evidence/` 为根目录，恢复到项目 `qa/` 即可。完整输出仍由 `.gitignore` 排除，长期证据政策见 [验收索引](verification/README.md)。历史报告中的旧语言命令保留为当时执行事实，当前操作使用本页命令。

## 依赖收敛

删除专供验收／格式化的 Ruff、uv 安装步骤、RuboCop、Bundler、Gemfile／Gemfile.lock、`.rubocop.yml` 和 `pyproject.toml`。项目隔离目录中的旧缓存移出项目保留，没有卸载系统或其他项目的 Python、Ruby、uv、CocoaPods。

`Podfile` 保持原有平台格式，提交前仅运行 Ruby 自带的 `ruby -c`。不为平台配置再安装一套格式化 Gem。其余代码继续由 Oxfmt、Dart、Swift、ktfmt、clang-format 检查。

## 实际验证

本次在 2026-11-17（Asia/Shanghai）验证：

- `npm run test:qa` 的 18 项测试通过，覆盖源码排除规则、CRC 篡改、跨块凭据、集成测试入口、清单不匹配、原生工程生成、三语命令及失败／恢复／中断路径。
- Node 生成的工程在 Xcode 实际 `build-for-testing` 通过；独立 iPhone Air／iOS 26.5 模拟器三语系统弹窗拒绝流程通过，随后实际读回 zh-Hans／zh_CN，最后删除该临时设备。
- 五个已有产物的隔离副本经旧校验器与 Node 校验器验证，条目数、CRC／凭据结论、SHA-256 结论一致。使用副本重新生成的清单，没有改写原交付目录或声称复测了原清单。
- 实际项目源码 ZIP 由 Node 生成并通过 CRC 校验。原始执行记录保留在本地验收目录，本次不重跑天气、模型或性能实验。
- 停用项目内的 Ruff／Bundler 缓存后，`format:setup` 仍通过；提交钩子 5 项专项与完整暂存快照通过。完整快照使用索引中的内容，保护其他未暂存业务改动。
- 另将本次索引导出到独立的新目录，在不存在旧验收输出的条件下运行 `prepare`、`test:qa`、`test:format-hook`，均通过；复用本机已安装的 Node 依赖和原生格式化工具，没有导入业务工作区改动。
