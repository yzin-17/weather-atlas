# AI 模型选择与兼容验证

日期：2026-11-17，Asia/Shanghai。用户要求比较 `gpt-4.1-mini` 与 `gpt-6-luna`，选择便宜者；沿用已有服务端凭据和本地私有配置，不提交密钥。

## 价格与范围

官方 Standard、短上下文、每百万文本 token：

| 模型 | 输入 | 缓存输入 | 输出 |
| --- | ---: | ---: | ---: |
| `gpt-4.1-mini` | $0.40 | $0.10 | $1.60 |
| `gpt-6-luna` | $0.10 | $0.01 | $0.50 |

来源：[GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)、[标准价格说明](https://openai.com/api/)。按相同 token 数计算，Luna 输入单价低 75%、输出低 68.75%；实际账单还取决于输入长度、缓存命中和模型输出，不把单价差当作固定每次节省比例。

官方 Luna 支持当前 Chat Completions／结构化输出，且支持 `reasoning_effort: none`。本工具只让模型提取天气查询意图，因此默认给 Luna 使用 none，保留现有短 JSON 输出上限和服务器校验计算；本轮无需迁移 Responses API、改变 UI 或引入工具调用。对话框仍是项目手写 React 组件。

## 单阶段执行记录

用户已授权选择便宜模型并执行，无待批准架构变更。当前：已完成适配、真实验证和正常服务切换，`.env.ai.local` 的 `AI_MODEL=gpt-6-luna`；密钥和服务地址保持不变。

- 目标：当前城市问答及双城比较／连续追问都使用 Luna；旧模型配置仍可用。
- 受影响范围：`web/lib/model-transport.ts` 的请求选项、本机 `.env.ai.local` 的模型名、定向回归和现有测试。
- 模型与凭据：只更新 `AI_MODEL`，不替换或公开现有密钥；本地配置保持忽略和 `0600`。
- 验收：模拟 transport 验证单城和比较请求选项，完整 Node 测试，真实当前城市问答与双城三轮验证；记录实际调用数／状态／耗时，再更新服务和结果。
- 不变：超时／限流／版本冲突继续显式返回；无密钥才使用规则模式；天气数值与依据由服务器计算，模型不生成天气事实。

## 执行结果

| 检查 | 实际结果 | 本地证据 |
| --- | --- | --- |
| `cd web && npm test` | **67/67**；新增单城 Luna／原模型请求兼容、双城严格 schema 与服务端天气计算回归 | `qa/evidence/logs/luna-tests.log` |
| 候选生产构建及实际浏览器当前城市问答 | 构建成功；真实 `source=model`、弹窗“AI 解读”；过期版本 409 按原流程刷新后成功 | `qa/evidence/luna-ui.json`、同名 PNG；`luna-build.log` |
| `APP_URL=<候选服务> node qa/luna-comparison-check.ts` | 三轮均为 `gpt-6-luna`：明早 7–9 点降水→下午 12–17 点降水→同一下午最低温度；保留两城，所有数值逐项匹配相应真实 Open-Meteo 快照 | `qa/evidence/luna-comparison.json` |
| 正常生产构建并重启 3300／3443 | 成功；保留原证书、本机代理和密钥。HTTPS 经现有 CA 验证后，实际问答返回 `source=model`，服务端 trace 为 Luna、状态 200 | `qa/evidence/luna-https.json`、`luna-build-final.log` |

本轮定向验证共 **5 次真实 Luna 调用**：候选当前城市 1 次、双城三轮 3 次、正常 HTTPS 1 次，均返回 200。候选四次模型耗时约 1454–3390 ms，为少量功能样本，不作为速度基准；模型名／状态／耗时投影见 `qa/evidence/luna-model-calls.json`。没有切回规则或隐式改用更贵模型。

标准单价已在上表注明，未新增 token 用量或账单估算采集；不声称测得实际费用下降百分比。临时候选服务完成后关闭，正常 HTTP／HTTPS 保持运行。密钥文件继续为 `0600`、Git 忽略且源码归档排除，没有执行 Git 暂存或提交。

最终检查：模型选择、单城／比较两条调用路径、旧模型兼容、版本冲突、公开返回格式和私有配置边界一致。未引入新 API、UI 框架或运行依赖；Web／Flutter 仍使用相同 `/api/ask` 格式。
