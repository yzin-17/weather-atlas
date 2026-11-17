# Web AI SDK 对话验收与取舍

执行日期：2026-11-17（Asia/Shanghai）。范围：[规格](../docs/specs/2026-11-17-ai-sdk-chat.md) AC1–AC5；仅迁移 Web 对话，原生端保留 JSON。当前服务为真实天气、已有私有模型配置。

同日追加：按用户要求增加前端逐字显示，点击停止同时停止本地展示；没有增加模型调用。当前实现、四语四宽度验收与新增取舍见 [逐字显示记录](ANSWER-REVEAL.md)。下文保留 SDK 首轮集成时的验收与决策。

## 快速演示

1. 打开 `http://localhost:3300/zh-Hans/weather/seoul-1835848`，进入“问天气”，发送“今天广州天气怎样”。发送后输入框立即清空，查询期间显示进度；回答中的广州依据可打开广州当日预报。
2. 追问“明天呢”“那下午呢”“会下雨吗”，确认城市及时间继承，点击小时依据再返回。已有提问后推荐问题消失，历史回答保留。
3. 重新打开首尔城市页，询问“首尔和台北明天早上 7–9 点，哪里更容易下雨？”，再追问“那下午呢？”“哪个更冷？”。点击台北依据，查看 `Asia/Taipei` 和相应日期／小时。
4. 查询尚未完成时点击输入框右下角停止按钮；可继续编辑草稿或重试。失败显示当前语言的错误及重试；版本过期提供“刷新预报并重试”。真实请求可能很快完成，需要稳定重现中断时运行下面的受控浏览器验收。

## 实现位置

| 范围 | 实现及行为 |
| --- | --- |
| SDK 与浏览器传输 | `web/package.json` 固定 `ai@7.0.173`、`@ai-sdk/react@4.0.177`；`web/components/weather-chat.ts` 使用 `DefaultChatTransport`，只发送受限问题及城市上下文；`AskDialog.tsx` 使用 `useChat` 的消息、`sendMessage`、`regenerate`、`stop` |
| SSE 与兼容 | `web/lib/ask-http.ts` 根据 `Accept: text/event-stream` 协商；`ask-stream.ts` 使用 `createUIMessageStream`、`createUIMessageStreamResponse`，发送真实进度、回答文本、结构化天气依据。未请求 SSE 的调用维持原 JSON |
| 失败与重试 | HTTP 前置错误及流内错误均保留安全的状态码／错误码。已开始的 SSE 内部 409／429／504 以错误事件表达；客户端解析后显示四语提示，409 刷新城市快照后重新生成。重试保留较新的草稿，不重复用户消息 |
| 取消 | 响应流取消和请求断开合并到模型传输的 AbortSignal；保留原有模型超时信号。客户端中断时不提交新上下文；共享城市搜索／天气缓存任务可继续完成，任务返回后检查取消，不再启动后续模型调用 |
| 历史与依据 | SDK 保存当前组件生命周期内的全部消息；每条完成回答附上自己的已校验快照，单城与双城依据打开相应城市。收起重开保留；刷新页面或切换当前城市后按原有组件边界重置 |

## 验收命令与结果

以下命令从仓库根执行；真实模型脚本会产生调用费用，受控桩脚本不请求外部模型。

| 命令／操作 | 实际结果及证据 |
| --- | --- |
| `npm run typecheck` | 根目录与 Web 均通过 |
| `npm --prefix web test` | 97/97 通过；新增 `web/tests/ask-stream.test.ts` 4 项，验证先收到进度、JSON 兼容、流内 409、JSON 429、取消模型传输、共享天气读取中止后的模型调用数为 0 |
| `npm run test:qa` | 19/19 通过，覆盖 QA 工具与类型审计门禁 |
| `npm --prefix web run build` | 正式 `.next` 生产构建通过；已重启 3300、3443、3444、3343 对应服务 |
| `node qa/ai-sdk-browser.ts` | 四语 × 1440／1024／768／390，共 16 组通过。最终一轮 128 次本地 HTTP 模型桩请求，16 次挂起请求全部在停止后关闭上游连接；外部模型调用 0。验证 SSE、模型完成前进度可见、429 手动重试、无效响应恢复、流内 409 刷新、历史、草稿保护、停止后的重试和无横向溢出。使用独立临时缓存与配额，退出清理测试进程；没有清生产配额。[结果](evidence/ai-sdk-browser.json)、[窄屏截图](evidence/ai-sdk-history-mobile.png) |
| `APP_URL=http://127.0.0.1:3300 node qa/ask-draft-check.ts` | 更新后的正式 HTTP 服务 20/20 场景通过；拦截问答请求，外部模型调用 0。覆盖发送清空、新草稿、失败恢复、离线、重复发送与已有历史隐藏推荐。[结果](evidence/ask-draft-check.json) |
| `APP_URL=http://127.0.0.1:3319 node qa/single-city-check.ts` | SDK 候选生产构建，390 px，真实 `gpt-6-luna` + Open-Meteo：“今天广州天气怎样 → 明天呢 → 那下午呢 → 会下雨吗”4 轮全部通过，广州坐标／时区、版本、日及小时依据一致，无浏览器错误。[结果](evidence/single-city-model.json)、[日依据](evidence/single-city-model-day.png)、[小时依据](evidence/single-city-model-hour.png) |
| `APP_URL=http://127.0.0.1:3319 MODEL_BROWSER_RUN=ai-sdk-real-comparison EXPECT_OPEN_METEO=1 node qa/model-browser.ts` | 真实模型与天气的首尔／台北三轮全部通过；计划由明早 7–9 点降雨，变为下午 12–17 点降雨，再变为同时间温度；台北依据打开 `Asia/Taipei`，数值逐项匹配快照。[结果](evidence/ai-sdk-real-comparison.json)、[截图](evidence/ai-sdk-real-comparison.png) |
| `APP_URL=http://127.0.0.1:3318 QA_SOURCE=rules node qa/single-city-check.ts` | 候选服务显式空密钥、真实天气，1440 px，四轮规则回答通过；额外受控单城 409 刷新后保留城市、日期和时段。模型调用 0，无浏览器错误。[结果](evidence/single-city-rules.json) |
| `NODE_EXTRA_CA_CERTS="/Users/yzin/Library/Application Support/Weather Atlas/https/ca/rootCA.pem" node qa/ai-sdk-service-check.ts` | 正式 HTTP／HTTPS 城市页均 200；经 HTTPS 代理实际收到 SSE `v1`，首块 6 ms，总计 7594 ms，5 个网络块，进度与回答分别到达。真实广州日预报、时区与依据通过；证书正常验证。[结果](evidence/ai-sdk-service.json) |

