# Weather Atlas 增强实施与本地验收

2026-11-17 Review F-01～F-07：现有代码先分三批提交，修复另分契约、语义色值、天气与 Hooks 三批。151 项 Web、20 项 QA、当时工作区全量 104 项 Flutter、类型／lint／生产构建通过；49 项生产浏览器及同轮名称恢复 21 项、迟到授权 6 项均通过，页面异常为 0。本轮真实模型调用 0 次，未重建原生安装包；逐条判断、首次失败、提交范围及取舍见 [Review 修复验收](../docs/verification/review-repairs.md)。

2026-11-17 问答失败与输入：从运行中 Flutter 会话提取到原始 `503 / FORECAST_UNAVAILABLE`；纽约预报等待约 10 秒后回退旧数据，随后重试命中 30 秒故障冷却，同期模型均为 200。双端失败与重试均不回填输入，保留历史问题和新草稿，并提供独立四语天气读取失败提示。150 项 Web、当时全量 104 项 Flutter、20 项对话专项、16 项 Web 浏览器检查及一次 iPhone Air 真实纽约 SSE 通过；本轮两次真实 `gpt-6-luna` 调用均 200。HTTP／HTTPS 与普通 iOS 模拟器应用已更新；取舍、分析范围及复现见 [问答失败与输入](AI-FAILURE-INPUT.md)。

2026-11-17 Flutter 右下角问答入口：移除逐小时标题旁入口，改为固定绿色胶囊，沿用 Web 的星芒、四语短标签、52 高度和浅阴影，保留安全区与末尾滚动空间。全量 79 项 Flutter 测试、最终四语专项及静态分析通过；已重建并在 iPhone Air（iOS 26.5）安装打开普通 Debug 模拟器应用。实现、构建路径、实际截图和取舍见 [右下角问答入口](FLUTTER-ASK-LAUNCHER.md)。

2026-11-17 Web 缓存刷新：浏览器和 AI 预报刷新使用 `fresh=1` 等待共享更新，SSR 继续立即展示旧快照；区分缓存、更新中与实际失败，补齐仅有本地快照时的自动恢复。125 项 Web 测试、根目录和 Web 类型检查、生产构建通过；21 项受控浏览器检查覆盖四语四宽度、单次上游合并、故障及断网恢复，日常 HTTP／HTTPS 四语 8 项通过。两项服务已更新，未发起模型调用；失败样本、取舍和复现命令见 [Web 缓存刷新](WEB-CACHE-REFRESH.md)。

2026-11-17 Flutter 名称恢复：补齐最多两次自动重试、四语“重新识别城市”、在途禁用、前台恢复与系统语言变化处理，保留原坐标和天气快照。75 项 Flutter 测试、分析、Android／iOS 各五项原生 HTTP 专项通过；每端四语 44 次受控 HTTP，名称恢复不新增天气请求，真实服务两端均显示“高坪区”。`1.1.2+5` 普通入口三类产物已构建并验证安装／签名边界；取舍、失败过程、文件路径与校验见 [Flutter 名称恢复](../docs/verification/flutter-reverse-recovery.md)。

2026-11-17 成都模拟定位与刷新：设置 iPhone Air 为成都原坐标，原生定位、反向地名、Open-Meteo 预报及强制刷新通过。定位失败区分系统服务、权限、超时与其他失败；修复后台缓存更新被 Flutter 误报为刷新失败，网络天气请求通过 `fresh=1` 等待已有共享刷新，保留缓存策略。新增 14 项专项、最终全量 75 项 Flutter 测试通过，分析无问题；增加实际 API 缓存老化回归并更新 HTTP 服务。旧截图具体异常未留存；失败样本、构建和取舍见 [成都定位验收](CHENGDU-LOCATION.md)。

2026-11-17 坐标名称恢复：截图坐标一公里无覆盖已复现，现最多补查十公里行政区域并显示“高坪区”，保留原坐标天气；区分五秒临时故障与五分钟真实空覆盖，Web 加入有界重试、网络恢复及手动重新识别。124 项 Web 测试、类型／构建、四语四宽度恢复及原有加载／授权检查、日常 HTTPS 实页通过。上游耗时、CA 失败、缓存测试修正、取舍和源码见 [坐标名称修复](../docs/verification/reverse-recovery.md)。

2026-11-17 迟到授权恢复：首次定位失败后允许权限会自动重试一次；仍在等待的请求不重复启动，手动选城或卸载会取消恢复。120 项 Web 测试、严格检查／构建、受控 6 项授权与既有首页／SEO 回归通过；当前日常 HTTPS 等待 12 秒后确认仍跳转，手选不被覆盖。已更新 HTTP／HTTPS；具体原因、规范边界、旧版复现、模拟对象失败与新源码见 [迟到授权定位恢复](../docs/verification/location-grant.md)。

2026-11-17 Flutter 流式对话：使用 `ai_ui_stream` 接入 Web 相同的 SSE 协议，支持历史、逐字显示、停止、手动重试、单城／双城追问和对应城市快照依据。全量 Flutter 测试 42 项通过，Android／iOS 四语原生 HTTP 专项各 4/4、合计 48 次受控请求；Android 真实 `gpt-6-luna` 六轮对话通过，实际模型调用 6 次、均为 200。普通入口 Android Debug APK、arm64 iOS 模拟器产物及源码包已构建、校验；命令、实际路径和过程取舍见 [本轮专项报告](FLUTTER-AI-STREAM.md)，不改变下文其他任务的历史验收层级。

2026-11-17 默认城市与推荐：首页定位前／失败时显示深圳，推荐顺序为深圳、首尔、香港、东京、纽约、伦敦；Web 与固定原生候选均已调整，已有收藏保留。112 项 Web 测试、受控四语四宽度／26 项推荐城市／8 项定位／108 份 SEO、实际 HTTPS 首页 19 项检查通过。固定原生快照分析无问题、26 项 Flutter 测试通过，Android 调试与 iOS 模拟器／未签名设备产物已重建。工作区并行问答测试失败、冻结候选、具体取舍与产物见 [深圳默认城市与推荐](../docs/verification/shenzhen-default.md)。

2026-11-17 默认城市 SEO 补漏：用户提供的深圳 `/explore` 地址确实只有 noindex，原因是深圳／香港曾仅加入默认列表，未加入公开城市目录。两城现已提供四语公开页面，旧命名链接在 ID／坐标吻合时 308 跳转；GPS 和任意选点继续保留原坐标。111 项 Web 测试、类型／类型审计、生产构建、受控与日常 HTTPS 各 108 份 SEO HTML、36 项 sitemap、18 项 SEO 浏览器与四语四宽度首页验证通过；源码、过程取舍与边界见 [默认城市 SEO](../docs/verification/default-city-seo.md)。

2026-11-17 问答范围扩展：增加穿衣、户外活动、晾衣、防晒资料说明与天气现象查询，每日概述包含天气描述。真实模型八轮及正式服务两轮通过，四语规则 20 轮、109 项 Web 测试、19 项 QA 测试与类型检查通过；正式构建及 HTTP／HTTPS 服务已更新。过程中的误分类、城市歧义、调用数与建议规则见 [问答扩展验收](WEATHER-ADVICE.md)。

2026-11-17 侧栏入口精简：删除“其他城市”下方地图卡片与专用样式，地图统一从顶部“搜索地点 → 地图选点”进入。四语 × 四宽度入口／布局检查与选址加载回归、类型检查和生产构建结果、网络失败及过程取舍见 [地图入口精简](../docs/verification/map-entry-cleanup.md)。

2026-11-17 选址加载态：确认新地点后立即显示所选位置、四语加载文案与天气占位，隐藏旧天气与旧 AI 入口；Flutter 同步强化加载提示。固定交付快照 107 项 Web、25 项 Flutter、19 项工具测试通过，18 组延迟／失败浏览器检查、20 项问答草稿及双端模拟器各 4 项加载专项通过；日常 HTTP／HTTPS 已更新。过程取舍、具体证据及新版包目录见 [选址加载态](../docs/verification/selection-loading.md)。

2026-11-17 逐字显示追加：Web 回答增加前端逐字效果，网络已结束时也可停止并冻结显示；不增加模型调用。四语四宽度展示、停止、重试、草稿、城市依据和减少动画验收通过，98 项 Web 测试与 19 项 QA 测试通过，生产构建及日常 HTTP／HTTPS 服务已更新。过程取舍与证据见 [逐字显示验收](ANSWER-REVEAL.md)。

2026-11-17 地图简化与地名修复：中文选点惠州显示“惠州市”，英文独立缓存；Web／Flutter 移除地图天气标记、天气预览及其摘要请求，只保留选中点。确认按钮在地图外。实现、首轮失败、取舍、复测与本轮产物见 [地图修复记录](../docs/verification/map-clean.md)。

2026-11-17 Web 对话升级：已接入 Vercel AI SDK，支持 SSE 进度与校验后回答、手动重试和中断生成。四语 × 四宽度 16 组、草稿保护 20 项、真实单城／双城连续追问、规则模式与正式 HTTPS 流式链路通过；97 项 Web 测试、19 项 QA 测试、类型检查和生产构建通过，3300／3443 日常服务已更新。模型调用次数、停止按钮问题及修复、流式粒度取舍见 [AI SDK 验收](AI-SDK-CHAT.md)。

2026-11-17 类型复核：固定源码快照的严格检查、类型审计、97 项 Web 测试、19 项工具测试和独立生产构建通过；自有代码显式／隐式 any、非空／确定赋值断言与检查抑制均为 0，保留两处已说明的类型适配。四语双城 12 轮、依据城市／日期／小时、84 份 SEO HTML 与地名加载等复测通过。实现、首轮失败、取舍与独立快照边界见 [类型复核记录](../docs/verification/type-audit.md)。源码交付目录为 `/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2-type-audit`，固定生产实例为 `http://localhost:3351/zh-Hans`；原有服务保持运行。

