# TypeScript 类型复核与取舍

日期：2026-11-17，项目 `/Users/yzin/code/weather-atlas`。承接未提交的迁移和功能代码，保留原有配置、凭据、原生工程及历史证据。本轮不调用真实模型。

## 复现与检查范围

```bash
npm run typecheck
npm run typecheck:audit
npm --prefix web test
npm run test:qa
cd web
NEXT_DIST_DIR=.next-type-audit SITE_URL=http://localhost:3300 npm run build
cd ..
QA_DIST_DIR=.next-type-audit QA_PERF_CHECKS=smoke,home-location,place-loading,ask-draft-check,weather-map-browser,next-performance-browser,seo-audit,home-index-browser,map-resource-budget node qa/next-performance-check.ts
```

根目录与 Web 的 `strict` 保持开启。编译器 API 审计自有 TS／TSX，跳过依赖声明、Next 生成声明及历史证据。门禁检查显式 `any`、推导为 `any` 的变量／参数、对 `any` 的属性访问、由 `any` 初始化的具体类型、非空／确定赋值断言、类型断言和注释中的检查抑制；`as const` 保留字面量推导，不计为数据强转。它不是对第三方声明或所有 TypeScript 不健全行为的形式证明。

基线从上一份 `outputs/v1.1.2-typescript/Weather-Atlas-Source-v1.1.2.zip` 独立解压，复用相同依赖，以同一脚本重新扫描；没有依据 Git 的大量扩展名变化猜测数量。基线 149 个文件；最终交付快照检查 168 个文件，当前另包含本轮守卫、工具和工作区新增的单城问答代码。扫描条目有重叠，不能相加当作缺陷数。

| 同一审计规则 | 上一源码包 | 本轮结果 |
| --- | ---: | ---: |
| 显式 `any` | 0 | 0 |
| `any` 变量／参数 | 171 | 0 |
| 对 `any` 的属性访问 | 371 | 0 |
| 从 `any` 初始化具体类型 | 3 | 0 |
| 从 `any` 强转类型 | 43 | 0 |
| 非空断言 | 287 | 0 |
| 其他类型断言（不含 `as const`） | 85 | 2，逐项注明用途 |
| `@ts-ignore`／`@ts-nocheck` 注释 | 0 | 0 |

原始计数：`qa/evidence/type-audit-before.json`、`qa/evidence/type-audit.json`。新的未说明条目使 `npm run typecheck:audit` 失败；受控测试还实际构造错误源码，验证门禁能拒绝这些问题，而不是只检查当前代码恰好通过。

## 实现位置与实际修复

- `web/lib/validation.ts`：JSON 首先收敛为 `unknown`，使用守卫、解码和显式空值检查。`web/lib/contracts.ts` 校验地点、四语标签、摘要、问答、上下文、证据与对应天气快照。客户端 HTTP、localStorage 和缓存均经过这些检查。
- `web/lib/shared-store.ts`：取消可以直接指定任意返回类型的无校验读取；带类型读取必须提供守卫，预报加载必须提供验证器。损坏缓存不再伪装成有效预报。模型配额和 RUM 记录也校验后读取。保留 15 分钟新鲜期、3 小时旧数据上限、跨进程锁和缓存容量。
- `web/lib/weather.ts`：预报、搜索和批量摘要的上游 JSON 逐层检查，分开保管不同缓存的泛型，取消命名空间强转；时区、缺测概率和数据来源沿用既有校验。
- `web/lib/types.ts`、`ask.ts`、`comparison.ts`、`model-transport.ts`：查询计划改为可判别联合，每种时间窗拥有对应必需字段。模型输出保持 `unknown`，服务器确认形状、城市和时段再计算；过滤缺测值后才进行数值运算。
- `web/lib/seo.ts`：JSON-LD 改为 WebSite／WebPage／Place 联合类型，测试通过实际分支收窄读取属性。
- `qa/lib/json.ts`、`network-contract.ts`、`trace.ts`、`bytes.ts`：验收报告、模型事件、HTTP 记录和二进制流先检查后使用。Playwright 直接导入有类型的 `playwright-core`；定位与权限桩补齐对象，DOM 使用对应元素类型或检查 `instanceof`。
- `web/tests/contracts.test.ts`：覆盖错误字段、损坏标签、嵌套 AI 证据／快照、缺测 `null`、损坏磁盘缓存重载和跨实例读取。`qa/test/types.test.ts` 验证审计门禁本身。

## 保留的两处断言

1. `web/lib/ui-text.ts` 的 `Object.fromEntries(...) as Labels`：同一静态词条表按语言投影，标准库不能保留映射后的全部键。词条仍受完整键类型和四语覆盖测试约束。
2. `web/tests/enhancements.test.ts` 的动态导入类型适配：查询参数故意创建独立模块副本，用于回归 SSR／API 模块间错误身份。TypeScript 不能静态解析该运行时路径；此处限于测试，并实际验证跨副本 HTTP 状态。

审计仅对这两个具体表达式及类型放行，其余新增断言须先修复或明确评审理由。未通过双重强转、关闭 `strict`、增加检查抑制或更改第三方声明来降低检查标准。

