# Review F-01～F-07 修复与取舍

日期：2026-11-17。对应 [规格](../specs/2026-11-17-review-repairs.md)、[任务](../tasks/review-repairs.md)。

## 现有代码提交

先保存实际工作区，未重造历史开发顺序：`3fc945d` 为 Web／严格 TypeScript／工具，`85bddae` 为 Flutter／原生工作流，`2dbd0a0` 为说明与验收。原始证据、构建、私有环境配置与密钥继续忽略。首次提交钩子分别发现 `web/tsconfig.json` 及四个 Dart 文件的格式问题；按项目格式配置修复，重试提交成功，没有跳过钩子。

## 判断与边界

F-01 的部分刷新反馈在接手基线已补齐，本轮保留并完善请求生命周期；F-02 的错误分类仍有遗漏。F-03 的品牌标记不能等同于任意三字段对象，但改为显式守卫更清楚。F-04 应隔离服务配置，不要求服务端与浏览器使用同一缓存键。F-05 的 QA 文件实际复用 Web 类型，改进重点为 Web／Dart 契约一致性。F-06 补语义 lint 并验证稳定性。F-07 已有 12 个 CSS 变量，本轮集中残留语义色值，不全面改版。

本轮不执行 F-08～F-11，不清理正在运行的构建，不改写 Git 历史。七条验收均已按实际需要处理，未推送。

## 实现与取舍

| 条目 | 实现位置 | 结果与取舍 |
| --- | --- | --- |
| F-01 | `web/components/useWeatherQuery.ts`、`WeatherScreen.tsx` | 接手基线已经有缓存刷新文案、按钮禁用及 `fresh=1`。保留这些行为，抽出查询状态；22 秒请求上限、在途防重、取消与任务身份校验避免迟到响应覆盖新城市。刷新期间继续展示旧预报。 |
| F-02 | `web/lib/weather-request.ts`、`ui-text.ts`、`useWeatherQuery.ts` | 网络、超时、限流、服务不可用、输入、数据格式分别提供四语反馈；不展示上游原始错误。`Retry-After` 支持秒数和 HTTP 日期，等待范围为 1 秒至 5 分钟，缺失时 30 秒；等待后允许主动重试，不加无限自动轮询。 |
| F-03 | `web/lib/service-errors.ts`、`http.ts`、`ask-http.ts`、`ask.ts` | 标准错误类配合 `isWeatherError`／`isAskError`；跨模块副本依赖共享品牌与字段校验，不改变原生 `instanceof`。普通三字段对象、非法状态码及未知异常不会直接透出消息；已有错误码保留。品牌不是安全凭证，守卫只用于进程内异常识别。 |
| F-04 | `web/lib/weather.ts`、`client-forecast.ts`、`ServerScreen.tsx`、`OtherCities.tsx`、`useMapWeather.tsx` | SSR 始终传递 `demo-v1` 或上游配置摘要命名空间，即使天气为空；浏览器预报键与摘要键均带该标识。服务端保留独立版本／供方／坐标键。旧浏览器键自然失效，不暴露上游地址或凭据；没有把地图天气标记重新加回界面。 |
| F-05 | `contracts/forecast-cases.json`、`web/tests/forecast-contract.test.ts`、`mobile/lib/forecast_contract.dart`、`mobile/test/forecast_contract_test.dart` | 共用 21 个合法／非法样本，覆盖零温度、零降水、缺测概率、嵌套字段类型、范围、日期与可选比较小时。`Forecast.fromJson` 先验证再构造，非法数据抛出 `FormatException`。共享内部快照契约，保留服务端上游归一化，不为两种语言引入完整代码生成链。 |
| F-06 | `eslint.config.ts`、根目录脚本与锁文件、`.github/workflows/web-quality.yml`、`qa/test/hooks.test.ts` | Hooks 规则作为错误，零警告门禁；修复实际五项诊断。收藏重命名使用稳定回调，摘要按坐标集合请求，反向地名 effect 不随名称变动重启，首页定位用 `useEffectEvent` 读取当前处理逻辑。ESLint 10 配合解析器、Hooks 插件和 jiti；只注册插件规则以避开其上游配置类型不兼容，不加类型断言或规则禁用。未加入不兼容 ESLint 10 的额外无障碍插件，本轮门禁不声称覆盖全部无障碍规范。 |
| F-07 | `web/app/globals.css`、`web/components/Symbols.tsx`、`Forecast.tsx` | 沿用既有 12 个变量，再集中天气图标、趋势图及错误反馈语义色值；图标与曲线使用变量，保持实际颜色和布局。未按文件行数重写样式或改版。 |

实现提交：`34cbb7a`（共享契约）、`8292c88`（语义色值）、`97538aa`（缓存、错误及 Hooks）。取舍与验收另行提交。

## 执行命令与结果

以下均在 2026-11-17 执行。命令从仓库根目录运行；本机 Shell 按规则使用 `rtk proxy` 前缀。日志位于未跟踪的 `qa/evidence/`。