本次 TypeScript 迁移：145 个自有 JS／JSX／MJS 文件转为 TS／TSX，根目录与 Web 严格检查、81 项 Web 测试、18 项工具测试和生产构建通过。实现、过程取舍与专项回归见 [TypeScript 验收](../docs/verification/typescript.md)。新版交付目录为 `/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2-typescript`，源码 ZIP 和原生归档的完整性与凭据检查已通过。

原始证据保管：完整日志、快照和多数截图仅作为本地产物保存；Git 中保留的摘要、精选截图及原始记录位置见 [验收证据索引](../docs/verification/README.md)。

执行日期：2026-11-16 至 2026-11-17（Asia/Shanghai）。本机实现、回归、模拟器和构建结果见下文；商业底图、公网／GSC、实体手机和真实用户数据仍有明确资源门禁，未宣布全部验收通过。真实天气在收尾复测已恢复，历史失败与恢复联验分别保留。[任务与剩余义务](../docs/tasks/weather-atlas-enhancements.md)。项目目录已迁至 `/Users/yzin/code/weather-atlas`，保留原始源码对照副本。

## 五分钟演示路径

当前 v1.1.2 的日常入口为 `http://localhost:3300/zh-Hans`，默认请求当前位置；手机使用 `https://192.168.5.22:3443/zh-Hans`，证书安装说明见 [本地 HTTPS](LOCAL-HTTPS.md)。天气与底图均为真实服务，默认 OSM 瓦片经本机缓存转发；正常启动保留 `.env.ai.local`。实际模型恢复专项见 [本地 AI 记录](LOCAL-AI.md)。以下五分钟流程使用固定城市深链；本轮地图验收没有重新调用付费模型。

1. 打开首尔页，查看当前天气、24 小时与 7 天预报；右上语言依次选择繁中、英文、韩文、简中，城市保持首尔。
2. 点击顶部“搜索地点”，再点击“地图选点”，地图只显示所选位置。搜索台北或点地图移动标记；拖动、缩放、选点不取天气或摘要，确认后才进入该点天气。输入 `23.11`、`114.41` 后确认，中文页显示“惠州市”。标准 OSM 保留当地地名，地图内已无语言设置和测试图层；关闭地图后仍可在主页面切四语。
3. 点击右下角悬浮“问天气”，点首尔／台北比较问题，再依次输入“那下午呢？”、“哪个更冷？”。已有问题后推荐入口隐藏；答案保留两城、明天和下午，指标从降水改为最低温度。
4. 点击任一“台北”依据，直接看到 `Asia/Taipei`、日期和 12–17 点小时读数；点“返回”回到答案。关闭问答。
5. 在地图输入 `25.0478,121.5319`，点“查看天气”；名称自动变为台北，切四语可看到台北／臺北／Taipei／타이베이。收藏、复制链接、刷新后仍为该原坐标；也可点“使用当前位置”，首次须授权。名称服务失败时显示已有区域或坐标，不阻塞天气。

自动复现：从仓库根运行 `node qa/browser-check.ts`；浏览器须已通过 `cd web && npx playwright install chromium --only-shell` 安装。截图和网络记录在 `qa/evidence/`。原生端对应集成路径为 `mobile/integration_test/app_flow_test.dart`，实际模拟器结果另列。

## v1.1.2 天气地图改版

Web 桌面窗口上限由 640px 扩至 1180px，手机接近全屏；双端移除地图独立语言选择，保留应用四语。采用真实 OSM 底图和当前／收藏城市天气标记、选中摘要，搜索城市可补一份摘要，任意落针确认后才取完整天气。地图有界准备最多 20 个地点，不为整个视野自动扫天气。默认真实瓦片由 `/api/map-tiles` 缓存转发，历史测试端点正常关闭。

本轮实际 Node **80/80**、Flutter **23/23**、analyze 无问题；生产构建通过。Web 四语／四宽度及晚响应、缺测、瓦片重试共 22 场景通过；当前真实天气生产服务另验证桌面／手机及打开地图后的迟到 GPS 共 3 场景，首页零瓦片、拖动零天气请求。最终 HTTP／HTTPS 原始 HTML SEO 各 84 份、sitemap 28 通过，受控问答草稿 18 条回归通过。Android 17 API 37 与 iOS 26.5 模拟器的真实地图集成各 1/1，通过 PNG 实际解码、两城标记、拖动／落针零预报及确认原坐标；其天气数值来自受控 HTTP，真实模型调用为 0。

同为 900px 高视口，桌面地图实际 **592×315→1138×649**，390 宽度下 **320×315→348×689**；语言选择器 1→0。Android 直连 OSM 六个请求 30 秒未返回，随后改为服务端缓存转发真实图片；跨洲动画的沿途瓦片请求也已消除，上游 12 并发配有界排队，避免正常突发被误拒绝。旧图片不能伪装天气，失效服务不生成替代底图。完整取舍、命令、请求数、设备与早期失败记录见 [天气地图验收](../docs/verification/weather-map.md)。

v1.1.2+4 普通主入口 Android 调试包与 iOS arm64 模拟器产物已构建、安装启动；iOS arm64 真机产物为未签名 release，仍需发布签名才能安装。最新交付目录为 `/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2`，源码、APK、iOS 两类产物及证据分别归档并校验。当前服务保持可达，原有 AI 配置与 CA 保留；下方 v1.1.1 与原 24 小时记录保留历史口径。

## 坐标城市名加载态

2026-11-17 Web 在坐标城市名解析期间显示四语加载文字与旋转提示，保留一行标题空间，不先把长坐标当作大标题；成功后替换城市名，失败／无结果／8.5 秒超时后结束加载并回退区域名或坐标。天气仍独立按原坐标加载，过期地名结果不能覆盖手选，缓存有效名称直接复用；减少动态效果偏好下停止动画。国家缺失的地点说明改为“所选位置”。

