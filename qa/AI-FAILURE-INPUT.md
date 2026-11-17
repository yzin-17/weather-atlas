# 问答失败原因与输入处理

日期：2026-11-17，时间口径为 Asia/Shanghai。

## 失败证据与结论

在重新构建前，只读检查 iPhone Air 上仍存活的原始 `WeatherChat` 会话，取得 SDK `_error`：`AiStreamException`，内容为 `{"status":503,"code":"FORECAST_UNAVAILABLE"}`，原界面统一显示 `askFail`。这是流内的服务错误状态，不能据此把承载 SSE 的 HTTP 状态也写成 503。

对应运行日志与纽约共享缓存记录：

- 16:04:02 模型请求返回 200；16:04:12 天气读取耗时 10013.34 毫秒，返回 `stale=true`，纽约故障缓存标记为 `16:04:12.519`。
- 16:04:18、16:04:39 再读纽约天气仍为旧数据，均在 30 秒故障冷却内。服务端问答拒绝使用旧预报，因此返回 `FORECAST_UNAVAILABLE`。
- 当时三次相关模型响应均为 200。纽约上游未留下成功响应事件，约 10 秒的等待符合当前请求超时配置；当次原始异常名称没有记录，不能进一步断言网络、代理或供方内部的具体故障。
- 16:07:17 纽约新预报读取恢复成功。同一句“今天纽约天气怎样”直接 SSE 复测成功，含纽约、`America/New_York`、天气和对应预报依据。

证据：`qa/evidence/ny-question-failure.json`、`ny-question-before.json`、`ny-question-stream-before.txt`、`ny-question-result-before.json`。历史服务日志为 `web-cache-refresh-http.log`。未保存调试 VM 的访问令牌或服务端密钥。

## 修复位置

1. `mobile/lib/questions.dart`：移除发送失败、重试失败后的回填；重试直接使用会话历史，完全不修改输入框里的草稿，包括文字恰好与失败问题相同的草稿。
2. `web/components/AskDialog.tsx`：移除相同回填分支和无用的草稿版本计数；普通发送清空输入，重试保留当前草稿，不重复插入问题。
3. `mobile/lib/weather_chat.dart`、`web/components/weather-chat.ts`：将明确的 `503 / FORECAST_UNAVAILABLE` 映射到四语天气错误提示。
4. `mobile/lib/locale.dart`、`web/lib/ui-text.ts`：显示“天气数据暂时无法更新，请稍后重试”，与通用模型／协议错误区分。

## 验证

| 命令／操作 | 实际结果 | 证据 |
| --- | --- | --- |
| `cd web && npm test` | 150 项通过 | `qa/evidence/ai-failure-input-web-test.log` |
| 根目录 `npx tsc --noEmit`；`cd web && npm run typecheck` | 均通过 | `ai-failure-input-qa-types-final.log`、`ai-failure-input-web-types.log` |
| `cd web && NEXT_DIST_DIR=.next-ai-failure-input npm run build` | 生产构建通过 | `ai-failure-input-web-build.log` |
| `QA_DIST_DIR=.next-ai-failure-input QA_AI_SDK_RUN=ai-failure-input node qa/ai-sdk-browser.ts` | 四语 × 1440、1024、768、390，共 16 项通过；144 次本地模型桩调用，外部模型调用 0 | `ai-failure-input-browser.json`、`ai-failure-input-browser.log` |
| `node qa/ai-failure-live-browser.ts` | 已更新 HTTP／HTTPS 各一条完整失败重试路径通过；六次流错误由浏览器受控注入，外部模型调用 0 | `ai-failure-input-live.json`、`ai-failure-input-live.png` |
| `cd mobile && flutter test` | 当时全量 104 项通过 | `ai-failure-input-flutter-test.log` |
| 增补 SSE 失败后 `flutter test test/weather_chat_test.dart` | 20 项对话专项通过；新增四语用例均包含 HTTP 失败、SSE 失败、重试、相同文字新草稿及单条历史 | `ai-failure-input-flutter-targeted.log` |
| 本轮五个 Flutter 修改／新增文件的 `flutter analyze` | 无问题 | `ai-failure-input-flutter-analyze-scoped.log` |
| `flutter test integration_test/ny_question_test.dart -d 23AB3E1A-4C30-462C-943C-B9CB5B894E96 --dart-define=LIVE_NY_CHAT=true --dart-define=WEATHER_API_BASE=http://127.0.0.1:3300` | iPhone Air、iOS 26.5 原生真实 SSE：纽约回答、目的地时区、依据与空输入全部通过 | `ai-failure-input-native.log` |

表内简写证据位于 `qa/evidence/`。当前工作区同时有其他修改，因此全量数量与上一轮不同；本轮新增四语失败用例为四项。完整 Flutter 分析曾检出 `test/forecast_contract_test.dart:30` 的一条括号风格提示；本轮未修改该并行新增文件，专项分析无问题，完整输出保留在 `ai-failure-input-flutter-analyze.log`。

本轮明确发起两次真实模型调用：直接 SSE 复测一次，原生测试一次。均使用现有 `gpt-6-luna`，模型耗时分别为 2726、2951 毫秒，均返回 200；直接 SSE 总耗时 3011 毫秒。见 `ai-failure-input-model-check.json`。沿用已授权的 `.env.ai.local` 服务端配置，未修改或提交密钥。

## 取舍与运行版本

- 失败问题已经保留在会话中，重试直接取历史；移除回填后无需同时维护“发送文本”和“输入草稿”的恢复版本，减少干扰新输入的分支。
- 保留 10 秒天气超时和 30 秒故障冷却，明确提示稍后重试；不通过增加隐式模型调用、轮询或关闭退避来掩盖暂时故障。AI 继续要求新鲜预报，不根据旧快照编造回答。
- 浏览器受控注入复现故障，真实模型只验证已经恢复的路径；两种证据分别记录。headless HTTPS 测试沿用本地证书信任绕过，原证书和服务端信任配置未改变。
- 原生测试完成后，以 `lib/main.dart` 和独立 `FLUTTER_BUILD_DIR=build/ai-failure-normal` 重建普通应用，避免测试入口混入交付。

HTTP：<http://localhost:3300/zh-Hans>；局域网 HTTPS：<https://192.168.5.22:3443/zh-Hans>。已更新生产构建目录为 `web/.next-ai-failure-input`，服务记录见 `ai-failure-input-services.json`。

普通 iOS 产物：`/Users/yzin/code/weather-atlas/mobile/build/ios-ai-failure-input/Build/Products/Debug-iphonesimulator/Runner.app`，`1.1.2+5`、arm64 Debug 模拟器应用，已安装并打开。安装记录见 `ai-failure-input-installed.json`。本轮未构建 Android 包或实体 iPhone 发布包。
