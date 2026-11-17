# 地图地名与简化验收

执行日期：2026-11-17。用户要求中文选点惠州显示中文，并移除遮挡地图的天气信息。本轮保留已有 AI SDK、SEO、定位及性能优化修改。

## 实现与取舍

| 项目 | 实现位置 | 结果与取舍 |
| --- | --- | --- |
| 惠州中文名称 | `web/lib/reverse.ts` | 原先固定 `lang=en`，不在内置目录的城市直接保留英文。公共 Photon 实测不接受 `zh`、`zh-Hant`、`ko`，均返回 400；`lang=default` 返回“惠州市／广东省”。现在英文用 `en`，其余语言用当地名称，内置城市继续四语本地化。 |
| 缓存迁移 | `web/lib/reverse.ts`、`web/components/usePlaceLabel.tsx` | 服务端 v2 缓存区分英文与当地名称；Web 本地键也升级为 v2，绕过已缓存七天的旧英文名称。三种非英文界面复用当地名称，保留供方请求间隔与缓存时限。 |
| 原坐标 | 现有 Web／Flutter 选址流程 | 反查只返回显示名称，不将天气坐标替换成市中心；失败仍回退区域名或坐标，天气独立加载。 |
| 地图简化 | `web/components/MapDialog.tsx`、`mobile/lib/location_picker.dart` | 移除天气标记、温度、天气摘要和对应请求。只保留选中点、搜索、真实底图、署名、缩放及确认。Web 确认区放到地图外，窄屏按列排列，避免遮挡和挤压。 |
| 缩放关闭 | `web/components/MapDialog.tsx` | 关闭前停止地图运动，并关闭缩放／瓦片渐变动画，消除缩放后立即关闭产生的 `_leaflet_pos` 错误。保留拖动与缩放交互。 |
| 原生接口 | `mobile/lib/main.dart` | 不再向地图传入预报和收藏天气摘要。其他城市列表仍保持自己的摘要功能。 |