Node 实际 71/71，独立与默认生产构建成功。加载态专项在受控上游与当前 HTTP 生产服务各 21 条通过（四宽度×四语及五类缓存／失败／竞态），浏览器错误 0；原反向地理编码浏览器回归 7 条通过；最终 HTTP／HTTPS SEO 各 84 份通过，sitemap 28。加载期间已显示 24 小时预报；名称完成产生的天气请求增量为 0，原坐标不变。首轮过严布局断言、合法旧天气刷新造成的测试计数调整和 390 英文样本 18 px 自然重排均记录于 [反向地理编码补验](../docs/verification/reverse-geocoding.md#2026-11-17-web-城市名加载态补充)。源码包已同步，本轮原生端未修改，模型凭据和 HTTPS 证书保留。

## Next.js 性能优化

2026-11-17 按用户要求补充其他城市页面预取、完整快照摘要复用、搜索／地图／问答模块的意图预热和旧预取快照保护。自动预取只针对收藏顺序前两项，进入视野后闲时执行；更多项靠悬停／聚焦／触摸。慢网、省流量、离线和隐藏状态有界，完整路由缓存 60 秒；天气仍维持 15 分钟新鲜／3 小时旧数据，原始 HTML 与首页默认定位保留。

最终独立生产构建同条件前后五轮交替：受控上游 600 ms，首尔切台北中位数 **664→71 ms**；首屏 JS **161,777→162,787 B**，增加 1,010 B；闲时额外 2 份 RSC 合计 **6,300 B**；LCP **716→708 ms** 仅作观察。点击新增 RSC 1→0；完整预报上游总量 2→3（提前准备两候选，存在一份未访问成本），摘要均一次、真实模型调用 0。首轮预取候选不稳定的失败数据与并行观察分别保留，不混入正式数据。

实际 Node **71/71**；浏览器资源／缓存／失败恢复 14 场景通过，包含四宽度×四语 16 组合；摘要有完整缓存时请求 0，100 收藏仅自动预取 2 项；地图未打开瓦片 0，拖动天气 API 0，预取超过有效期不后台轮询。草稿受控测试 18 条、首页回归 19 条通过。最终 HTTP／原有 CA 校验的 HTTPS 各 84 份 SEO 原始 HTML、28 项 sitemap 和各 9 条定位专项均通过，页面错误 0。服务已更新并保留原有 AI 配置。完整实现、命令、原始证据、代价及复现入口见 [Next.js 性能验收](../docs/verification/next-performance.md)；源码包同步更新，原生二进制沿用现有版本。

## 问天气入口去重

2026-11-17 根据用户截图，移除逐小时标题旁的“问天气”，保留右下角悬浮入口。`Forecast.tsx` 的 Hours 不再接收问答回调；清理旧按钮样式，同步现有浏览器／模型／Android 浏览器 QA 的入口选择器。四语统一使用同一入口，面板开关、焦点返回和草稿行为保留。

独立与默认生产构建通过。实际浏览器覆盖 1440／1024／768／390 和四语共 7 个组合，均只有一个入口、无横向溢出，关闭后重新打开保留草稿；记录为 `qa/evidence/single-ask.json`，1440／390 截图同前缀。现有草稿专项使用受控响应通过，结果见 `qa/evidence/ask-draft-check.json`，没有真实模型调用。HTTP／现有 CA 校验的 HTTPS 原始页面均确认旧入口消失、悬浮入口为 1，见 `qa/evidence/single-ask-production.json`。本轮没有为单个入口删除新增单元测试或重建原生包；现有模型配置和证书保留，源码包同步更新。

## 首页默认定位的后续调整

2026-11-17 用户明确要求首页默认当前位置。已移除首页先恢复旧手选城市的分支，四语首页每次进入都请求新位置（maximumAge=0），首次由浏览器授权；拒绝／超时等失败仍可搜索，手选优先于迟到定位。城市深链和刷新继续尊重 URL。HTTPS 安装页的日常入口也改为首页，保留模型文件和证书。详细实现、取舍与复现命令见 [首页定位记录](../docs/verification/home-location.md)。

本轮实际 Node **67/67**；生产构建通过。当前 HTTP／HTTPS 各 9 个定位场景、页面错误 0；四语×四宽度及定位回归 19 条通过；原始 HTML SEO 84 条通过，sitemap 28。定位与权限为浏览器受控测试，未冒充真机 GPS。源码和证据包更新，原生二进制不变，生产服务保持运行。本轮未重复付费调用模型；AI 最新实际联验仍见其独立记录。

## SEO 全面巡检与修复

2026-11-17 再按用户要求巡检，修复六类问题：分享图片／OG 语言缺失、Accept-Language 权重与 Vary、站点根地址配置静默截断、没有天气快照的城市仍允许索引、demo 禁抓使 noindex 无法被读取、API 缺明确 noindex 头。完整实现、命令、实际观察、初次失败、取舍和原始证据位置见 [SEO 全面巡检](../docs/verification/seo-audit.md)，对应规格与任务已建立。

本轮 Node **64/64**；生产构建与 smoke 通过；HTTP／现有 CA 验证的 HTTPS 各 **84** 个原始页面结果（28 页×普通／Googlebot／Twitterbot），无失败；live sitemap 28；demo **56** 份 HTML 与零 URL sitemap／可读取 noindex 的 robots 通过。最终构建的无缓存失败／恢复／旧快照／过期／实际重试共 6 条结果通过；每次 SSR 上游 1 次。客户端四语、坐标页标记清理及前进／后退共 7 条，四语×四宽度及恢复／定位共 19 条，浏览器错误均为 0。

metadata 与正文共享读取，保证 head 完整；受控 400 ms 上游的单次冷请求 TTFB 修复前 506.23 ms、后 475.48 ms，上游均一次，仅核对等待量级，不宣称性能提升。生产 trace 固定窗口记录预报／摘要／搜索各一次，HTTPS 无新增上游；真实模型调用 0。此前性能实验、真机和公网门禁保持历史口径。本轮源码／证据包与交付清单更新到原 `outputs/v1.1.1`，原生二进制不变，生产服务继续运行。

当前 demo 允许抓取页面以读取 noindex，API 继续禁抓；下文旧报告中“demo robots 禁爬”为当时规则，已由本次策略取代。当前城市无任何可用预报时临时 noindex，正常或三小时内旧快照保持 index。公网、GSC 与搜索实际展示仍没有可冒充的本机结果。

## 首页允许索引的后续调整

2026-11-17 用户明确希望首页也能收录，因此撤回此前将入口一律 noindex 的保守选择。当前 live 的四语首页为 `index, follow`，自指 canonical 和四语互链保留，增加稳定的四语服务介绍与六城入口；sitemap 从 24 增至 **28**。入口显式语言不再被浏览器／历史语言偏好切走，首页语言菜单保留首页地址；已授权定位与上次手选城市恢复继续工作。demo／任意坐标仍 noindex。根路径 `/` 仍语言分流 307，实际索引目标是四个语言首页。

Node **59/59**、生产构建、smoke 通过；HTTP 与现有 CA 验证的 HTTPS 均对普通浏览器／Googlebot 复核 56 份原始 HTML，sitemap 28、首页可索引、JSON-LD、404／坐标策略通过。live／demo 分别实测；真实浏览器四语×四宽度及菜单／恢复／授权定位共 19 条结果通过。详情、取舍、命令、观察和原始证据位置见 [首页索引调整验收](../docs/verification/home-indexing.md)。源码与证据 ZIP 更新到原 `outputs/v1.1.1`，原生二进制无变化。

以上为代码和本机可索引状态，不是已经被搜索引擎收录。公开域名、部署与 GSC 门禁保持后文状态；资源到位后以正式域名部署、复测并提交／检查首页 URL。

## SEO 元数据与结构化数据首次补验

2026-11-17 根据用户反馈追加检查：城市页原有 canonical／hreflang，但语言入口缺少完整元数据；JSON-LD 全站遗漏，原验收脚本也未覆盖该项。当次补全入口与城市元数据，服务端输出 WebSite／WebPage／城市 Place JSON-LD，安全转义并确保客户端换语言同步更新、进入坐标页后清理旧城市标记。当次保留个人化入口／任意坐标 noindex、sitemap 24 个固定城市；首页后续已按用户要求调整为允许索引，以上方新章节为准。

首次补验 Node **58/58**、生产构建和 smoke 通过；HTTP／现有 CA 验证的 HTTPS 分别检查普通浏览器与 Googlebot UA，共各 56 份原始 HTML（4 入口＋24 城市×两种 UA），head 与 JSON-LD 均通过；实际浏览器导航及旧标记清理通过。实现、命令、观察值、原始 HTML 路径、取舍与资源缺口集中见 [SEO 补验记录](../docs/verification/seo-metadata.md)。这修正的是之前未验的范围，后文旧版“24 URL 通过”不代表其当时已经具有 JSON-LD。

新版源码及证据 ZIP 更新到原 `outputs/v1.1.1`，APK／iOS 二进制无变化。当前仍为本机／局域网服务；无公开域名、GSC 提交或收录证据，不把 JSON-LD 补全写成已收录或富结果认证。

## v1.1.1 反向地理编码增量验收

2026-11-17 完成 Web／Flutter 自动城市名、原坐标天气、区域／坐标回退、旧收藏补名、四语与异步竞态。实现、执行命令、逐项观察和原始证据位置见 [新增验收与取舍](../docs/verification/reverse-geocoding.md)。规格为 `docs/specs/2026-11-17-reverse-geocoding.md`。以下其余章节保留 v1.1.0 原验收数据，不把旧版本测试数量或性能当作新增功能复测。

本轮实际结果：Node **55/55**、Flutter **21/21**、分析无问题、生产构建／smoke／真实天气 24 城市 URL SEO 通过。Web 1440／390 宽度专项 7 个结果场景通过；Android／iOS 反查集成各 1/1，原天气／地图／三轮规则问答集成各 1/1。真实 Photon 验证首尔、台北、非目录京都和海上点，每点四语，共 16 次本机 API 查询；不等同 16 次供方请求，语言读取复用共享反查结果。

关键取舍：地名独立并行、6 秒上游／8.5 秒客户端预算；首次 2.5 秒导致超时的失败证据保留。成功缓存 7 天、失败 5 分钟、故障旧名称上限 30 天、最多 1024 条，跨实例串行且间隔至少 1 秒。保留原始天气坐标，不使用反查返回的城市中心；非目录缺译保持供方名称。拖图、目录页和确认前不反查；切语言天气增量 0，收藏改名摘要增量 0。公共 Photon 无 SLA，公开发布需配置兼容服务。真实供方数据、浏览器受控标签、原生受控故障、模拟器、实体设备证据分别记录。

Android 已实际安装 v1.1.0 后 `install -r` 升级 v1.1.1，旧地图点及收藏从“地图选点”改成“台北”，`25.0478,121.5319`、manual 和服务地址不变。iOS 普通包恢复旧点并补名，通过 XCTest 实际复制链接、浏览器深链与安装／构建 kernel 比对；模拟器偏好文件异步落盘，最初过早读取未看到更新，后续确认成功。普通包构建的 `SdkRoot` 警告保留，没有以集成测试入口代替最终应用。

新版交付目录：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.1`。

| 文件 | 类型 |
| --- | --- |
| `Weather-Atlas-Source-v1.1.1.zip` | 源码、回归、中文文档和本地证据；不含环境私有配置、依赖、缓存或签名密钥 |
| `Weather-Atlas-Android-Debug-v1.1.1.apk` | 普通入口 Debug，159,127,250 B，Android Debug Key，已安装升级 |
| `Weather-Atlas-iOS-Simulator-arm64-Debug-v1.1.1.app.zip` | iOS 15+，arm64 模拟器 Debug／ad-hoc，已实际运行 |
| `Weather-Atlas-iOS-Device-arm64-Unsigned-v1.1.1.app.zip` | iOS 15+，arm64 设备 Release／未签名，须 Apple Team 签名后安装 |
| `Weather-Atlas-Verification-Evidence.zip` | 新旧原始证据和日志；`DELIVERY-MANIFEST.json`／`ARTIFACT-VERIFICATION.json` 提供哈希、CRC 和入口校验 |

已执行 `DELIVERY_DIR=<上述目录> node qa/package-delivery.ts` 及同环境的 `node qa/verify-delivery.ts`：五个归档／APK 全部 CRC 通过、清单 SHA-256 一致、未发现当前环境实际模型密钥；两个调试包包含 `/api/reverse` 且无集成测试入口。最初功能扫描误把 macOS `._kernel_blob.bin` 资源元数据当作 Dart kernel，已将校验改为精确文件名并复测；应用本体检查始终通过。原 APK 与新版 APK 均可解包。

服务仍为 HTTP 3300；既有 HTTPS 3443 和证书安装 3444 保留，后端 3343，私钥留在用户 Library。真机 App 菜单填 `http://192.168.5.22:3300` 或信任证书后的 `https://192.168.5.22:3443`；手机浏览器定位使用受信任 HTTPS。Android 默认 `10.0.2.2:3300`、iOS 模拟器 `127.0.0.1:3300`；分享编译地址为 `http://yzinMac-Mini-m6.local:3300`。mDNS 主机名不在当前 HTTPS 证书 SAN 内，HTTPS 使用证书列出的 IP。启动命令沿用下文，HTTPS 使用 `npm run dev:https`（根目录脚本），详见其专门说明。

本轮未重跑地图性能 A/B，原版同条件前后数据及实际变慢方向仍保留后文；首尔反查冷读 2458 ms、其他语言缓存约 1–4 ms 是名称专项，不算天气 TTFB。新增真实模型调用 0。当前没有公网网址；GSC 已提交／公网可抓取／已收录仍均未验证。实体设备、发布签名、商业样式、真实流量缺口与资源到位后的下一步见本报告“待资源到位的验收”。

## 已完成的基线

- 源码：`/Users/yzin/Downloads/Weather-Atlas-Source.zip`，208,977 B、125 条目，`ZipFile.testzip()` 返回 `None`；SHA-256 `cc1f826fe32e5187ab4fd694a54ad0f914efd5e1b7306b0f43a7d15b9744a031`。使用 `unzip -n` 解包，保留原 ZIP，并另解包到相邻 `baseline/weather-atlas` 以供升级前对照。
- 已先读取根 `README.md`、`mobile/README.md`、`qa/RESULTS.md`。共享缓存／统一限流来源为 README“数据、弱网与请求预算”“AI”；真实模型、商业地图、线上用户指标、iOS／真机待验来源为 `qa/RESULTS.md`“Web 与真实数据”“首屏和地图”“Flutter”。未发现清单外另有明确延期项目。
- Web 原始源码：`npm ci` 成功，审计 0 漏洞；`npm test` 实际 25/25 通过；`npm run build` 成功（Next.js 16.4.6，Node v26.13.0，npm 11.20.0）。
- 原始生产服务：`npm start -- --hostname 0.0.0.0 --port 3300` 成功监听。`APP_URL=http://127.0.0.1:3300 node qa/smoke.ts` 在首个真实天气请求失败，上游返回 `429 RATE_LIMITED`；未把后续未执行项目算作通过。
- Flutter：官方整包端点返回 404 后，改用官方 GitHub `flutter/flutter` 的 `3.38.9` 标签取得源码（提交 `67323de285b00232883f53b84095eb72be97d35c`，Dart 3.10.8）。原版 `flutter pub get`、`flutter analyze`、`flutter test --no-pub --reporter compact` 已执行，分析无问题、9/9 通过。Java 21、CocoaPods 1.17.0、Android SDK/NDK、Flutter 引擎和 Maven 依赖已补齐，原版／新版 Android debug 均构建成功，工具下载耗时与应用性能分开记录。

## 取舍与依据

实现与执行入口对应如下；每项的观察值和资源边界在后续章节展开。

| 验收范围 | 关键实现位置 | 实际执行与证据入口 |
| --- | --- | --- |
| 基线、依赖与构建 | `web/package-lock.json`、`mobile/pubspec.lock` | `npm ci/test/build/start`、`qa/smoke.ts`、`flutter doctor/pub get/analyze/test`；`evidence/logs/` |
| 三端主流程、四语、时区与恢复 | `web/components/WeatherScreen.tsx`、`web/lib/weather.ts`、`mobile/lib/controller.dart`、`mobile/lib/locale.dart` | `qa/browser-check.ts`、`qa/browser-resilience.ts`、`qa/global-search.ts`、`qa/network-recovery.ts`、原生集成测试 |
| 双城 AI、上下文与城市依据 | `web/lib/comparison.ts`、`web/lib/ask.ts`、`web/components/AskDialog.tsx`、`mobile/lib/questions.dart` | `qa/real-model.ts`、`qa/model-context-check.ts`、`qa/model-browser.ts`、`qa/model-failures.ts` |
| 地图样式与请求预算 | `web/components/MapDialog.tsx`、`web/app/api/tiles/`、`mobile/lib/location_picker.dart` | `qa/tile-integrity.ts`、浏览器网络记录、`integration_test/app_flow_test.dart` |
| 共享缓存、限流和性能 | `web/lib/shared-store.ts`、`web/components/ServerScreen.tsx`、`qa/prewarm.ts` | `qa/shared-instances.ts`、`qa/model-shared-limit.ts`、`qa/ttfb-check.ts`、`qa/map-performance.ts` |
| SEO 与真实用户采集链路 | `web/app/[locale]/`、`web/app/sitemap.ts`、`web/lib/rum.ts`、`web/components/WebVitals.tsx` | `qa/seo-check.ts`、`qa/rum-check.ts`、`qa/rum-report.ts`，公网状态单列 |
| 原生产物与系统集成 | `mobile/ios/`、`mobile/android/`、`mobile/integration_test/` | `qa/native-artifacts.ts`、构建日志、模拟器记录；真机和签名状态单列 |
| 文档与交付 | `README.md`、`mobile/README.md`、`web/.env.example` | `qa/package-delivery.ts`、`qa/verify-delivery.ts`、交付清单与哈希 |

| 选择 | 原因与替代方案 | 代价、边界及验证 |
| --- | --- | --- |
| 保留 15 分钟新鲜期、3 小时旧数据上限 | 延续已确认业务约定；没有数据支持扩大陈旧窗口 | 过期旧值仅在 3 小时内返回并标记 stale，后台刷新；超过上限必须失败。已增加并发／重启／失效测试 |
| 本机双实例使用共享目录与原子文件锁 | 当前交付不需要额外数据库；同机进程和持久卷可直接复用。跨主机必须挂载同一共享目录或实现集中存储适配 | 不声称不同主机的独立磁盘天然共享。包括锁租约、进程退出恢复、原子 rename；双 Node 子进程验证实际只填充一次与共享 AI 总限流 |
| 小时预报扩到 168，首页仍展示 24 | 明天下午与连续追问常超出原 24 小时覆盖；仅靠原数据无法如实回答 | 增加服务端缓存与响应体积；保留 `hours` 24 点，新增 `comparisonHours`，版本覆盖同一整份快照。后续记录收藏摘要与主详情体积 |
| 比较由服务端计算，模型只提取计划 | 避免模型捏造天气值，统一规则模式与真实模型的数值来源 | 日期、时区、城市、字段、覆盖和版本必须校验；每条证据带城市、时区与版本。缺测时不推断胜者 |
| 追问携带经服务器校验的查询上下文 | 无账户产品无需保存问答正文；城市、日期、时段和指标可明确恢复 | 每轮重新读取快照，过期版本在模型调用前返回 409；更换当前地点不复用旧上下文；一小时上下文有效期 |
| 各城当地时间为默认，绝对时间需明确时区 | “明早 7–9 点”按两地生活时间理解；同一绝对时刻属于另一种明确请求 | IANA 转换保留秋季重复小时，春季不存在小时不伪造；无明确对齐时区不猜测 |
| 提供本地四语测试 PNG，保留默认 OSM | 源码未提供商业地图 Key 或四套真实样式；仍可先验切换、缓存键、视野、确认坐标 | 本地瓦片始终标明测试，不证明真实地图翻译质量；OSM 同 URL 不因切语言改变内容。真实供图列独立门禁 |
| 采用 `web-vitals` 采集标准 LCP/INP/CLS | 自写近似 INP 不足以满足真实指标语义 | 异步加载库有额外 JS；保存严格投影字段，拒绝 URL、IP、精确位置和问题正文；本机受控数据与 production 分开汇总 |
| 使用 3300 而非停止原 3000 服务 | `127.0.0.1:3000` 已由 Docker 监听，保留既有项目运行状态 | Android/iOS 和 smoke 均需显式配置对应端口；最终说明局域网地址和命令 |
| 原始源码单独保存以便性能对照 | 新增比较、RUM 与缓存同时改变包大小和路径，历史数字不能直接作为本机前后对照 | 对照采用相同浏览器、构建、示例数据与节流条件；生产真实上游数据单列 |
| 调试 APK 从源码构建 | 用户最新明确指示，不再等待原版 APK 下载 | 原版 APK 安装对照未执行；可用原始源码构建作行为对照，产物模式与签名分别标识 |

## 当前验证证据

- 新版 Web 共 48/48 通过：双城三轮、四语、绝对时区、缺测、版本切换、受控模型提取／超时／限流、持久缓存、春秋 DST、两个真实 Node 子进程共享 AI 配额，以及城市身份／跨午夜／AI 刷新回归。最终 Flutter 分析无问题，单元与 Widget 测试 16/16，通过四语比较、409 同步、超出首页的依据、分享链接等断言；最终生产构建和 smoke 均成功。完整输出见 `evidence/logs/`。
- 按用户已有授权复用 Shell 中的 `OPENAI_API_KEY`，只映射到独立模型验收服务进程的 `AI_API_KEY`，未写入源码、配置或交付文件。实际模型为 `gpt-4.1-mini`；最初天气数据为隔离 HTTP 夹具，四语各三轮共 12 次实际模型调用全部通过，Web 手机宽度的三轮及台北依据也通过。[四语结果](../docs/verification/README.md#record-a3170841d296)、[浏览器结果](../docs/verification/README.md#record-4d804db8bf9a)。该阶段真实天气上游为 429，不能把这些模型结果当作真实天气验收；恢复后的实际天气联验另列。
- `node qa/model-failures.ts` 另起隔离 HTTP 模型端点：13 秒响应触发服务端 12 秒超时，约 12019 ms 返回 504 `MODEL_TIMEOUT`；模型端点 429 被保留为 429 `MODEL_RATE_LIMITED`。该项 2 次受控 HTTP 调用，外部模型调用 0。[记录](../docs/verification/README.md#record-c1d10c002985)。
- 截至真实天气下 Web／Android／iOS 最终复测，实际模型 HTTP 调用累计 85 次、返回 85 次，均为 `gpt-4.1-mini`，耗时中位数 1457 ms；包含修复前失败和复测，未只统计最后成功样本。HTTP 200 仍可能被计划校验拒绝，应用状态以各专项记录为准。[不含密钥／正文的调用投影](../docs/verification/README.md#record-945b89803751)。其中最后 9 次为三端真实天气联验；规则模式不调用模型，模型故障夹具不计入真实模型次数。
- `MODEL_CACHE_DIR=<隔离缓存> MODEL_TRACE_LOG=<服务日志> node qa/model-context-check.ts`：实际模型与受控天气下，双城查询 200、旧版本追问 409（模型调用增量 0）、刷新保留下午 200；UTC 同一绝对时刻两城依据 epoch 完全一致；台北降水缺测时读数 null、无比较胜者；切到伦敦不带回首尔／台北；原有单城问答与依据仍可用。[记录](../docs/verification/README.md#record-52a08be15290)。
- 新版生产构建已复测通过，共享目录动态路径的文件追踪警告已消除。

## 已取得的交互与网络证据

- `PLAYWRIGHT_BROWSERS_PATH=<浏览器目录> node qa/browser-check.ts`：Chromium 159.0.8154.6，1440、1024、768、390 四宽度，无横向溢出或页面脚本异常；首尔→台北三轮比较和相应依据、地图语言与视野、确认坐标、刷新保留选择、搜索别名／无结果／快速输入通过。[结果](../docs/verification/README.md#record-def0f487db19)。
- 网络记录：首页 0 瓦片；四语界面切换 0 次 `/api/weather`；拖图 0 次预报；确认后坐标 `25.0478,121.5319`。语言切换会请求新语言 SSR/RSC，但天气缓存与语言无关；双实例和上游计数另验，不能仅凭客户端 API 数认定没有服务器请求。
- `node qa/map-resource-budget.ts` 分类检查实际响应体：首屏独立地图／Leaflet 脚本 0、Leaflet 样式 0、瓦片 0；在 390×844 打开地图后为含地图代码的脚本 1、地图样式表 1、瓦片 6。首页地图入口按钮的通用页面样式不等于已加载 Leaflet。[请求 URL 与分类记录](../docs/verification/README.md#record-02761744a475)。
- `node qa/language-cache.ts` 在预热六城后请求 24 个四语 SSR 页面：上游预报计数 9→9，新增 0；同时确认 HTML 不传完整 `comparisonHours`。[记录](../docs/verification/README.md#record-2ed04389f065)。
- `node qa/sharing-check.ts` 实际写入、读取浏览器剪贴板并打开台北四语链接，语言与目的城市均正确。非安全 HTTP 浏览器退回可复制文本提示，避免假称剪贴板写入成功。[记录](../docs/verification/README.md#record-11cd73a1f978)。
- `node qa/browser-resilience.ts`：已授权 GPS 尊重台北深链；定位迟到不覆盖手选；拒绝（1）和超时（3）后手动选择成功；修改两城快照版本后得到 `[200,409,200]`，刷新保持下午上下文。[结果](../docs/verification/README.md#record-e03719617a41)、[依据页截图](../docs/verification/README.md#record-b96eca31932e)。定位结果为受控浏览器注入，不能当作真实 GPS 验收。
- `node qa/global-search.ts`：真实全球服务 `서울` 1 个、`台北` 1 个、`Paris` 8 个（带国家、省州）、非目录 Kyoto 5 个、无结果词 0 个。[结果](../docs/verification/README.md#record-456fb4aed016)。
- `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 node qa/live-weather.ts`：先前两轮各 2 次真实预报调用均 429，直连曾 10 秒超时；2026-11-17 00:11（Asia/Shanghai）再次复测，首尔／台北均成功，source 为 `open-meteo`、24／168 小时、正确目的地时区，耗时约 1109／268 ms。[先前失败](../docs/verification/README.md#record-035107c7929d)、[恢复结果](../docs/verification/README.md#record-afabfaf55dda)。该专项三轮共 6 次实际预报调用，不含其他专项请求。
- `node qa/network-recovery.ts`：生产服务首次无可用缓存时显示失败／重试；恢复后 24 小时可见；3 小时内旧数据保留采集时间和陈旧标记，后台恢复后移除标记；受控上游延迟 11 秒时约 10018 ms 返回 503。[结果](../docs/verification/README.md#record-2132fae4aaf1)。
- `node qa/tile-integrity.ts`：四种语言的测试 PNG 哈希互异，同 URL 重取哈希不变；实际 OSM `7/109/49.png` 两次均 200、SHA-256 相同，证明重新下载同一瓦片不会改变地名语言。[结果](../docs/verification/README.md#record-a3e1d0026e0d)。
- 参考 [Rain 源码](https://github.com/darkmoonight/Rain) 的逐小时、预报、城市与地图组织；本轮保留 Weather Atlas 既有界面结构，未引入其额外 AQI、通知或小组件范围。

## 已取得的性能与采集证据

`node qa/shared-instances.ts` 使用 `3301/3302` 两个 Next 生产实例和 `qa/upstream-fixture.ts` 的受控 HTTP 上游：20 个同城并发只产生 1 次上游请求；暖 API 为 1.67/1.73 ms；旧数据 2.12 ms 返回且采集时间不变，4 小时数据失败 503，网络恢复后 200。AI 26 次请求为 24 个 200、2 个 429，规则模式模型调用 0 次。[原始记录](../docs/verification/README.md#record-366314b77202)。收藏摘要 1/3/6 城响应分别 80/178/327 B，上游摘要累计 0/1/2 次，复用已有首尔详情并批量获取新增摘要。

`VERIFICATION_WORK=<临时目录> node qa/model-shared-limit.ts` 再以两个开启真实模型的独立生产进程复核：隔离共享目录预置 23 个当分钟配额时间戳，并发实际发出 2 个问题，得到 200／429，仅产生 1 次实际模型调用；包含预热与比较的天气上游增量另保存在结果中。预置时间戳是受控接近阈值条件，不声称已经真实调用 23 次。[实际模型双实例限流](../docs/verification/README.md#record-02da7d174aef)。

`node qa/ttfb-check.ts` 对照原始源码与新版，使用同一生产 Node、Googlebot 原始 HTML、受控 4000 ms 上游；基线通过运行时 fetch 钩子接入同一夹具，原始源码保持不变。冷缓存原版 4219 ms、新版 4172 ms；五次暖缓存中位数原版 8.07 ms、新版 7.54 ms；重启首次原版 4155 ms（1 次上游）、新版 119 ms（0 次上游）。原始 HTML 为 61,703 B，新版 62,061 B，仍有可读天气正文。新版冷请求上游等待 4010.83 ms、含缓存处理的天气读取 4033.30 ms、SSR 天气阶段 4033.43 ms，TTFB 剩余约 139 ms 包括路由、渲染和传输，不能当作纯 SSR 计算。重启天气读取约 7.46 ms，SSR 天气阶段约 7.57 ms，剩余包括进程首次路由初始化与传输；上游等待与服务端 trace 一并保存。该次测量时真实上游仍限流，因此这些受控值不能称为真实服务冷启动成绩，也不能用历史 4232/35 ms 当作本机对照。[原始记录及服务端 trace](../docs/verification/README.md#record-33955064ea65)。

`node qa/map-performance.ts`：五轮交替（奇数 lazy→eager，偶数反向），390×844、CPU 3×、下行 1.6 Mbps、RTT 70 ms、禁用缓存、同一 demo 天气／本地 PNG；eager 仅在首页预加载 MapDialog 与 Leaflet。中位数如下；历史实验保持在 `qa/map-loading-ab.json`，不混入本轮统计。

| 指标 | 按需加载 | 首页预加载 |
| --- | ---: | ---: |
| 首屏 JS 实际传输 | 160,162 B | 205,992 B |
| LCP | 392 ms | 380 ms |
| 点击至地图可操作 | 888.4 ms | 394.5 ms |
| 点击至首张瓦片可见 | 996.4 ms | 679.9 ms |

[五轮原始数据](../docs/verification/README.md#record-7d7cccec21d9)。按需版减少 JS 45,830 B，点击至可操作增加 493.9 ms，首瓦片增加 316.5 ms；本轮 LCP 也略慢，不能把历史 LCP 改善直接沿用为本轮结论。

本机 Lighthouse 13.6.0 单独运行（mobile 412×823、模拟节流 4× CPU／150 ms RTT／约 1.6 Mbps），性能分 84，LCP 608 ms、CLS 0、TBT 662 ms。TBT 不能当作 INP，且这不是线上用户数据。[完整 JSON](../docs/verification/README.md#record-015672d3a4c1)。

`node qa/seo-check.ts`：24 URL 原始 HTML 全通过正文／标题／描述／lang／canonical／互指 hreflang；live 受控模式 sitemap 24 URL，demo 为 0；无效城市 404，自由坐标 noindex。分别见 [live 结构结果](../docs/verification/README.md#record-050593bb05b3)、[demo 结果](../docs/verification/README.md#record-e7f2a6a1a5c3)。公开 HTTPS、GSC 提交／抓取／收录均未验证，无可报告的公网网址。

`node qa/rum-check.ts` 使用浏览器实际 `web-vitals`→`sendBeacon`→共享目录入库；已看到 204、LCP/INP/CLS 三种记录，字段投影检查通过。[受控记录](../docs/verification/README.md#record-655c3fad20e2)。截至该次读取为 4 条指标（LCP 2、INP 1、CLS 1），观察窗口约 1.6 秒；LCP p75 540 ms、INP 64 ms、CLS 0.0117，仅证明链路。真实用户样本 0，尚无可报告的真实 p75；后续可在 `web/` 执行 `npm run rum:report` 按数据集／语言／页面类型／设备复核。

## 收尾真实天气恢复联验

2026-11-17 00:11 起本出口预报恢复，继续完成此前被 429 阻塞的本机项目。独立生产服务 3306 使用真实 Open-Meteo、`gpt-4.1-mini`、全新共享缓存目录和既有进程级代理，未配置夹具 URL。`APP_URL=http://127.0.0.1:3306 MODEL_BROWSER_RUN=live-model-browser EXPECT_OPEN_METEO=1 node qa/model-browser.ts` 三轮通过，每城快照 source 明确断言 `open-meteo`，点击台北依据可见相应时区。[Web 原始快照](../docs/verification/README.md#record-b7b31c260d60)、[实际页面](../docs/verification/README.md#record-10c738f15201)。

Android／iOS 各将完整原生集成场景指向该真实服务的临时记录代理 3312／3313，均 1/1 通过（约 58／56 秒），包含四语、三轮问答、台北依据、四语地图、确认选点、搜索和收藏。每条比较证据的版本、坐标、时区、小时值逐点匹配相应快照，并断言 source 为 `open-meteo`；地图预算仍为首页／语言／拖动／确认前 0，确认后 1 次。[Android](../docs/verification/README.md#record-6a02fe462a73)、[iOS](../docs/verification/README.md#record-05306a7c5ac3)。

本次三端读数一致，日期均为各地当地 2026-11-18；这些是该次快照，不是以后访问的固定答案：

| 问题 | 首尔 | 台北 | 计算 |
| --- | ---: | ---: | --- |
| 明早 7–9 点更容易下雨 | 0% | 1% | 时段小时降水概率最大值 |
| 那下午呢（12–17 点） | 24% | 81% | 保留两城／日期／指标，只改时段 |
| 哪个更冷 | 6.9°C | 20.2°C | 保留两城／日期／下午，改为最低温度 |

真实服务首次空缓存 Googlebot HTML 请求：TTFB 2027 ms、55,548 B，可读首尔天气正文；上游等待 1970.50 ms、天气读取 1991.61 ms、SSR 天气阶段 1991.69 ms。这是单次真实端点记录，不能替代上文 4 秒固定上游的同条件前后对照。[真实 TTFB 与 trace](../docs/verification/README.md#record-96a5f789042d)。

该独立模型服务从启动到三端结束实际观察到 4 次预报 HTTP 响应（首尔、台北、两端各自地图点）、1 次批量摘要、1 次全球搜索，以及 9 次真实模型调用；主服务 3300 真实 24 URL／smoke 期间为 6 次预报、1 次摘要、1 次搜索。[按类别计数与全部 HTTP trace](../docs/verification/README.md#record-7b7a48922722)。先前没有 Node 代理的 10 秒失败尝试另记，不能用成功响应 trace 证明失败请求已到达远端。

`APP_URL=http://127.0.0.1:3300 SITE_URL=http://localhost:3300 QA_SEO_RUN=seo-live-real node qa/seo-check.ts`：真实六城×四语 24 个原始 HTML 全通过，sitemap 24、无效城市 404、坐标 noindex、robots／canonical／互指 hreflang 正确；真实天气主服务 smoke 也通过。[真实天气 SEO](../docs/verification/README.md#record-fe12dd901d36)。此前夹具 [24 URL 结构记录](../docs/verification/README.md#record-6ef05e03d960) 与 [demo 禁索引记录](../docs/verification/README.md#record-e7f2a6a1a5c3) 保留。没有公开 HTTPS 或 GSC 授权，本地成功不等于已提交／可公网抓取／已收录。

## 巡检中追加的取舍与修复

| 问题 | 处理及代价 |
| --- | --- |
| 点击依据后仍停在长答案中部 | 比较依据在弹窗内独立展示并置顶、可返回；补验手机首屏可见，避免只检查 DOM 存在 |
| 409 刷新后主页面仍可能保留旧版本 | 双端把刷新的当前地点快照同步回主页面；上下文继续保留两城和原时段 |
| RUM 同源校验误拒绝 127.0.0.1 访问 | Next 内部 URL 为 localhost 时改用实际 Host 配对协议校验；受控浏览器链路重测 204 |
| 缓存可能跨测试／正式上游复用 | 缓存键加入上游地址摘要，不输出地址或密钥到日志；不同来源不拼接 |
| SSR/API 模块副本令 `instanceof` 错误识别失败 | 受控 11 秒上游延迟实测曾误报 500；使用进程内稳定错误身份后恢复 503，并加入独立模块副本回归测试。错误日志仅记录名称／代码，无位置和正文 |
| 168 小时同时传到首页增加 HTML | 完整周小时快照保留在服务端，SSR 客户端初值仅传 24 点、7 天和版本；比较证据仍返回相应完整快照，不减少数据校验 |
| 当前城市依据也可能超出首页 24 点 | 双端超出首页可见范围时打开该日小时依据，避免只跳回没有对应小时的列表；当前可见小时仍直接定位 |
| 首次原生工具链缺失 | 安装匹配 Flutter 版本、Java 21、CocoaPods、Android 工具与 NDK；保留系统现有 SDK 和既有服务；下载耗时单独记录，不作为应用冷启动 |
| Android Maven 代理慢且发生 TLS `bad_record_mac` | 已下载的依赖留在 Gradle 缓存，探测相同 Google Maven 文件直连 1 MB 约 1.84 秒后，对 Maven 域名设置进程级 `http.nonProxyHosts`，保留其他域名代理；未替换第三方 JAR 或修改系统代理 |
| SDK 安装器仍连接已有代理 | 不修改系统设置；从 Google 官方仓库元数据取得 Build-Tools 35 的 URL／SHA-1，直连分段下载 76,857,898 B 并校验 SHA-1 `93ab8ce91230e067b5add4bfa79919c52b27f072`、ZIP CRC 后解包安装。SDK/Gradle 状态与源码、性能测量分开保存 |
| SDK 元数据的同路径条目包含扩展包 | 初版下载脚本选中了 35-ext15，安装检查发现包身份不符；改按 revision 选择基础 SDK 35 r2，官方 ZIP 64,273,788 B、SHA-1 `0bb560a90a7a2cbd0dd8348224d518b638fe7949`。扩展包移到自身目录，未修改任何第三方包内容 |
| 后续构建需要 CMake 3.22.1 | 使用相同官方元数据／分段下载／校验流程补齐，ZIP 38,223,266 B、SHA-1 `8604eeef9adadb626dbb70a7ff58a87e6a7b967a`；未跳过原生构建步骤或伪造产物 |
| Java 自动继承 macOS 代理 | 用新 JVM 的属性与连接实测确认；构建进程设置 `JAVA_TOOL_OPTIONS='-Dhttp.proxyHost= -Dhttps.proxyHost= -DsocksProxyHost= -Djava.net.useSystemProxies=false'`，确认 Maven 连接直接到远端 443。隔离 Gradle 状态目录、复用已校验缓存，保留系统代理 |
| 交付前局域网地址变化 | `ipconfig getifaddr en1` 复核从先前 `.22` 变为 `192.168.5.7`；按当前地址重新配置设备构建与公开分享地址，并保留 App“天气服务地址”入口供网络变化后调整 |
| 构建期间宿主机负载影响工具响应 | 本机内存 24 GB，曾观察到约 33.8 GB swap；构建日志随后中断且没有退出结果，未把中断算作构建通过。改用独立构建进程、Gradle 2 GB／2 个 worker、Kotlin 同进程，串行原生验收；构建资源不冒充 App profile 帧性能 |
| Flutter 大型调试引擎 JAR 吞吐低 | Google 原站实测约 10 秒仅读取 327,680 B；采用 [Flutter 文档列出的 CFUG 社区镜像](https://docs.flutter.dev/community/china)，保留完整分片，并逐个与 Google 原站返回的 CRC32C、ZIP CRC 核对，记录本地 SHA-256。三个架构合计约 385 MB，仅放入本次隔离 Maven 仓库，依赖版本和二进制内容保持一致 |
| 隔离 Maven 初始化影响了 SDK 的 included build | 首次配置被 Flutter SDK 的仓库策略拒绝；把配置范围收窄到本项目 `mobile/android`，不向 SDK 的 included build 注入仓库。引擎／编译器校验记录见 `evidence/mobile-maven-manifest.json` |
| 用户要求迁移项目到 code | 已整体移动到 `/Users/yzin/code/weather-atlas`，保留代码、依赖、缓存和证据；重启项目服务并重新生成 Flutter 本机配置。源码原包和对照副本保留在聊天工作区 |
| Xcode 27.2 拒绝 iOS 13 目标 | Runner、Flutter framework 和 Pods 统一最低 iOS 15；因此此版不再支持 iOS 13/14。原生模拟器构建通过，真机最低系统兼容仍须设备验收 |
| 双架构模拟器通用构建失败 | 本机 `lipo -verify_arch arm64 x86_64` 实际失败，而单架构校验正常；采用明确的 arm64 模拟器构建和设备定向集成运行，不修改 Flutter SDK 或伪造成功 |
| smoke 在旧缓存后台更新时遇到 409 | 冒烟脚本按实际客户端流程重新取快照并重问一次，仍单独断言旧版本被拒绝；不把有效的版本冲突当作服务不稳定 |
| 实际模型在“哪个更冷”时把下午改成全天 | 服务端对未明确修改的日期／时段继承上下文，增加故意返回错误计划的模型回归用例；重新执行四语真实模型三轮 |
| 韩文追问重新解析城市导致歧义 | 明确出现的两座内置城市优先采用已校验身份；短追问保留既有城市，避免模型重复地理编码；任意新城市仍需全球搜索校验 |
| 绝对时刻真实模型输出无效计划 | 比较接口改为严格 JSON Schema，固定 `window=local`，对齐时区独立由 `alignmentZone` 表达；保留服务端范围／时区校验，不用模型值计算天气 |
| 切城后模型自行补回示例城市 | 没有有效上下文的短追问直接要求指定城市，阻止模型用提示词示例填空；真实模型上下文专项及拒绝调用的单元断言通过 |
| 模型可能自行选择对齐时区 | 同一绝对时刻必须能从用户文本提取有效 IANA 时区或 UTC；不采用模型猜测值，缺少明确时区时要求补充 |
| Android 浏览器软键盘挤压弹窗 | 配置 `interactive-widget=resizes-content`，并按 `visualViewport` 调整弹窗与聚焦滚动；模拟器 Chrome 真正显示系统键盘后实测输入框和发送按钮可见 |
| 客户端上下文城市坐标可被篡改 | 每轮对照目录或原始全球搜索重新校验城市身份；非目录城市保留搜索词供复验，展示名采用服务端值，伪造坐标在模型调用前被拒绝 |
| 三轮追问跨过城市当地午夜 | 上下文新增 `dateAnchor`，保留首轮的相对日期基点；显式修改日期时重新取基点，一小时有效期仍按原规则限制。增加午夜前后四轮确定性回归；首尔与台北各自跨午夜，所以“明天”的日历日期可以不同 |
| AI 读取健康但过期的另一个城市缓存时误报缺测 | AI 使用 `getWeather(...,{fresh:true})` 等待刷新，普通天气页继续快速返回旧值。增加先失败后修复通过的回归；不扩大 15 分钟／3 小时窗口，真正刷新失败仍按缺测处理 |
| Android 地图确认后测试等待离屏小时列表 | 实际接口已 200，失败来自惰性列表不可见；调整集成测试先滚回顶部，再核对小时区与分享坐标，保留失败记录，未为测试改动产品逻辑 |
| Android 模拟器低精度定位未返回 | 系统授权后，网络 provider 禁用、fused 无最近位置；持续注入 GPS 与测试网络 provider 仍超时。保留失败证据和粗略前台定位设计，未为了模拟器强制请求精确位置；实际超时后手动搜城通过，真机定位列待验 |
| Xcode 缺少图形版 Simulator.app | 未把 GUI 缺失当作全部 iOS 验收阻塞。独立 XCTest UI 工程已实际点击定位拒绝／允许，导出系统截图；首轮失败因系统按钮中文及遗留弹窗被默认处理，修正查询和中断处理后复测通过。测试工程不修改产品工程 |
| 多轮 Android 增量打包留下无引用 ZIP 间隙 | 正常 Debug APK 曾为 197,075,224 B；检查发现两处约 25.3 MB／12.7 MB 间隙。只移出本项目 `packageDebug` 增量状态与旧生成 APK 后重新构建，降为 159,121,186 B，减少 37,954,038 B。清理前后每个 ZIP 条目的 SHA-256 完全一致、签名复核通过并重新安装，未删功能或修改依赖；见 `evidence/android-apk-size.json` |
| 交付复查时 DHCP 地址再次变化 | `.7` 再次变为 `.22`；最终三种 App 分享地址统一为 `http://yzinMac-Mini-m6.local:3300`，iOS 设备默认 API 也使用该主机名，模拟器 API 保持专用地址。XCTest 实际点击复制后读取剪贴板，并打开四语真实城市页均 200；三个产物均检查已无旧 `.7` 编译地址。Android NAT 模拟器不能解析 mDNS，因此不能把宿主机成功当作实体手机已验；同网手机需支持 mDNS，也可按当前 IP 手动配置 API。此配置变化后最终 APK 为 159,121,194 B，见 `evidence/stable-local-address.json` |

## 移动端实际环境与验收

macOS 27.2 arm64、Xcode 27.2（27B52）、Java 21.0.13、Flutter 3.38.9。iPhone Air / iOS 26.5 模拟器已运行；Android `Medium_Phone_API_37.0` / `sdk_gphone64_arm64` / Android 17 API 37 已运行。没有连接实体手机。最新 adb 37 在本机出现 libunwind 崩溃，采用隔离的官方 adb 35.0.2 连接模拟器，保留系统 SDK 原文件。

原始源码 `flutter build apk --debug --no-pub --dart-define=WEATHER_API_BASE=http://10.0.2.2:3300` 成功（原版 v1.0.0+1、157,640,674 B、APK CRC／签名校验通过），已实际安装。点击系统首次定位弹窗“不允许”，仍可搜台北、收藏；随后 `adb install -r` 安装新版 v1.1.0+2，偏好中的台北坐标、收藏和手动模式逐值一致。[升级前](../docs/verification/README.md#record-0364f4f2940d)、[升级后](../docs/verification/README.md#record-4160a62550de)、[原版台北页](../docs/verification/README.md#record-7e0c25ff753a)、[首次权限弹窗](../docs/verification/README.md#record-5dea86465dec)。按用户后续指示，基线包由原始源码生成。

Android 原生完整集成最终规则模式 1/1（约 41 秒）、真实模型 1/1（约 65 秒）通过。通过临时 HTTP 记录代理分别连接 3300／3305，测试使用 Android 的 `10.0.2.2:3309/3310`；分享地址独立固定为可达的 `http://192.168.5.7:3300`。三次成功回答均断言两城完整、时段正确、每个依据点匹配相应快照；模型三次耗时 4118／2018／1633 ms。[规则网络与快照](../docs/verification/README.md#record-e3eb0b87a1f1)、[模型网络与快照](../docs/verification/README.md#record-9298cb980ab0)、运行日志见 `evidence/logs/android-*-integration.log`。

两种模式各自：首页瓦片 0，界面切语言天气 0，拖图 0，地图切语言 0，选点未确认 0；确认后 1 次天气请求，坐标为 `38.88348017233799,125.52506573660719`。实际请求四套 `/api/tiles/<语言>/...`，视野／图钉保持。`qa/mobile-network-summary.ts` 重算降水最大值或最低温度，并逐点校验城市坐标／时区／版本。原生双端请求代理仅用于验收，不包含在最终 App 默认地址中。

Android `location_test.dart`：真实系统拒绝权限→手动搜台北通过（约 18 秒）；已授权但定位约 10 秒超时→手动搜台北通过（约 26 秒）。`qa/android-permission-setup.ts` 在测试安装后配置系统权限，未 mock Dart 定位插件；模拟器低精度成功定位专项两次未通过，原因与尝试见取舍表及失败日志，不算成功 GPS。最终正常 App 已重新构建、安装；主页与 Home→前台后可读，[正常启动](../docs/verification/README.md#record-bd92ad05bb12)、[恢复前台](../docs/verification/README.md#record-e0ca1559823b)。

`flutter test integration_test/app_flow_test.dart -d 23AB3E1A-4C30-462C-943C-B9CB5B894E96 --dart-define=WEATHER_API_BASE=http://127.0.0.1:3300 --dart-define=USE_TEST_TILES=true`：iOS Debug 模拟器完整规则路径通过（1 个集成场景）：四语天气／分享链接、首尔台北三轮、台北依据页、拖图后四语切换保持视野、非中心选点并核对分享坐标、搜索台北、收藏与持久化。[运行记录](../docs/verification/README.md#record-8ae841682930)。

同一集成场景切换 `WEATHER_API_BASE=http://127.0.0.1:3305` 后也通过，三轮实际调用模型并可进入台北依据，地图／选点／分享／收藏沿用相同断言。[实际模型原生记录](../docs/verification/README.md#record-9bd29eb22321)。

iOS 最终规则复测使用临时代理 `http://127.0.0.1:3311`、`TRACE_NETWORK=true`，1/1 通过（约 48 秒）。首页／切语言／拖图／地图语言／确认前选点的预算均为 0，确认后 1 次请求，坐标为 `38.788856316528076,125.50623203125008`；四语瓦片、三轮完整城市读数和快照逐点校验通过。[网络与快照](../docs/verification/README.md#record-3eef3993ffe5)、[最终日志](../docs/verification/README.md#record-5dc8717b8a4f)。

`integration_test/location_test.dart` 调用实际原生插件：先安装测试 `.app`，`simctl privacy ... grant location dev.weatheratlas.weatherAtlas`，再用 `simctl location ... set 25.0478,121.5319` 设置模拟位置，已授权启动后自动选点并读取 `Asia/Taipei`，通过。未授权场景以 `--dart-define=LOCATION_CASE=denied` 运行，保留手动搜台北且不阻塞，通过。[授权记录](../docs/verification/README.md#record-ce4f5128541e)、[未授权回退](../docs/verification/README.md#record-cc870d533020)。`flutter test` 完成会卸载测试 App，权限须在安装后设置；这些结果证明原生插件／控制器联通，不证明真实卫星定位或系统弹窗点击。

正常 `lib/main.dart` 调试产物重新运行后，使用 `simctl launch ... com.apple.mobilesafari` 切后台，再 `simctl launch ... dev.weatheratlas.weatherAtlas` 回前台，城市／语言／预报保持可读。[正常启动](../docs/verification/README.md#record-457b0d967e30)、[回到前台](../docs/verification/README.md#record-a1a083369d33)。

最后补验实际系统点击：`qa/ios-permission-project.rb` 生成独立 XCTest 工程，`xcodebuild test -only-testing:PermissionUI/PermissionUI/testFirstDenial` 和 `.../testFirstGrant` 各 1/1 通过（7.2／8.5 秒）。在安装正常主入口 App 后重置本 App 定位权限，实际点“不允许”与“允许一次”；后者保存 `gps` 模式及 `25.0478,121.5319`。[拒绝系统截图清单](../docs/verification/README.md#record-45806e95ccdc)、[允许系统截图清单](../docs/verification/README.md#record-8ad364273caf)、[允许后的偏好](../docs/verification/README.md#record-ef72738943c9)。进一步运行 `qa/ios-language-permissions.py <模拟器ID> <工作目录> <正常App路径>`，依次设置 en／zh-Hant／ko、重启专用模拟器并重新安装 App，各执行真实系统弹窗拒绝 1/1 通过；连同先前 zh-Hans，共取得四语系统文案和点击证据，最后恢复原 zh-Hans-CN／zh_CN。四种 InfoPlist 字符串与截图实际文字均已核对，[语言运行记录](../docs/verification/README.md#record-af1159490b96)、[截图 OCR](../docs/verification/README.md#record-22d3faf42d6a)。完整日志见 `evidence/logs/ios-permission-*.log`。这补齐模拟器首授权实际点击，仍不能替代真机 GPS。

`ADB_PATH=<隔离 adb> node qa/android-browser.ts`：Android 模拟器中的实际 Chrome 145.0.7632.218，经 CDP 发送触摸事件，411×789 页面无溢出，三轮问答及台北依据通过。系统软键盘实际显示后可视高度由约 789 px 降至 477 px；输入框和发送按钮仍可见，触摸发送成功。测试暂时打开的硬键盘显示 IME 设置已恢复。[记录](../docs/verification/README.md#record-a6bd1e94260c)、[含系统键盘截图](../docs/verification/README.md#record-47776c83d240)。`10.0.2.2` 的普通 HTTP 属于不安全来源，浏览器不提供定位；正式手机定位需 HTTPS 或可信 localhost。

`adb reverse tcp:3300 tcp:3300` 后，`node qa/android-browser-location.ts` 使用可信 localhost、预先授予 Android／浏览器位置权限，实际浏览器 Geolocation 返回 `25.0477983,121.5318983`，应用自动进入 `25.0478,121.5319` 的坐标页。没有使用 CDP 坐标覆盖；坐标来自 Android 模拟器注入，仍不属于真实 GPS。[记录](../docs/verification/README.md#record-677ea16d5606)。

Flutter `doctor -v` 已执行；Xcode、CocoaPods、Java 和网络可用。官方 Git 标签源码安装显示 user-branch／PATH 警告；系统 Chrome 默认路径缺失，自动化使用独立 Chromium。Android cmdline-tools 新 CLI 的 `sdkmanager --licenses` 返回“该选项不再需要”，Flutter 3.38.9 因接口差异仍报 license 状态未知，原始输出保留。无发布签名、商业地图样式或已配置的公网部署目标。工具下载使用已有代理 `127.0.0.1:7890`，只设置进程环境，不改系统代理。

交付复核进一步补齐原生实际 HTTP 弱网证据：`flutter test integration_test/resilience_test.dart -d <设备ID> --dart-define=WEATHER_API_BASE=<本机服务>` 在 Android／iOS 各 1/1 通过（约 48／46 秒）。先取真实城市快照，再由原生 App 内回环 HTTP socket 构造断连和延迟，不替换 `http.Client`。七个场景全部通过：首次无缓存失败、实际点重试恢复 24 小时、旧数据时间／stale 文案、真实客户端约 22 秒超时后旧时间不变、重建控制器从持久缓存回退、恢复后四语切换 0 天气请求、1 秒慢城响应不覆盖手选台北的名称／温度／时区。[Android 场景与请求](../docs/verification/README.md#record-d06934732dd5)、[iOS 场景与请求](../docs/verification/README.md#record-23c19667fec9)，运行日志在 `evidence/logs/*-resilience.log`。这是原生传输／缓存／界面验收，实际运营商网络仍待真机。结束后重新生成并安装普通主入口应用，交付校验同时拒绝三个集成测试文件作为入口。

## 待资源到位的验收

| 资源 | 影响 | 下一步 |
| --- | --- | --- |
| 四语商业地图 URL／Key 与署名 | 真实地理底图的翻译、缺失回退和供图性能 | 配置四个语言样式，沿用同中心／缩放／图钉操作，抓取 URL 与首尔、台北、缺译地点截图 |
| 项目授权部署目标、域名及 GSC 权限 | HTTPS、公网 sitemap、提交／可抓取／收录 | 配置 `SITE_URL` 部署，执行 `qa/seo-check.ts`，按 `qa/PUBLIC-ACCEPTANCE.md` 提交并记录日期 |
| iOS／Android 实体手机及项目发布签名 | 真实 GPS、前后台、弱网、profile 慢帧与签名安装 | 使用局域网或 HTTPS 地址构建并安装，按公开验收手册记录机型／系统／刷新率／慢帧 |
| 真实用户流量及观察窗口 | 真实 LCP/INP/CLS p75 | 持续保留 production 数据，用 `npm run rum:report` 按页面／语言／设备复核样本量与窗口；本机受控值单列 |

上述资源不阻止本机交付，但仍阻止相应外部验收；未将提交 sitemap、可抓取、已收录或真实用户 p75 写成已通过。

## 运行与交付

代码目录：`/Users/yzin/code/weather-atlas`。本机生产服务保持在 `http://localhost:3300`，同一局域网为 `http://192.168.5.22:3300`，当前 `.env.local` 为 live 天气／本地测试瓦片／规则模式，`SITE_URL=http://localhost:3300`。它不是公网部署；手机浏览器普通局域网 HTTP 不具备安全定位来源。地址变化时重新运行 `ipconfig getifaddr en1`，在 App“天气服务地址”调整 API 地址；重新分发分享链接时同时调整构建的 `WEATHER_SITE_URL`。

重启 Web（先确认 3300 空闲，不停止其他项目）：

```sh
cd /Users/yzin/code/weather-atlas/web
npm ci
npm test
npm run build
npm start -- --hostname 0.0.0.0 --port 3300
```

本机已验证的真实上游出口依赖现有代理；Node 26 启动时使用 `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 NO_PROXY=localhost,127.0.0.1,.local npm start -- --hostname 0.0.0.0 --port 3300`。最初只切 live、未设置 Node 代理时，SEO 首尔页因 10 秒天气超时缺少小时正文；补齐进程级出口后 24 URL 真实天气复测通过，未改系统代理或降低正文断言。普通可直连环境使用上面的标准命令。

从新解压源码运行时，先复制 `web/.env.example` 为 `.env.local`，本机演示显式配置 `WEATHER_MODE=demo`、`WEATHER_TEST_TILES=1`、`NEXT_PUBLIC_TEST_TILES=1`、`SITE_URL=http://localhost:3300`、`RUM_ENVIRONMENT=local-validation` 再构建。源码 ZIP 不携带 `.env.local`、密钥、缓存、依赖或签名材料。

本机 Flutter SDK：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/work/flutter/bin/flutter`。在 `mobile/` 执行：

```sh
flutter pub get
flutter analyze
flutter test
# Android 模拟器；iOS 模拟器把 API 地址换成 http://127.0.0.1:3300
flutter run -d <设备ID> --dart-define=WEATHER_API_BASE=http://10.0.2.2:3300 --dart-define=WEATHER_SITE_URL=http://yzinMac-Mini-m6.local:3300 --dart-define=USE_TEST_TILES=true
```

真机 API 地址使用同一局域网的 `http://192.168.5.22:3300` 或正式 HTTPS；安装 Android 调试包后可在菜单调整服务地址。本次 iOS 设备 Release 的 API 及三种产物的分享地址已采用 `http://yzinMac-Mini-m6.local:3300` 编译，模拟器 Debug 按 `127.0.0.1:3300` 编译。商业瓦片配置和公开分享域名需在资源到位后重新构建。

历史 v1.1.0 交付目录：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs`。以下产物均为 v1.1.0+2；当前新版使用上文独立 `v1.1.1` 子目录：

| 文件 | 实际类型与限制 |
| --- | --- |
| `Weather-Atlas-Source-v1.1.0.zip` | 修改后的完整源码、回归测试、历史记录及本次证据；不含构建依赖 |
| `Weather-Atlas-Android-Debug-v1.1.0.apk` | 159,121,194 B，普通 `lib/main.dart` 入口，Android debug Key；已安装验收，默认模拟器地址，真机可在菜单调整 |
| `Weather-Atlas-iOS-Simulator-arm64-Debug-v1.1.0.app.zip` | arm64、最低 iOS 15、ad-hoc 模拟器签名；可安装到 Apple Silicon iOS 模拟器 |
| `Weather-Atlas-iOS-Device-arm64-Unsigned-v1.1.0.app.zip` | arm64 设备 Release、最低 iOS 15、未签名；不是可直接真机安装的 IPA，须项目 Apple Team 签名 |
| `Weather-Atlas-Verification-Evidence.zip` | 本次截图、HTTP／模型投影、性能原始数据和构建测试日志 |
| `qa/LOCAL-VERIFICATION.md` | 本报告；相邻证据和 docs 链接一并复制，便于独立复查 |
| `DELIVERY-MANIFEST.json`、`ARTIFACT-VERIFICATION.json` | 文件大小／SHA-256，以及 ZIP／APK CRC、实际环境密钥排除、普通应用入口校验结果 |

`DELIVERY_DIR=<上述交付目录> node qa/package-delivery.ts` 生成产物，再运行 `node qa/verify-delivery.ts`（同一环境变量）校验。签名、版本、权限本地化和设备信息见 [原生产物记录](../docs/verification/README.md#record-c6e94390c19d)。没有把集成测试入口或旧局域网地址的 App 当作最终包。

v1.1.0 打包与校验已执行成功：五个 ZIP／APK 的 CRC 通过、逐条目排除当时环境的真实模型密钥、两个 Debug 应用的普通主入口检查通过，清单 SHA-256 一致。当时保留 3300 和 3306；当前服务状态以上文 v1.1.1 章节为准。历史本机／局域网记录见 [服务检查](../docs/verification/README.md#record-3f704bcbca04)，固定主机名／分享链接见 [地址检查](../docs/verification/README.md#record-dd82a0cd78d8)。各交付目录的 `ARTIFACT-VERIFICATION.json` 可独立复查。

## 最终一致性检查

以原始八组要求逐项对照实现、自动化入口、模拟器／浏览器实际记录、构建类型和资源缺口；原版测试 25／9 与新版 48／16 分开记录，真实模型、规则模式、受控天气和真实天气分开记录。五轮性能 A/B 同时保留 JS 减少和地图打开变慢，冷缓存仍受上游等待限制。公开网址、GSC 三种状态、真实用户 p75、商业地名和实体手机 profile 没有可冒充的本机结果。资源到位后的直接操作集中见 [接续验收手册](PUBLIC-ACCEPTANCE.md)。
