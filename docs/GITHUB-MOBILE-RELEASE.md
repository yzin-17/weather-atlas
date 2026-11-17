# GitHub 移动端自动构建与 Release

日期：2026-11-17。本配置负责从同一 Git 提交构建移动端普通应用，并把全部产物发布到 GitHub Release；不涉及 Google Play、App Store 或 TestFlight。

## 触发方式

- 推送 `v*` 标签时，自动执行版本校验、Flutter 分析／回归、Android／iOS 构建和 Release 发布。
- 在 Actions 的「移动端构建与发布」中点击 Run workflow：`release_tag` 留空时只构建，产物保留在该次运行的 Artifacts 中；填写已有版本标签时，为该标签构建并发布。
- 标签必须与 `mobile/pubspec.yaml` 匹配。例如 `version: 1.1.2+5` 接受 `v1.1.2` 或 `v1.1.2+5`。不会因填写标签而创建新的 Git tag；手动发布需要先推送该标签。

配置位于 [mobile-release.yml](../.github/workflows/mobile-release.yml)，辅助校验为 [mobile_release.py](../tools/mobile_release.py)。固定 Flutter 3.38.9、JDK 21，Android 使用 Ubuntu 24.04，iOS 使用 macOS 15 及其预装 Xcode。每次 iOS 构建输出 Flutter、Xcode 和 CocoaPods 实际版本，不将本机 Xcode 版本当作托管机器版本。

## 产物与签名

以 `1.1.2+5` 为例，Release 会包含：

| 文件 | 签名与安装方式 |
| --- | --- |
| `Weather-Atlas-v1.1.2-build5-Android-Debug.apk` | Android 调试签名，可安装到设备；不是商店发布签名。 |
| `Weather-Atlas-v1.1.2-build5-iOS-Simulator-Debug.app.zip` | 模拟器 Debug 应用，架构由实际托管机器及 Xcode 决定；解压后安装到兼容架构模拟器。 |
| `Weather-Atlas-v1.1.2-build5-iOS-Device-Release-Unsigned.app.zip` | 未签名设备 Release 应用，不能直接在真机安装。 |
| `BUILD-MANIFEST.json`、`SHA256SUMS` | 记录版本、构建号、完整 Git 提交、文件大小和 SHA-256。 |

所有平台都显式使用 `--target lib/main.dart`。发布前要求三类产物齐全，逐条校验 ZIP／APK CRC、应用结构与调试 kernel 普通入口，拒绝已知集成测试入口。iOS 设备 Release 为 AOT，不要求调试 kernel。

构建任务仅有 `contents: read`，发布任务单独授予 `contents: write`，使用 GitHub 提供的短期 `GITHUB_TOKEN`，不需要个人 PAT。Actions 固定完整提交 SHA。所有构建、分析或归档门禁失败时，都不会公开 Release。

上传先使用草稿，全部上传成功后才公开；同标签的草稿可重新运行恢复上传。已公开版本不会覆盖，需要递增版本／构建号并使用新标签。发布前再次核对远端标签提交，避免构建期间标签移动导致包与源码不一致。预发布版本如 `1.2.0-rc.1+6` 自动标记为 prerelease。

## 仓库配置

在 GitHub 仓库 Settings → Secrets and variables → Actions 配置：

| 类别／名称 | 用途与空值行为 |
| --- | --- |
| Variable `WEATHER_API_BASE` | 写入客户端的默认天气服务 origin，如 `https://weather.example.org`，不是密钥。留空沿用 App 的开发默认值，用户首次安装后需在设置中填写自己的可达服务地址。对外发布时应配置真实公网 HTTPS。 |
| Variable `WEATHER_SITE_URL` | 分享链接的公开网站 origin；留空沿用 App 现有行为，使用当前天气服务地址。 |
| Secret `ANDROID_DEBUG_KEYSTORE_BASE64` | 可选的固定 Android 调试 keystore，别名 `androiddebugkey`、密码 `android`。用于多次 CI 构建保持签名身份。留空由托管机器生成调试签名，不保证能覆盖安装另一次运行或本机签名的旧包。 |

构建变量会公开写入应用，只允许 HTTP(S) origin，不应填入带账号或查询令牌的 URL；服务端模型密钥不进入此流程。临时调试密钥在 Android 任务结束时清理。需要保留原安装数据升级时，须使用原包的同一调试密钥；切勿先卸载来验证数据保留。

将固定调试 keystore 上传到指定仓库的示例命令如下，路径按实际文件调整；标准输入直接传给 `gh`，不输出密钥：

