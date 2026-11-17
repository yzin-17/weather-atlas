# 本地真实 AI 配置与恢复验证

日期：2026-11-17，Asia/Shanghai。用户明确要求复用已有服务端凭据，恢复真实模型；本次没有创建新密钥。

当前模型已按用户的低成本选择改为 `gpt-6-luna`，沿用同一凭据，使用 `reasoning_effort=none` 提取短查询意图。价格、兼容取舍与真实三轮追问结果见 [模型选择记录](AI-MODEL-SELECTION.md)。下方恢复阶段的 `gpt-4.1-mini` 数据为当时的实际验证记录。

## 配置与启动

本机模型配置保存在项目根目录 `.env.ai.local`，包含 `AI_API_KEY`、`AI_BASE_URL` 和 `AI_MODEL`，文件权限为 `0600`。密钥值不写入本文、源码或测试记录。Git 已忽略此文件，源码归档的环境文件过滤也会排除它。

正常启动会读取该文件：

```sh
cd /Users/yzin/code/weather-atlas/web
npm start -- --hostname 0.0.0.0 --port 3300
# 开发服务也会读取相同配置
npm run dev -- --hostname 0.0.0.0 --port 3300
```

在项目根目录执行 `npm run dev:https` 时，HTTPS 启动器同时读取本机模型配置，继续使用既有证书和天气代理配置。启动器保留模型变量，仅清除天气测试上游地址；两个现有本机生产辅助启动脚本也已同步保留模型配置。

显式进程环境优先于文件。`AI_API_KEY` 未配置或明确为空时，`/api/ask` 才进入规则模式；模型超时、限流或调用失败保留错误，不自动冒充规则回答。API 的凭据字段仍沿用项目既有约定 `AI_API_KEY`。

## 取舍

- 模型密钥单独放在 `.env.ai.local`，正常 `dev`／`start` 和 HTTPS 入口读取。构建和独立 QA 实例不会自动加载它，避免无密钥规则验收意外付费调用；独立实例可显式设置空 `AI_API_KEY` 验证规则模式。
- 恢复阶段采用当时已验证的 `gpt-4.1-mini` 及现有凭据；后续按用户价格要求切换至 Luna。模型仍负责提取意图，天气数值与依据由服务器校验和计算。
- 不修改 Web 天气／SEO 实现，不重新构建原生包；本次更改为启动配置和本机凭据持久化。没有执行 Git 暂存或提交。

## 实际验证

`qa/ai-runtime-check.ts` 是显式运行的定向验证；model 预期会调用所选服务的真实模型，不属于默认 Node 测试。

| 验证 | 实际结果 | 本地证据 |
| --- | --- | --- |
| 独立无密钥生产实例 3317 | `source=rules`，模型调用 0；天气版本变化时先 409，再刷新成功 | `qa/evidence/ai-restoration-rules.json` |
| 独立正常配置实例 3316 的实际浏览器弹窗 | `source=model`，界面显示“AI 解读”，依据按钮可用；模型 `gpt-4.1-mini` 返回 200，模型耗时约 2615 ms | `qa/evidence/ai-restoration-ui.json`、同名 PNG |
| 恢复后的 HTTPS 3443 | 使用现有 CA 正常校验，真实 API 返回 `source=model`；模型返回 200，模型耗时约 1406 ms | `qa/evidence/ai-restoration-https.json` |
| 恢复后的 HTTP 3300 实际浏览器弹窗 | `source=model`，界面显示“AI 解读”，可点击预报依据 | `qa/evidence/ai-restoration-http.json`、同名 PNG |
| `cd web && npm test` | 64/64 通过 | 本次工作日志 `ai-restoration-tests.log` |

本次定向验证共 3 次真实模型调用，分别为独立配置实例、当前 HTTPS 和当前 HTTP；409 未调用模型。记录仅保留来源、状态、耗时和公开模型名，不保存密钥或用户问答正文。3316／3317 为专项临时实例，完成后关闭；3300／3443 保持运行。