3318／3319 候选进程验收后已停止。重跑真实模型或规则候选时，先使用 `NEXT_DIST_DIR=.next-ai-sdk npm --prefix web run build` 构建，再以同一 `NEXT_DIST_DIR` 启动独立端口；规则模式设置显式空 `AI_API_KEY`，真实模式加载根目录 `.env.ai.local`。正式服务仍使用默认 `.next`。SDK 受控浏览器脚本默认复用 `.next`，必要时用 `QA_DIST_DIR` 指定候选目录。

## 模型调用与耗时

模型沿用 `gpt-6-luna`，没有变更私有凭据。以下为服务端模型 HTTP 耗时，区别于浏览器等待天气／城市解析的总耗时。

| 联验 | 本次脚本触发次数 | 服务端模型耗时（ms） |
| --- | ---: | --- |
| 真实单城四轮 | 4 | 4809、2814、1118、2118 |
| 真实双城三轮 | 3 | 4451、2064、2236 |
| 正式 HTTPS 单城 | 1 | 5947 |

已知脚本合计 8 次真实模型调用，全部 HTTP 200。共享 HTTPS 服务同一观察窗口还记录了 1 次模型 200、1177 ms；日志没有问题正文或请求标识，无法归属于本次脚本，按观察总数 9 次单列，不把共享服务日志视为独占流量。候选原始日志位于 `/tmp/weather-atlas-sdk-real-server.log`，正式日志位于旧工作目录 `work/seo-audit-https-server.log`。密钥、Authorization 及问题正文不写入跟踪日志或本报告。

## 取舍及修复过程

- 保留“模型提取查询计划、服务端从天气快照计算数值”的架构。SSE 在上游等待期间发送真实进度，计算并校验完成后按自然段发送文本与依据；不是模型自由回答的逐 token 输出，不加入人为打字延时，也不增加第二次模型改写调用。这样保留数值可追溯性和现有调用成本。
- 使用 SDK 管理浏览器消息与请求生命周期；仍复用已有 `/api/ask` 与模型传输，而非同时迁移模型供应商接口。原生 JSON 客户端无需同步升级；对话正文不持久化到服务端。
- 失败由用户手动重试，不做隐式自动重试；429 不自动连续调用，停止也不自动重新生成。浏览器取消已传递到 HTTP 上游，但服务商对已经开始的计算如何计费仍由其规则决定。
- 对话层中断只取消该次模型请求，不取消共享天气填充，防止影响其他访问者。候选服务的受控测试使用临时缓存，正式共享缓存和配额保持有效。
- 首轮受控验收发现停止按钮在 SDK 同步改变状态后可能变回 submit，导致浏览器默认操作提交新草稿。按钮点击显式 `preventDefault()` 后修复；最终四语四宽度共 16 次停止均验证草稿不变且模型连接关闭。此前失败截图及 JSON 保留为历史诊断：[失败记录](evidence/ai-sdk-browser-failure.json)、[失败截图](evidence/ai-sdk-browser-failure.png)。
- 流测试发现规则城市识别误把“当前”当成地名，`web/lib/single-city.ts` 排除当前／本地／时段等通用词；保留无密钥当前城市问题能力。
- 旧 QA 脚本只等待已有同文回答，迁移到完整历史后可能提前结束 409 重试断言。现改为等待重试响应并验证新版本，修正的是测试等待条件。正式 HTTPS 首次联验遇到旧天气版本的流内 409，发生在模型调用前；等待天气刷新后再次执行成功，未掩盖为直接成功。
- 本轮修改只验证 Web 及本地 HTTPS 运行链路，没有声称完成公网 CDN、移动原生 SDK 迁移或跨页面历史同步。没有新建安装包或重打源码 ZIP。

## 当前地址与启动

Web：[本机](http://localhost:3300/zh-Hans)、[局域网 HTTP](http://192.168.5.22:3300/zh-Hans)、[手机 HTTPS](https://192.168.5.22:3443/zh-Hans)。手机与电脑保持同一局域网，信任项目本地 CA；安装步骤见 [本地 HTTPS](LOCAL-HTTPS.md)。

日常分别运行 `npm --prefix web start -- --hostname 0.0.0.0 --port 3300` 与 `npm run dev:https`；启动前确保对应端口空闲。当前环境通过旧工作目录的 `work/start-seo-audit-services.py` 启动，保留网络代理、模型私有配置及正式天气缓存。局域网 IP 变化时按 HTTPS 文档重新检查证书和访问地址。