```sh
base64 < ~/.android/debug.keystore | gh secret set ANDROID_DEBUG_KEYSTORE_BASE64 --repo <owner>/<repo>
gh variable set WEATHER_API_BASE --body 'https://实际天气域名' --repo <owner>/<repo>
gh variable set WEATHER_SITE_URL --body 'https://实际网站域名' --repo <owner>/<repo>
```

本轮不会自动上传本机签名或创建新签名。iOS 设备签名需另行提供开发者证书、密码和匹配的描述文件后再配置签名构建；当前流程准确交付未签名产物。

## 发布操作

将完整项目和本次配置提交到目标 GitHub 仓库后，先执行一次留空 `release_tag` 的手动运行。确认三类产物及工具链后，再发布与移动端版本匹配的标签：

```sh
gh workflow run mobile-release.yml --ref main --repo <owner>/<repo>
git tag v1.1.2+5 <已审核的提交>
git push origin v1.1.2+5
```

查看 Actions 中的分析、测试、Android、iOS 和发布任务；最终 Release 页面应有三类移动端产物和两份清单。Artifacts 默认保留 14 天；Release 附件按仓库的 Release 管理策略保留。

## 本次验证与取舍

本次只修改流水线、打包辅助脚本、对应测试和本说明；不改产品、原有签名配置或主线程工作区的其他修改。移动端现有业务测试由流水线运行，不因配置 CI 在本机重复构建整套产品。

本地验证命令：

```sh
actionlint .github/workflows/mobile-release.yml
python3 -m unittest discover -s tools -p test_mobile_release.py -v
```

此外使用已经实际构建的 Android APK、iOS 模拟器和未签名设备 ZIP，按流水线命名在独立临时目录中验证 CRC、普通入口和完整清单；不重新打包或覆盖原交付文件。

| 检查 | 2026-11-17 实际结果 |
| --- | --- |
| `actionlint .github/workflows/mobile-release.yml` | 通过，最终格式检查及 `git diff --check` 同时通过。 |
| 辅助脚本回归 | 7/7 通过，覆盖版本／标签、地址、三类产物齐全、普通入口、缺少 kernel 及越界路径。 |
| 三类历史真实产物 | Android APK 160,669,976 B、iOS 模拟器 ZIP 41,130,957 B、未签名设备 ZIP 7,780,827 B；CRC、应用结构、调试普通入口及完整 SHA-256 清单通过。来源为上一轮 `outputs/v1.1.2-flutter-reverse-recovery`，不是 GitHub 构建结果。 |
| `flutter pub get --help` | 确认已验证 SDK 支持本流程的 `--enforce-lockfile` 参数。 |
| GitHub 托管构建／公开 Release | 手动与标签触发两轮全部通过；`v1.1.2+5` 已公开，5 个附件的状态及服务器摘要已核对，详见下节。 |

首次辅助脚本回归发现本机默认 Python 不支持 `hashlib.file_digest`，已改为标准库分块哈希，以兼容现有工具链。真实旧产物的命名与本流水线命名不同，因此完整清单验证使用本轮约定的文件名，不将改名视为新的构建。

## GitHub 接入与云端证据

