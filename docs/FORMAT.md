# 代码格式化与提交校验

原始证据保管：完整日志、快照和多数截图仅作为本地产物保存；Git 中保留的摘要、精选截图及原始记录位置见 [验收证据索引](verification/README.md)。

项目根目录使用统一入口。格式化只调整代码风格；提交校验不自动格式化或暂存文件。

```bash
npm ci
npm run format:setup
npm run format
npm run format:check
```

`npm ci` 的 `prepare` 自动安装 Husky Git 钩子。首次准备原生格式化工具需要网络；下载和安装结果位于被忽略的 `.format-tools/`。已经准备好的提交检查不联网。

## 工具与覆盖范围

| 代码类型 | 格式化工具 | 版本与配置 |
| --- | --- | --- |
| JavaScript、JSX、TypeScript、TSX、MJS/CJS | Oxfmt | npm 锁定 0.79.0；`.oxfmtrc.json` |
| CSS、JSON、YAML 等源码配置 | Oxfmt | 与 JS 使用同一入口；保留生成的锁文件 |
| Dart | Dart SDK 自带 `dart format` | 使用 Flutter 所带 Dart；项目语言版本 3.10 |
| Swift | Swift 官方 `swift-format` | 使用 Xcode 工具链；`.swift-format.json` |
| Kotlin、Gradle Kotlin DSL | ktfmt | 0.64，Kotlin 官方风格；下载后校验固定 SHA-256 |
| CocoaPods 的 Podfile | Ruby 自带语法校验 | 保留平台配置格式，执行 `ruby -c`；不安装专用格式化 Gem |
| Objective-C／C／C++ 头文件与源码 | clang-format | 使用 Xcode 工具链；`.clang-format` |

使用 `.editorconfig` 统一 LF、缩进和文件末尾换行。没有开启导入排序；JS/TS 由 Oxfmt 处理。

历史验收证据、日志、截图、文档、依赖目录、生成代码、缓存和构建产物不参与代码格式化。`qa/` 下的手写自动化脚本参与检查，`qa/evidence/` 保留原始证据。平台工程 XML、plist、storyboard、pbxproj 和锁文件属于工程元数据，不交给代码格式化工具改写。

## 本机前置条件

- Node.js：本次使用 26；统一工具入口要求至少 22.12。
- Flutter／Dart：优先使用 `DART_BIN` 或 `FLUTTER_ROOT`；也可读取已忽略的 `mobile/android/local.properties` 中的 `flutter.sdk`，或使用 PATH 中的 Dart。
- macOS／Xcode：通过 `xcrun` 查找 `swift-format` 与 `clang-format`。本次 `swift-format` 为 6.4.4。
- Java：ktfmt 使用本机 Java，支持 `JAVA_HOME`；本次为 Java 21。
- Ruby：仅供 CocoaPods 平台配置使用，检查支持 `RUBY_BIN` 或 PATH／Homebrew Ruby；不再为验收或格式化安装 Bundler、RuboCop。

验收脚本统一为 Node，已移除 Ruff、uv 安装步骤以及专用 Gemfile／RuboCop 配置。迁移后的命令、平台配置及验证方法见 [Node 验收工具](QA-NODE.md)。

需要网络代理时，`format:setup` 会读取不提交的 `.env.https.local`；模板不含本机代理地址。

## 提交前强制检查

正常执行 `git commit` 时，Husky 的 `.husky/pre-commit` 自动调用：

```bash
npm run format:staged
```

该命令读取暂存列表，把索引中的源码及格式配置导出到临时目录，再以只检查模式运行各语言工具。未格式化、语法错误、工具缺失或配置错误均返回非零退出码，阻止本次提交。临时目录在完成后删除。

这条路径不运行 `git add`、`git stash`、`git reset`，不改写用户工作区或索引。首次提交、含空格的路径和部分暂存同样接受校验；不会以工作区里已经格式化的新内容代替实际将提交的旧内容。

发现格式问题时，先执行 `npm run format`，再按自己的提交范围重新暂存文件。可以随时执行 `npm run format:check` 检查整个源码树；在 `web/` 目录执行 `npm run format`／`format:check` 也会转发到根目录。

Git 本地钩子仍可被显式 `--no-verify` 绕过。未来连接远程仓库时，应将 `npm run format:check` 接入 CI，并将其设为分支保护必需检查；当前没有为尚未配置的远程仓库声称已启用服务端限制。

## 验证入口

```bash
npm run test:format-hook
cd web && npm test
```

钩子验证使用独立临时 Git 元数据，不创建提交，不暂存用户文件。覆盖未格式化暂存内容、工作区与索引不同、语法错误、暂存配置与工作区配置不同，以及所有语言源码的完整首次暂存，并核对用户索引保持原样。结果记录在 `qa/evidence/format-hook.json`。

## 首次接入时的历史结果

2026-11-17（Asia/Shanghai）实际执行：`npm run format`、`npm run format:check` 均通过，覆盖 136 个源码文件：Oxfmt 110、Dart 13、Swift 4、Kotlin 4、Ruby 3、Python 1、clang-format 1。重复检查没有待格式化文件。

提交钩子的 5 项验证通过：不合格暂存内容被拦截，合格暂存内容通过；工作区和真实索引保持原样。验证包含 142 个源码及配置文件的临时索引，最终由格式化入口筛选实际覆盖范围。真实仓库仍无暂存文件，没有创建提交。

回归结果：Web 55/55 测试通过、生产构建通过；Flutter analyze 无问题、21/21 测试通过。取舍为只格式化源码，保留原始验收数据及生成的工程元数据；Ruby 只执行 Layout 自动修复，避免夹带其他规则修改。同期新增的两处 JS 改动也已按 Oxfmt 处理，没有恢复旧业务代码。

汇总见 [格式化结果](verification/README.md#record-531fd3c123fd)；完整日志在 `qa/evidence/logs/format-*.log`。