未增加惠州专用翻译表。公共 Photon 数据集含英文及当地名称，但不能保证全球非内置地点均译为当前界面语言；例如韩文界面的惠州仍返回“惠州市”，繁体界面也可能保留简体当地名。该覆盖限制与中国城市被强制转为英文拼音是两回事。供方说明：[Photon API 语言参数](https://github.com/komoot/photon/blob/master/docs/api-v1.md#adjust-language)、[数据集语言范围](https://github.com/komoot/photon#setting-photon-up-with-the-release-binaries-and-extracts)。

## 验证方法与证据

1. `npm run typecheck`、`npm run typecheck:audit`；Web 严格类型检查和类型门禁通过。门禁发现新加入的 `qa/ai-sdk-service-check.ts` 空数组推断为隐式 any，已补齐元素类型，未执行该脚本的真实模型调用。
2. `npm test --prefix web`：98/98。新增惠州先英文、后中文、跨实例及重启的缓存回归；原有四语缓存测试按英文／当地名称两份缓存更新。证据：`qa/evidence/map-clean-web-tests.log`。
3. `NEXT_DIST_DIR=.next-map-clean SITE_URL=http://localhost:3300 npm run build`：生产构建通过。证据：`qa/evidence/map-clean-build.log`。
4. `flutter analyze --no-pub` 无问题；`flutter test` 21/21。移除的天气标记功能原有三项测试收敛为一项单点／请求预算／确认坐标测试，数量变化不是跳过失败测试。证据：`qa/evidence/map-clean-flutter-{analyze,tests}.log`。
5. `QA_DIST_DIR=.next-map-clean QA_PERF_CHECKS=map-clean-browser node qa/next-performance-check.ts`：四语 × 1440／1024／768／390 共 16 组，加一次真实惠州选点；检查无天气标记与预览、地图内无语言设置、地图前零瓦片、打开和拖动零天气／摘要请求、页面不溢出、确认后名称与原坐标。天气来自受控上游，底图为真实 OSM，地名为真实 Photon。证据：`qa/evidence/map-clean-browser.json` 和 `map-clean-{宽度}.png`、`map-clean-huizhou.png`。
6. 实际 `/api/reverse?lat=23.11&lon=114.41&lang=...` 四语请求均 200。简中、繁中、韩文返回“惠州市”，英文返回 `Huizhou`；首次当地名称 2832ms，随后繁中缓存 5ms，英文 967ms，韩文缓存 3ms。证据：`qa/evidence/map-clean-huizhou-live.json`。这些是单次地名请求耗时，不代表天气或整页性能。

完整复测使用 `QA_PERF_CHECKS=map-clean-browser,weather-map-native`，并设置 `QA_MAP_RUN=map-clean`、`FLUTTER_SDK`、`VERIFICATION_WORK`、`QA_ANDROID_DEVICE=emulator-5554`、`QA_IOS_DEVICE=23AB3E1A-4C30-462C-943C-B9CB5B894E96`。原生脚本生成独立前缀，保留历史天气地图证据。旧 `qa/weather-map-browser.ts` 入口转到当前简化地图回归，避免继续要求已移除的天气标记。

## 过程中发现的问题

- 首轮 Web 测试错误地要求浏览器出现 `/api/weather`；坐标页实际经 SSR 读取天气。改为核对 URL 坐标、受控天气值，并检查浏览器若发天气请求仍使用同一点。
- 首轮截图发现 390px 下确认按钮宽度挤压城市名；改为纵向排列后重新截图。缩放后立即关闭的两次 Leaflet 错误同时修复，随后浏览器记录为零错误。
- 添加零请求预算检查时，曾在城市摘要初始化尚未完成就计数，误把首页摘要计入地图。改为等待页面网络空闲后建立地图预算基线。
- 首轮 Android 测试仍等待已移除的 `/api/summaries`，尽管六张真实瓦片均已返回 200 且解码为 256px。删除过时等待，保留失败日志与 `map-clean-native-android-first-failure.json`。
- 核查第一次原生通过记录时，确认点仍是原始首尔：测试只等了一帧，尚未收到地图点击回调。为防止把未移动点误判为通过，增加等待标记实际移动及 `id=point` 断言，并加入真实惠州中文反查；双端重新通过。旧记录保留为 `map-clean-native-*-before-point-wait.json`。
- 截图一度捕获到缩放后瓦片尚未返回的灰色地图；改为等待当前瓦片全部解码后，在更新后的日常服务重新生成四种宽度截图。
- 第一次打包直接读取运行中服务的日志，文件长度变化导致 ZIP 失败。改为先导出静态源码快照，再生成源码 ZIP；不停止已验证的本地服务。最终归档仅使用完整性校验通过的文件。
- `taste-skill` 脚本返回 `GATE: OFF (no build active)`，本轮没有启动其整站设计流程。地图实际交互与截图由项目浏览器／模拟器回归验证，该结果不计为技能整站门禁通过。

## 原生、服务与交付

最终 Android／iOS 原生地图集成测试各 1/1 通过，四语／四宽度浏览器 17 组通过且无页面错误。Android 为 arm64 模拟器 `emulator-5554`、Android 17；iOS 为 iPhone Air 模拟器、iOS 26.5。真实底图分别请求 18／15 张瓦片。两端各有一次初始天气、一次惠州中文反查和一次确认后天气请求；打开、拖动、缩放与待确认选点没有天气／摘要请求。最终 Android 确认点为 `26.5666474521346,120.26627499999995`，iOS 为 `26.428293572895253,120.23990781250001`，后续天气 URL 与其一致。证据：`qa/evidence/map-clean-native-{android,ios}.json`、对应 `map-clean-*-map-open.png` 及 `map-clean-native-final.log`。

`qa/build-local-mobile.ts` 以普通 `lib/main.dart` 入口构建 Android debug、iOS arm64 debug 模拟器及 iOS arm64 release `--no-codesign`。集成测试后重新构建 debug 产物，防止交付测试入口；iOS release 源码相同，沿用本轮已构建的未签名产物。APK 为 Android Debug RSA 签名，v2 验证通过；iOS 模拟器为 ad-hoc，真机包未签名，不能直接安装。构建记录：`qa/evidence/map-clean-mobile-builds.json`。19 项 QA 工具测试通过，归档额外校验 CRC、实际模型凭据、普通应用入口及清单 SHA-256。

日常 HTTP／HTTPS 已使用 `.next-map-clean` 更新。Web 为 `http://localhost:3300/zh-Hans`；手机同一局域网使用 `https://192.168.5.22:3443/zh-Hans`，受信任证书安装见 `qa/LOCAL-HTTPS.md`。代表城市 HTML、HTTPS 证书校验及惠州反查均通过，证据：`map-clean-service-health.json`。重启命令：

```sh
cd /Users/yzin/code/weather-atlas/web
NEXT_DIST_DIR=.next-map-clean npm start -- --hostname 0.0.0.0 --port 3300
# 另一个终端，从项目根目录启动 HTTPS
cd /Users/yzin/code/weather-atlas
NEXT_DIST_DIR=.next-map-clean npm run dev:https
```

Android 普通包默认 `http://10.0.2.2:3300`；iOS 模拟器为 `http://127.0.0.1:3300`。真机可在应用设置填写同一局域网地址。新版文件保存至 `/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2-map-clean`：源码 ZIP、Android 调试 APK、iOS 模拟器 ZIP 和 iOS 真机未签名 ZIP；实际字节数、哈希及校验结果见该目录 `DELIVERY-MANIFEST.json`、`ARTIFACT-VERIFICATION.json`。

本轮没有重新执行真实模型调用，也没有产生新的公网 SEO 或真实用户样本结论；此前结果保持原日期。真实 GPS、实体手机、公开域名及商业地图译名覆盖沿用总验收报告的资源边界。