按用户授权创建公开仓库 [yzin-17/weather-atlas](https://github.com/yzin-17/weather-atlas)。初次公开使用独立快照，不提交、重置或更改原工作区的 Git 历史和索引。快照只包含可公开源码、测试、精选验收记录和配置示例；本地环境配置、签名、构建缓存及 `qa/evidence` 原始日志不上传。发布前对照本机实际模型密钥并扫描常见凭据格式，没有匹配。

公开源码提交为 `87c6c1befdb927ee4e75d007bbd3c0ffae13e101`，移动端版本 `1.1.2+5`。第一次 [手动构建 44043924516](https://github.com/yzin-17/weather-atlas/actions/runs/44043924516) 于 2026-11-17 16:06–16:15（Asia/Shanghai）完成，五个任务全部成功；Flutter 实际全量 79/79、分析无问题，辅助脚本 7/7。三类产物的 CRC、普通入口及完整清单全部通过。这是当前公开快照的云端结果，与前轮本机 75 项分别记录。

托管 iOS 工具链实际为 Flutter 3.38.9／Dart 3.10.8、Xcode 16.4（16F6），成功构建模拟器 Debug 与设备 Release；没有把本机 Xcode 27.2 或本机模拟器启动结果当作本次 CI 结果。

推送标签 `v1.1.2+5` 后，[自动发布 44045452055](https://github.com/yzin-17/weather-atlas/actions/runs/44045452055) 于 2026-11-17 16:17–16:26（Asia/Shanghai）完成，五个任务全部成功，Flutter 再次 79/79、分析无问题。第一轮只构建，第二轮实际通过标签自动创建和公开 Release，两种触发路径分别验收。

[Release v1.1.2+5](https://github.com/yzin-17/weather-atlas/releases/tag/v1.1.2%2B5) 于 2026-11-17 16:26:43（Asia/Shanghai）公开，`draft=false`，附件共 5 个，均为已上传状态：

| 正式附件 | 字节 | 服务器端 SHA-256 |
| --- | ---: | --- |
| Android Debug APK | 159,222,506 | `b62e7945225eac4039c9b39040093d3850af786c1fc62017ecd9af595bccb42c` |
| iOS Simulator Debug ZIP | 54,447,658 | `27eedeefe8c3d78cdeb7709d5ed27f4af05669c929f309ab06c948a0fd1ca1fb` |
| iOS Device Release Unsigned ZIP | 7,625,952 | `9d150a5e6e11bc58e6fd36221fc11288a79159c15c73fc451a8e5ab19a39e9d6` |

另两份附件为 `BUILD-MANIFEST.json` 与 `SHA256SUMS`。通过 GitHub Release API 读取这两份小文件，逐项核对大附件的名称、大小、`state=uploaded` 和服务器计算的 `digest`，均与流水线已做 CRC 校验的清单一致；没有为验证摘要重复下载大附件。两份清单自身的服务器摘要也与下载内容一致。远端标签提交与清单提交均为上述 `87c6c1b…`。

构建未配置公网 `WEATHER_API_BASE`／`WEATHER_SITE_URL` 或固定调试签名，也没有上传本机签名；Release 说明明确要求首次安装后填写可达的天气服务，并说明 Android 覆盖升级及 iOS 未签名的限制。本次没有将 CI 构建成功写成真机安装、真实 GPS 或商店发布成功。

后续可从公开仓库克隆正常开发，再推送版本标签；原有工作区仍保留未提交修改，本轮没有替它强行合并或改写历史。

## v1.1.3+6 发布记录

2026-11-17 将现有修复推送到公开仓库，公开源码与本机已提交源码的 Git tree 一致。递增版本为 `1.1.3+6`，标签指向 `93614041237a08d3d4717c204a4f0edf1e510077`。[标签发布流水线 44059965214](https://github.com/yzin-17/weather-atlas/actions/runs/44059965214) 的五个任务全部成功：版本辅助测试 7/7，Flutter 分析无问题、全量测试 104/104，Android Debug、iOS Simulator Debug、iOS Device Release Unsigned 均构建成功。主分支与标签对应的两轮 Web 检查也全部通过（44059964116、44059965118）。

[Release v1.1.3+6](https://github.com/yzin-17/weather-atlas/releases/tag/v1.1.3%2B6) 于 2026-11-17 18:03:58（Asia/Shanghai）公开，`draft=false`，5 个附件均为 `uploaded`。下载 `BUILD-MANIFEST.json` 和 `SHA256SUMS`，验证两份文件自身的服务器摘要，并逐项核对三类产物的名称、字节数、服务器摘要和清单提交，全部一致。大附件的 CRC 与应用结构由流水线验证，沿用前轮取舍，不为重复核对摘要再次下载大附件。

| 产物 | 字节 | SHA-256 |
| --- | ---: | --- |
| Android Debug APK | 159,223,910 | `605c12b09df032b122d8e4363a5f3c4374c4b0592a2fde2ad9eac6a5a7c107c9` |
| iOS Simulator Debug ZIP | 54,449,525 | `efefa9b2c521af56f90c30695753631576a018586b4d9745351008f241db56d1` |
| iOS Device Release Unsigned ZIP | 7,631,366 | `30b12a41250dff9309cfd312ff435dedcff14a69d08f2054932c7c0c4e6df8ff` |

源码 ZIP 从上述标签执行 `git archive` 生成，397 个文件、4,263,899 B，SHA-256 为 `df08d8cfa33411e46e6fc2fcc20f4a82badcd36cf0634501e5480ad67597db33`；通过 CRC、版本一致性及凭据扫描。本机交付路径为 `/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.3-build6/Weather-Atlas-Source-v1.1.3-build6.zip`。本节发布证据在标签之后补记，不移动已经公开的标签。

版本取舍：`1.1.3` 是用户版本号；`+6` 是 Flutter 构建号，对应 Android `versionCode` 与 iOS `CFBundleVersion`。Git 标签沿用现有的完整版本格式，便于标签、清单与安装包一一对应；这是项目约定，GitHub 不要求标签包含构建号。构建号需要随发布递增，对外名称可只展示 `v1.1.3`。

本轮沿用已有服务地址变量与签名配置，没有新增线上部署或上传签名。Android 为调试签名包；iOS 设备产物未签名，需要有效证书与描述文件才能安装到真机。本次证据为托管构建和发布校验，没有新增真机安装、GPS 或真实模型验收。
