# Weather Atlas 天气图册

公开仓库：[yzin-17/weather-atlas](https://github.com/yzin-17/weather-atlas)。移动端 GitHub Actions 自动打包与 Release 发布配置见 [GitHub 移动端发布](docs/GITHUB-MOBILE-RELEASE.md)：推送版本标签自动发布，手动运行可仅构建；包含 Android 调试 APK、iOS 模拟器包、未签名设备包及校验清单。[查看流水线](https://github.com/yzin-17/weather-atlas/actions/workflows/mobile-release.yml)。

Flutter 问答已接入 `ai_ui_stream`，与 Web 共用 SSE 协议，支持历史对话、逐字显示、停止、手动重试及单城／双城连续追问。发送清空输入，首次提问后隐藏推荐问题，依据绑定回答自己的城市与天气快照。实现、实际测试和本轮安装包见 [Flutter 流式对话验收](qa/FLUTTER-AI-STREAM.md)。

全球城市天气查询的 Web 和 Flutter 实现。支持简体中文、繁體中文、English 和 한국어。首页提供当前天气、逐小时预报、7 天预报和其他城市天气。用户可以搜索、定位、地图选点，也可以就正在看的预报提问。Web 坐标城市名解析期间显示加载提示，天气独立加载，失败后回退到区域名或坐标。确认新位置后立即显示天气加载占位，避免等待期间继续展示旧城市；Flutter 同步提供四语进度提示，见 [选址加载态](docs/verification/selection-loading.md)。

当前版本为 v1.1.2。地图窗口扩大，双端使用真实底图，仅显示所选位置标记；确认入口位于地图外，不加载地图天气摘要。中文坐标地名采用当地名称，例如惠州显示“惠州市”；修复、测试与取舍见 [地图地名与简化验收](docs/verification/map-clean.md)。早期天气图层方案保留在历史报告。当前位置和地图选点自动解析城市名，保留原坐标查询天气；解析失败回退区域名或坐标。双城比较／连续追问、共享缓存、RUM 和双平台产物的实际验收、性能数据及资源缺口见 [本地验收报告](qa/LOCAL-VERIFICATION.md)。项目已迁至 `/Users/yzin/code/weather-atlas`；原 24 小时计划仅为历史记录，本轮已取消该工期上限。

## 快速运行

Web 与验收工具使用 Node.js 22.18 或更新版本，已迁移为严格 TypeScript。类型契约、迁移取舍见 [TypeScript 验收](docs/verification/typescript.md)，JSON／缓存边界修复与剩余断言说明见 [类型复核](docs/verification/type-audit.md)。在项目根目录执行：

```bash
npm ci
cd web
npm ci
cp .env.example .env.local
npm run dev -- --hostname 0.0.0.0 --port 3300
```

日常入口为 `http://localhost:3300/zh-Hans`。首页定位前及定位失败时默认展示深圳，推荐依次为深圳、首尔、香港、东京、纽约、伦敦。推荐与公开 SEO 目录分别维护，成都、台北的公开链接仍保留。首页默认请求当前位置，即使此前手动选过城市；首次需要浏览器授权，失败时可手动搜索；支持权限事件的浏览器在随后允许时自动恢复一次，等待授权不另设倒计时，手动选城会取消自动定位。具体复现与边界见 [迟到授权恢复](docs/verification/location-grant.md)。固定城市链接如 `/en/weather/seoul-1835848` 与刷新会保留该城市，不自动定位。实现、验证与取舍见 [首页定位](docs/verification/home-location.md)。默认访问真实 Open-Meteo；首次加载需要联网。地图和天气来自独立服务。要在无天气服务的环境演示，显式设置 `WEATHER_MODE=demo` 并重新启动开发服务或重新构建。演示天气以当小时为基准生成，示例地点限于内置目录，界面标示示例来源。标准地图仍需联网。

移动端运行需要 Flutter SDK 和 Android 或 iOS 工具链。保持 Web 服务运行，在另一个终端执行：

```bash
cd mobile
flutter pub get
flutter run --dart-define=WEATHER_API_BASE=http://10.0.2.2:3300
```

上面的地址适用于 Android 官方模拟器。按本例使用 3300 时，iOS 模拟器使用 `http://127.0.0.1:3300`。真机应填写开发机可访问的局域网 IP 或 HTTPS 服务。生产环境使用 HTTPS；移动端启动、权限、地图配置见 [mobile/README.md](mobile/README.md)。Web 手机浏览器的定位也需要 HTTPS 或受信任的本机环境。

## 代码格式化与提交检查

首次在项目根目录执行 `npm ci`，会自动安装 Husky 提交钩子；原生语言格式化工具通过 `npm run format:setup` 准备。完整工具、安装条件与排除范围见 [格式化说明](docs/FORMAT.md)。

```bash
npm run format
npm run format:check
```

TS／TSX 使用 Oxfmt，Dart、Swift、Kotlin 和 Objective-C 使用对应格式化工具；平台必需的 Podfile 只执行 Ruby 语法校验，验收脚本统一使用 Node。每次正常 `git commit` 会强制检查实际暂存的源码与格式配置，失败则阻止提交；不会自动暂存文件或改写未暂存内容。

## 评审路线

1. 直接访问韩文首尔页，在浏览器查看网页源代码。能读到当地预报、语言、canonical 和四个 hreflang。切到繁体中文后，城市仍为首尔。
2. 搜索同名城市，例如 `Paris`，通过省州和国家选中地点。在地图独立选点时，拖动只改变视图，确认后才取该点天气。标准 OSM 底图保留当地地名。配置本地化地图样式后按语言请求瓦片。
3. 保存几个城市，在网络面板对比当前城市详情和其他城市批量摘要。后者只包含气温和天气代码。对同一城市刷新失败，已有数据会显示其来源或陈旧状态。
4. 点击右下角“问天气”，问“明早 7–9 点通勤要带伞吗？”。时间按正在查看的城市计算。点回答中的依据核对对应小时。若所问时间超出手头预报，应得到覆盖范围说明。
5. 在开发工具里拒绝定位、阻断天气接口、延迟一次选址结果。确认搜索、重试和手动选城仍可操作。用浏览器 Network 单独观察初始加载，以及用户打开地图后的首次瓦片请求。

## 架构与取舍

| 部分 | 实现 |
| --- | --- |
| Web | Next.js App Router、React、按需加载的 Leaflet。公开城市页提供服务端 HTML，交互层处理定位、收藏、语言与地图。 |
| Mobile | Flutter + 系统定位 + flutter_map；与 Web 共享 HTTP 返回格式和业务约定，保留平台自身的权限和页面生命周期。 |
| 天气及地名 | Next Route Handlers 代理 Open-Meteo，格式归一化为小时数组、当地日历日期和 WMO 天气代码。模型密钥也保存在这一个服务，不需要数据库或独立业务服务。 |
| 多语言 | 天气值与描述分开，天气缓存与语言无关。地名搜索缓存按关键词和语言分开，中文地名存在源数据回退；八个公开城市有四语名称。 |
| 用户偏好 | Web 与 App 各自保存地点、收藏和语言，默认无需账户。两端共用相同坐标、目的地时区和时间单位。 |

### 数据、弱网与请求预算

`web/lib/weather.ts` 只接受有效的坐标和有限长度的搜索词。主城市合并请求 `current`、`forecast_hours=168` 和 `forecast_days=7`。首页 `hours` 仍为 24 点，比较使用 `comparisonHours`；两者属于同一版本。逐小时用 Unix 秒，日预报保留当地日历日期，缺失降水概率保持为缺测。

`web/lib/shared-store.ts` 通过原子文件与租约锁让同机多进程、重启后的实例复用预报，缓存键区分天气上游身份与坐标。新鲜期仍为 15 分钟，3 小时内旧数据在 SSR 中立即返回并后台刷新，失败退避 30 秒；超过上限不再返回。Web 与 Flutter 的网络刷新使用 `/api/weather?...&fresh=1` 等待共享更新结果，仍复用新鲜缓存；显示缓存不等于刷新失败，等待时展示更新提示，实际失败才显示错误并提供重试。最多保留 512 份完整预报。收藏摘要先复用完整预报，再批量请求缺失地点。Web 的四语、四宽度、上游故障及恢复证据见 [缓存刷新验收](qa/WEB-CACHE-REFRESH.md)。

多实例配置相同 `WEATHER_CACHE_DIR`；跨主机必须挂载支持原子目录操作的共享存储，或替换集中存储适配器。独立磁盘不会共享。在另一终端运行 `cd web && npm run warm` 可每 10 分钟检查六个热门城市、最多并发 2 个；`npm run warm -- --once` 只执行一轮。预热与 Web 必须使用相同环境和缓存目录；真正空缓存仍需等待上游。

其他城市按收藏顺序，为前两项进入视野的链接闲时预取完整 Next.js 页面；更多城市在悬停、聚焦或触摸时准备。首页目录只做意图预取，定位期间暂停其他城市自动预取；离线、省流量、隐藏页面、2g 与 slow-2g 停止投机请求，3g 仅允许明确意图。完整路由缓存为 60 秒，天气仍按 15 分钟／3 小时判断；较旧预取不能覆盖较新的同源本机快照。摘要优先复用有效完整快照，缺失仍每批最多 20 座。搜索、地图、问答在操作意图时预热模块，地图打开前不取瓦片，也不提前调用模型。实现、性能前后实测及新增流量取舍见 [Next.js 性能验收](docs/verification/next-performance.md)。

### 坐标地名

Web 和 Flutter 在定位或确认地图点后，通过 `/api/reverse` 并行获取名称；天气仍使用原坐标，不改成市中心。默认使用 Photon／OpenStreetMap，保留署名；可用服务端 `WEATHER_REVERSE_URL` 配置兼容 Photon 的自建服务。公共实例适合低流量验证，无可用性保证，公开发布前应落实自建或有服务保障的供方。反查不发生在地图拖动或未确认选点期间。

成功名称缓存 7 天，无结果／失败缓存 5 分钟，上游故障可使用 30 天内旧名称；共享目录串行请求、至少间隔 1 秒。天气缓存保持原有独立策略。已知城市显示四语名称；公共 Photon 的英文请求使用 `lang=en`，其他界面语言使用 `lang=default` 返回当地名称，避免中国城市显示英文拼音。非内置城市并不保证翻译为全部四语。名称缓存按供方语言分开；服务端及 Web 本地缓存键升级为 v2，旧英文缓存不会阻碍中文修复。区域名或四位小数坐标保证离线仍能识别地点。分享链接保留原点，坐标页维持 noindex。

### SEO

生产构建／启动必须设置 `SITE_URL`（或 `NEXT_PUBLIC_SITE_URL`）为站点根地址，公开发布填写实际 HTTPS 域名；凭据、子路径、查询和片段会明确报错，不会静默丢弃。六座精选城市有四种语言的稳定地址；例如 `/ko/weather/seoul-1835848`。站点提供 sitemap、robots、同语 canonical 和互指的 hreflang。全球搜索继续开放，自由坐标页不加入城市索引。页面展示目的地天气时间。临时地图状态不会产生大量重复城市落地页。

语言首页及城市页的原始 HTML 均包含描述、canonical、四语及 `x-default` 互链、Open Graph 和 Twitter 元数据；服务端 JSON-LD 描述 WebSite／WebPage，固定城市另含 Place 与公开目录坐标。live 的四语首页允许索引，提供稳定的服务介绍和城市入口；sitemap 共 28 项（4 首页＋24 城市）。demo 和任意坐标页继续 noindex，坐标页不输出位置结构化数据。`qa/seo-check.ts` 分别使用普通浏览器和 Googlebot UA 检查原始 HTML，`qa/home-index-browser.ts` 检查四语首页、显式语言、菜单、恢复及定位，`qa/seo-browser.ts` 检查城市标记更新与清理。当前策略见 [首页索引调整](docs/verification/home-indexing.md)，此前遗漏与首次补验见 [SEO 补验](docs/verification/seo-metadata.md)。

分享元数据包含四语 OG locale 和固定 1200×630 品牌 PNG `/social-image`；Twitter 使用大图。根路径按 Accept-Language 的权重协商并返回 Vary；API 有 noindex 响应头。demo 允许爬虫读取页面 noindex，sitemap 为空。城市没有任何可用快照时暂时 noindex，保留交互重试；3 小时内旧数据仍可索引。metadata 与正文合并同次天气读取，所有 UA 的标记位于 head。当前全面检查与取舍见 [SEO 巡检](docs/verification/seo-audit.md)，执行入口为 `qa/seo-audit.ts`、`qa/seo-failure.ts` 和 `qa/seo-config-check.ts`。

### AI

本地私有模型配置放在根目录 `.env.ai.local`，包含 `AI_API_KEY`、`AI_MODEL`、`AI_BASE_URL`，启动脚本自动加载；该文件不提交、不进入源码包。部署环境也可注入相同变量，Next.js 支持 `web/.env.local`。接口兼容 Chat Completions，比较意图要求模型支持严格 JSON Schema；当前实际验证模型为 `gpt-6-luna`，此前的 `gpt-4.1-mini` 记录保留。Web 和 App 均调用 `POST /api/ask`。模型把问题转换成受约束的查询计划，服务端校验字段、计算读数并生成对应语言的答案。

Web 使用 Vercel AI SDK 的 `useChat` 与 SSE UI Message Stream 管理历史、发送、手动重试和停止；App 继续使用原 JSON 协议。查询期间先流式显示天气读取、城市解析与意图提取进度，再发送校验后的回答与可点击依据，不额外请求模型改写天气数值。停止会取消仍在进行的模型请求，保留共享天气缓存任务；失败可重试，版本过期先刷新，重试不重复插入问题、不覆盖新草稿。指定其他城市的单城问答支持“今天广州天气怎样 → 明天呢 → 那下午呢 → 会下雨吗”，依据打开相应城市预报。实现、验收与取舍见 [AI SDK 对话](qa/AI-SDK-CHAT.md)。

Web 收到回答后在前端按完整字符逐步显示，展示期间仍可停止并保留已显示文字；不增加模型调用。完整显示后开放该条预报依据，系统要求减少动画时直接显示全文。四语、窄屏、历史、重试与停止验证见 [逐字显示验收](qa/ANSWER-REVEAL.md)。

问答现支持穿衣、跑步／骑行／出游等户外安排、晾衣、防晒资料说明及晴雨／降雪／雷雨现象；每日概述包含天气描述。可连续询问“今天广州天气怎样 → 出门穿什么衣服 → 明天呢 → 那下午呢 → 适合跑步吗”，城市、当地日期和时段会保留，建议附对应小时依据。当前没有 UV、风速、湿度或空气质量读数，相关判断明确说明数据限制。完整支持范围、实际模型调用与产品规则见 [问答扩展验收](qa/WEATHER-ADVICE.md)。

无密钥时使用有明确标签的规则预览。保留当前城市问答，并支持两城比较及连续追问：先问“首尔和台北明天早上 7–9 点，哪里更容易下雨？”，再问“那下午呢？”和“哪个更冷？”。双端均有快捷入口。默认按各地当地时间取数，同一绝对时刻须明确指定 IANA 时区或 UTC。规则模式支持少量四语模板及内置城市别名；符合单城模板的其他城市也通过全球地名服务查询。模型可提取更多表达；多个候选时要求明确地区，单城可使用 `city, region, country` 格式消歧。

上下文保留两城、日期、时段和指标，最长一小时，切换当前城市后丢弃。每轮重新校验版本；409 提供刷新两城再问的入口。每个比较值均关联相应城市、时区、版本和快照；缺测时不输出胜者。每分钟 24 次总配额通过共享目录跨进程执行。模型超时与限流分别保留 504 和 429。`WEATHER_TRACE=1` 仅记录模型名、次数、状态和耗时，不记录密钥或问题正文。

相对日期以首轮 `dateAnchor` 为基点，追问跨当地午夜时保持原日期；明确修改日期后才重设基点。上下文城市身份每轮由目录或原始全球搜索校验。AI 等待过期快照刷新后计算；普通天气页面仍可快速显示带时间标记的旧数据。

### 地图和数据来源

默认 OpenStreetMap 标准瓦片经 `/api/map-tiles/{z}/{x}/{y}` 缓存转发，保留当地地名、署名与请求标识；无商业 Key 也能查看真实地图。缓存位于共享目录的 `map-tiles` 子目录，遵守上游缓存头，无有效缓存头时默认 7 天；磁盘最多 512 张／64 MiB，进程内图片字节最多 8 MiB。地图准备当前、搜索选中与收藏的前 20 个地点，复用已有天气，缺失摘要一批补齐；搜索其他城市可以预览新地点。需要商业地名翻译时，可配置四个 MapTiler 样式，自动随应用语言选用，没有地图内独立语言控件。地名覆盖仍取决于供图方。任意坐标确认后才查完整预报；搜索、地图和天气分别处理失败。

[Open-Meteo Forecast](https://open-meteo.com/en/docs) · [Open-Meteo Geocoding / GeoNames](https://open-meteo.com/en/docs/geocoding-api) · [Open-Meteo 使用条款](https://open-meteo.com/en/terms) · [OpenStreetMap 署名](https://www.openstreetmap.org/copyright) · [公共瓦片使用规则](https://operations.osmfoundation.org/policies/tiles/) · [MapTiler 样式与语言](https://docs.maptiler.com/guides/map-design/worldview/language/)

## 公开城市与 SEO

坐标地名解析先查周围 1 公里，无结果时最多补查一次 10 公里的行政区域；天气始终使用原选点坐标。Web 和 Flutter 对临时故障最多自动重试两次，失败后提供“重新识别城市”。Web 在网络恢复时再试，Flutter 在恢复前台时再试；真实无覆盖保留区域或坐标。共享服务与 Web 记录见 [坐标名称恢复](docs/verification/reverse-recovery.md)，新版原生验证与安装包见 [Flutter 名称恢复](docs/verification/flutter-reverse-recovery.md)。

四语首页与八座固定城市（首尔、成都、台北、伦敦、东京、纽约、深圳、香港）提供可索引 HTML，共 36 个 sitemap URL。原始 HTML 的 `<head>` 有标题、描述、自指 canonical 和语言互链；`script[type="application/ld+json"]` 位于正文中，描述 WebSite／WebPage 与城市 Place。深圳、香港的旧命名坐标链接在 ID 与坐标吻合时 308 跳转到公开城市页。GPS、地图选点与目录外坐标页保留原坐标及 noindex，避免把个人位置或任意参数组合加入索引。具体遗漏、修复及复测见 [默认城市 SEO](docs/verification/default-city-seo.md)。

## 构建与验收

```bash
npm run typecheck
npm run typecheck:audit
npm run test:qa
cd web
npm test
npm run build
npm start -- --hostname 0.0.0.0 --port 3300
```

新开终端，从仓库根运行 `APP_URL=http://localhost:3300 node qa/smoke.ts`。自定义地址用 `APP_URL=https://your-host.example node qa/smoke.ts`。该脚本检查天气、地名、批量摘要、原始 HTML、四语索引信号、无效城市、问答引用及版本冲突。移动端在 `mobile/` 运行 `flutter analyze`、`flutter test`。

无需天气或商业地图凭据的五分钟演示，可在 `web/.env.local` 设置 `WEATHER_MODE=demo`、`SITE_URL=http://localhost:3300`，再运行生产构建与启动命令。双端完整演示路径和真实服务限制见本地验收报告。

本次增强的实际命令、结果、性能、取舍和资源缺口见 [本地验收](qa/LOCAL-VERIFICATION.md)；[原版验收](qa/RESULTS.md) 保留历史结果。

RUM 使用 `web-vitals` 的 LCP、INP、CLS，经 `/api/vitals` 写入共享目录。仅保存指标 ID、数值、语言、页面类型、设备类别、接收时间和数据集，不保存 URL、IP、精确位置或问题正文。在 `web/` 执行 `npm run rum:report` 查看最近七天的分组 p75，`RUM_DAYS` 可更改天数。受控访问使用独立 `RUM_ENVIRONMENT`，不能充当真实用户指标。

## 原版 24 小时预算记录

以下仅保留原始版本的历史拆解。本轮增强已取消 24 小时上限，以验收证据和可用资源为边界。

| 窗口 | 完成条件 |
| --- | --- |
| 0–2 小时 | 首尔真实接口返回当地时区、24 个小时和 7 个日期。定义两端一致的坐标、缺测值、日期及问答版本格式。 |
| 2–9 小时 | Web 城市页与 Flutter 天气页分别打通。四语、定位权限、手动搜城和地图确认共用相同的选址优先级。 |
| 9–14 小时 | 完成其他城市摘要、已选城市缓存、地图按需加载、四语言链接和预报问答。 |
| 14–20 小时 | 用生产构建核对 SSR 正文、跨时区日期、地图请求时机；验证乱序响应、定位被拒、弱网、超出预报范围和过期版本。 |
| 20–24 小时 | 从干净环境安装依赖、构建、运行测试；检查密钥、示例标识、配置说明，打包源码和验收记录。 |

原题建议的 4–6 小时适用于基础天气查询；四语言、双平台、地图、AI 和搜索优化属于这次扩展范围。本项目对 SEO 的验证限于可抓取页面、元数据与站点发现，公开搜索展示与用户端体验数据需要上线后观察。