| 命令／操作 | 实际观察 | 本地证据 |
| --- | --- | --- |
| `npm --prefix web test` | 151 项通过、0 失败，包含服务异常、命名空间、请求分类及共享契约 | `review-web-tests-final.log` |
| `npm run test:qa` | 20 项通过、0 失败，包含 Hooks 正反样本验证 | `review-qa-tests-final.log` |
| `npm run lint` | 零错误、零警告 | `review-lint-integrated-final.log` |
| `npm run typecheck` | 根目录与 Web 通过；加入 QA 门禁测试后再复核通过 | `review-types-integrated-final.log`、`review-types-closeout.log` |
| `npm run typecheck:audit` | 194 个文件无显式 `any`、无非空断言；剩余 1 处已有的收窄适配断言，本轮未增加断言 | `review-type-audit-final.log` |
| `cd mobile && flutter analyze` | 无问题 | `review-flutter-analyze-final.log` |
| `cd mobile && flutter test` | 当时工作区全量 104 项通过；两端均消费 21 个共享契约样本 | `review-flutter-tests-final.log` |
| `NEXT_DIST_DIR=.next-review-repairs-final npm --prefix web run build` | 生产编译、静态页面生成成功 | `review-build-final.log` |
| `QA_REFRESH_RUN=review-verified NEXT_DIST_DIR=.next-review-repairs-final node qa/web-cache-refresh-browser.ts` | 49 项通过，页面异常 0，详见下方 | `review-browser-verified.log`、`review-verified-browser.json` |
| 同轮生产运行设置 `QA_REVIEW_RELATED=1` | 名称恢复 21 项、迟到授权 6 项通过，异常均为 0 | `review-browser-final.log`、`review-related-reverse.json`、`review-related-grant-browser.json` |

浏览器脚本启动独立生产实例 3338、受控上游 3398 与临时缓存，结束后清理自己的进程／缓存。没有重启共享的日常服务。名称恢复及授权测试与最终版本的对应 effect 相同；最后一次生产构建只追加天气请求取消身份保护，因此复用该相关证据。

为核对源码包，另从产品提交 `97538aa` 导出隔离副本，在同一机器执行 `npm ci`、`npm --prefix web ci`、Flutter 依赖获取及上述检查。已提交树的 Web 151 项、QA 20 项、Flutter 100 项全部通过，类型、lint、Flutter 分析和生产构建通过。Flutter 数量与工作区 104 项的差异来自未提交的 AI 测试，不把这些样本计入归档版本。证据为 `review-committed-web-tests.log`、`review-committed-qa-tests.log`、`review-committed-flutter-tests.log`、`review-committed-types.log`、`review-committed-lint.log`、`review-committed-flutter-analyze.log`、`review-committed-build-final.log`。

隔离副本再以 `QA_REFRESH_RUN=review-committed NEXT_DIST_DIR=.next-review-committed node qa/web-cache-refresh-browser.ts` 运行生产浏览器，49 项全部通过、页面异常 0。结构化记录、日志与截图已复制回原工作区 `qa/evidence/review-committed-*`，构建和测试只使用已提交的产品文件。

## 生产浏览器观察

- 简体、繁体、英文、韩文各覆盖 1440／1024／768／390 宽度：缓存预报仍有 24 小时正文，刷新按钮显示等待且禁用；一次客户端请求合并一次上游请求，无水平溢出。
- 六类错误逐一覆盖四语，保留旧快照，原始私有错误文本不出现在页面；限流 2 秒样本等待后允许主动恢复，实际浏览器请求等待上限也通过时钟控制验证。
- 初始 SSR 无天气时，当前命名空间的完整本地快照可恢复；不同供方、demo 及历史旧键不会污染当前天气。有效缓存切四语均为零天气请求。
- 在首尔天气响应尚未完成时切东京，再释放温度为 999 的旧响应：当前标题、时区和 24 小时预报仍属于东京，没有显示旧值。
- 天气云图标计算色值为 `rgb(83, 101, 91)`，趋势线为 `rgb(59, 118, 91)`；四语四宽度保持一致。

## 失败与修复过程

- 初始 Flutter 契约测试错误地要求每个有效样本降水概率均为空，导致一个 100% 合法样本断言失败；收紧为空断言的适用样本后，全量 104 项通过。初次分析指出测试缺少条件花括号，修正后无问题。
- 首次 lint 在依赖安装尚未完成时缺少 jiti；安装完成后收集到五项真实 Hooks 依赖问题，修复稳定回调、请求依赖与事件读取后清零，没有跳过规则。
- 首次整合类型检查遇到 Hooks 插件自带配置类型与 ESLint 10 不兼容；只注册本轮所需的规则定义后类型检查通过，没有用 `as` 绕过检查。初选 ESLint 9 提示维护期问题，升级至 10；不保留仅支持旧主版本的非必要插件。
- 浏览器脚本依次扩展到 47、48、最终 49 项，均通过；新增项覆盖实际超时与旧城市响应，保留各次日志。没有以重复通过覆盖失败记录。
- 隔离副本首次构建缺少未跟踪的本地 `SITE_URL`，按既有启动校验失败；显式设置 `SITE_URL=http://127.0.0.1:3338` 后，Turbopack 又拒绝指向副本外的依赖符号链接。移除的仅为隔离副本中的两个依赖链接，以锁文件重新 `npm ci` 后构建通过；原工作区依赖未改动。相关失败保留在 `review-committed-build.log` 和 `review-committed-build-retry.log`，没有放宽生产地址校验或打包边界。

## 交付与未验证层

现有代码先提交三批，再提交本轮三批实现和文档。共享工作区同时有其他 AI 输入／失败交互和发布文档改动，未混入本轮修复提交，也未回退；上述全量测试如实记录当时工作区版本。源码归档以最终已提交树为边界，便于复核，不把进行中的修改打进包。

CI 工作流已提供，本轮未推送，因此没有 GitHub 远端执行结果。本轮真实模型调用次数为 0，未重新执行公网 SEO 或移动真机；Flutter 只完成解析边界、分析及测试，没有重建 APK／iOS，既有安装包仍对应前轮产物。已有本地服务与构建目录保持可用；生产验收使用独立实例，不将共享服务当前构建视为本轮修复已部署的证据。