## 过程中的取舍与失败

1. 不把删除 `!` 当作完成：原先必须存在的受控值改为显式断言或 `requireValue`，缺失时立即失败；普通产品状态继续走空值分支。
2. 不把类型声明当作 JSON 证明：服务边界增加运行时检查，代价是每次读入外部数据时执行有界字段检查；保留缓存合并和请求预算，不额外查询天气或模型。
3. 首次新增标签回归发现语言和区域级别未验证。已给 `PlaceLabel` 补全相应可选字段，并同步检查反查缓存，5 项契约回归复测通过。
4. 门禁测试首次缺少模拟 Web 配置而提前退出，未生成报告；补齐两个项目配置后，确认能检查错误源码并生成失败条目。抑制指令通过 TypeScript 注释扫描识别，避免把测试字符串中的样本误认为实际注释。
5. 同一工作区在复核期间新增单城追问和流式问答代码。本轮保留这些变更，将实际出现的非空假设和流取消参数一并纳入检查；不会用较早的构建证明后来新增的代码。
6. 本轮为 Web／Node 类型修复，沿用现有原生产物身份；真实模型、真机帧率、发布签名、公网和 GSC 结果继续引用各自历史验收，不因类型检查通过而升级结论。

## 执行记录

| 命令／操作 | 结果与证据 |
| --- | --- |
| `npm run typecheck`、`npm run typecheck:audit` | 两层严格检查通过；自有代码无未说明的审计条目 |
| `npm --prefix web test` | 97／97 通过，包含 5 项契约回归和 4 项 SSE／取消回归 |
| `npm run test:qa` | 19／19 通过，包含审计门禁、归档校验和原生命令恢复 |
| 两轮独立生产构建 | `.next-type-audit`、`.next-type-audit-final` 均通过；后者包含并行出现的流式问答代码 |
| 首轮构建 `.next-type-audit` 浏览器回归 | 冒烟、定位 8 项、地名加载 21 项、问答草稿 20 项、天气地图 22 项、预加载 14 项通过；地图实际解码 PNG 24 张 |
| 首页重试 | 四语×四宽度、菜单、深链及授权定位通过；首页地图脚本／样式／瓦片为 0／0／0，打开后 1／1／12 |

首次浏览器首页失败源于注入函数引用 Node 侧 `requireValue`，与浏览器运行域不符；改为 `fail?.(...)` 后专项通过。新流式回答的浏览器验收还发现响应未明确 UTF-8 字符集，工具读取中文名称时乱码；已显式设置 `text/event-stream; charset=utf-8`，并增加响应头回归。日志保留首轮失败，不以最终通过覆盖失败事实。

最终固定源码快照已独立执行根目录与 Web 的 `npm ci`，严格检查、审计门禁、97 项 Web 测试、19 项工具测试及默认生产构建全部通过。首次独立检查发现刚加入快照的 SDK 验收脚本仍有 `as Locale[]`，已在工作区和快照中同时改为 `satisfies` 并复测。后续并行工作不自动归入此快照的验证结果。日志统一保存在 `qa/evidence/logs/type-audit-*.log`。


## 最终快照与交付

最终独立目录为 `/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/work/type-audit-snapshot/weather-atlas`。该目录生产构建的浏览器复测通过：四语双城连续追问共 12 轮，逐轮核对城市快照、数值、日期和选中的小时，点击依据并返回；另通过冒烟、84 份 SEO 原始 HTML（发现 0、sitemap 28 项）、四语四宽度首页、21 项地名加载和地图请求预算。天气为受控上游、模型为规则模式，真实模型调用 0。记录：`qa/evidence/type-audit-browser.json`、`qa/evidence/logs/type-audit-snapshot-browser.log`。

交付目录：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2-type-audit`；源码为 `Weather-Atlas-Source-v1.1.2.zip`。与源码并列的 `DELIVERY-MANIFEST.json` 和 `ARTIFACT-VERIFICATION.json` 记录文件大小、SHA-256、ZIP CRC、条目数及实际凭据排除结果。归档排除依赖、生成声明、构建、私有环境、缓存与签名文件；独立测试和首轮失败日志均保留在证据目录。

固定快照的可访问生产实例为 `http://localhost:3351/zh-Hans`，使用真实天气和规则问答；原有 `http://localhost:3300/zh-Hans` 与局域网 HTTPS 服务继续保留，不用本轮快照覆盖并行工作的构建。快照实例启动命令：

```bash
cd /Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/work/type-audit-snapshot/weather-atlas/web
SITE_URL=http://localhost:3351 WEATHER_MODE=live AI_API_KEY= OPENAI_API_KEY= OPENROUTER_API_KEY= npm start -- --hostname 0.0.0.0 --port 3351
```

本机运行实例沿用已有天气缓存与进程级网络代理。手机可通过同一局域网访问开发机的 3351 端口查看天气；定位权限使用原有受信任 HTTPS 入口，证书说明见 `qa/LOCAL-HTTPS.md`。原生二进制未因本轮 TypeScript 修复重新构建，本次新增交付为源码快照。
