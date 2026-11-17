# 选址后的天气加载态

执行日期：2026-11-17。用户反馈地图确认返回页面后，天气尚未加载完时缺少明显加载态。

## 行为与实现

- Web 的 `WeatherScreen.tsx` 在确认定位、地图点或搜索城市后立即记录目标地点，以 Next.js 导航的真实等待状态控制 `WeatherLoading.tsx`。等待期间显示所选地点和坐标、四语加载文案、当前天气／小时／周预报占位，隐藏上一城市的天气与 AI 入口。新页面拿到数据后自动替换，不设置人为最短等待时间。
- 对于尚未解析城市名的坐标点，标题显示“所选位置”，坐标在其上方小字显示，避免把长坐标作为巨大标题。反查仍与天气独立运行；不会把天气查询改为城市中心。
- 头部搜索在加载期间仍可使用。再次选择城市时以最新导航为准；原导航迟到不能覆盖新选择。
- `WeatherLoading` 使用 `role=status`、`aria-live=polite`，页面与区域标记 `aria-busy`；占位不被读屏当成真实预报。旋转指示尊重减少动态效果的系统设置。沿用既有颜色、标题和留白，不增加页面弹窗。
- 问答面板在导航等待期间收起，保持其组件状态，避免选同一地点或取消导航时无谓丢失草稿；确认进入其他城市后按现有地点键重建上下文。
- Flutter `main.dart` 在新地点无快照且 `refreshing` 时，显示四语“正在加载所选位置的天气…”及明显进度占位；继续依赖 `controller.dart` 的地点隔离与缓存。有效缓存立即显示，同城后台刷新仍保留已有数据；新地点没有缓存时不会使用旧城市的温度。
- 上游失败后加载结束，当前点进入已有失败／重试界面，不让占位永久停留。

## 验证

| 命令或操作 | 观察结果与证据 |
| --- | --- |
| `npm run typecheck`、`npm run typecheck:audit` | 严格检查及原有类型门禁通过；保留既有两处已说明的类型适配。 |
| `npm test --prefix web` | 固定交付快照 107/107（初轮 98，快照同时保留并行新增的天气建议测试）；`qa/evidence/selection-loading-web-tests-delivery.log`。 |
| `npm run test:qa` | 19/19；`qa/evidence/selection-loading-qa-tests.log`。新增原生测试文件加入 `qa/lib/archive.ts` 的测试入口拒绝清单。 |
| `NEXT_DIST_DIR=.next-selection-loading-delivery SITE_URL=http://localhost:3300 npm run build` | 生产构建通过；`qa/evidence/selection-loading-build-delivery.log`。沿用 SSR 可读天气正文，不提前把正常城市页改为空的客户端外壳。 |
| `QA_DIST_DIR=.next-selection-loading-delivery QA_PERF_CHECKS=selection-loading-browser,ask-draft-check node qa/next-performance-check.ts` | 使用生产构建。四语 × 1440／1024／768／390 的 16 组延迟导航、加载中二次选城、上游 503 共 18 组；另检查问答草稿。18 组通过、零页面错误，另有问答草稿 20 项通过、零模型调用；结果见 `qa/evidence/selection-loading-browser.json`、`selection-loading-delivery-acceptance.log`。 |
| 浏览器延迟操作 | 确认点后将 RSC 响应暂缓至少 500ms；占位保持可见，旧温度、小时预报与 AI 入口不可见。放行后展示同一点的受控预报；四种宽度均无水平溢出。截图：`qa/evidence/selection-loading-{宽度}.png`。本项阻断地图瓦片和反查，不重复宣称真实底图／地名验收。 |
| `flutter analyze --no-pub`、`flutter test --no-pub` | 无分析问题，25/25；新增四语延迟加载测试检查旧温度不可见、加载文案与进度可见、完成后恢复小时预报。证据：`qa/evidence/selection-loading-flutter-{analyze,tests}.log`。 |
| `flutter test integration_test/selection_loading_test.dart -d {设备} --no-pub --plain-name 'selected location shows loading'` | Android 17 arm64 模拟器 `emulator-5554`、iOS 26.5 iPhone Air 模拟器各 4/4。复用受控 HTTP 的四语界面用例，在实际原生运行环境确认加载与完成切换；不代表真实 GPS 或真实天气上游。证据：`qa/evidence/selection-loading-native-tests.json` 与对应双端日志。 |

原生构建仍通过 `qa/build-local-mobile.ts`，使用 `QA_MAP_RUN=selection-loading` 区分本轮记录。Android debug、iOS arm64 debug 模拟器、iOS arm64 release 未签名产物均已构建；集成测试后重新构建普通 `lib/main.dart` debug 入口并安装，避免交付测试应用。构建证据：`qa/evidence/selection-loading-mobile-builds.json`。

## 过程取舍与边界

首轮浏览器检查在第十个坐标上因字符串断言失败：地址会把 `23.10` 正常归一化为 `23.1`。改为比较数值，保留 `selection-loading-browser-first-failure.json`；天气查询点没有变化。二次选城用例最初按城市 ID 定位按钮，但现有选项 ID 使用列表下标，改为按可访问选项中的城市名定位。默认推荐列表也没有东京，最终通过受控搜索返回东京再验证二次选城；搜索框需限定 `.search-input input`，避免误中语言下拉框。初稿中曾以长坐标作为加载标题，窄屏截图显示占用过多空间，改为“所选位置”与小字坐标并重新截图。

固定快照目录为 `/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/work/selection-loading-source/weather-atlas`，其中执行最终 Web 测试、类型审计、生产构建及浏览器检查，再复制该构建到项目 Web 目录运行。并行问答修改保留在快照中；快照之后的其他会话修改不自动混入本轮交付。最初尝试链接项目依赖，Turbopack 拒绝工作区外的依赖，改为本地克隆依赖后通过构建；未修改 Next.js 的项目边界配置。

本轮没有增加固定等待、额外天气预加载或模型请求。有效缓存仍复用原有 15 分钟／3 小时策略，定位、名称与天气加载分开表达。公开 SEO、商业地名翻译覆盖、实体设备和真实用户性能样本的状态仍按总报告记录，不因本轮加载态回归而改变。

## 服务与产物

日常服务使用 `.next-selection-loading-delivery`：`http://localhost:3300/zh-Hans`，同一局域网手机使用 `https://192.168.5.22:3443/zh-Hans`，证书配置见 `qa/LOCAL-HTTPS.md`。实际 HTTP／HTTPS 城市页及惠州反查均返回 200，证据见 `qa/evidence/selection-loading-service-health.json`。

```sh
cd /Users/yzin/code/weather-atlas/web
NEXT_DIST_DIR=.next-selection-loading-delivery npm start -- --hostname 0.0.0.0 --port 3300
# 另一终端，从项目根目录启动本地 HTTPS
cd /Users/yzin/code/weather-atlas
NEXT_DIST_DIR=.next-selection-loading-delivery npm run dev:https
```

新版目录：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2-selection-loading`。包含源码 ZIP、Android 调试 APK、iOS 模拟器 ZIP、iOS 真机未签名 ZIP；签名性质沿用调试／模拟器／未签名边界。源码先导出静态快照再归档；CRC、实际凭据与普通应用入口检查、字节数及 SHA-256 见该目录的清单和校验记录。
