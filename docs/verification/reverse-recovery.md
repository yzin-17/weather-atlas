# 坐标名称偶发缺失的修复与取舍

日期：2026-11-17（Asia/Shanghai）。本轮修改共享反向地理编码服务和 Web 恢复流程。

## 五分钟复现与演示

打开日常服务 `https://192.168.5.22:3443/zh-Hans/explore?lat=30.7513&lon=106.2048&kind=pin&id=point`。标题应显示“高坪区”，URL 仍保留原坐标；逐小时为 24 项。切语言或重新进入坐标页，名称按各语言缓存分开处理。真实供图和地名上游没有译名时仍使用当地名称，不能把受控四语名称用例当作上游具备全部翻译。

要复现短暂失败及恢复，先完成下方生产构建，然后从根目录运行浏览器专项。脚本自动展示首次空结果、短暂坐标回退、恢复地名、持续失败的有界重试、网络恢复、键盘手动重试，以及迟到结果不覆盖新城市／新语言。

## 原因与实际结果

1. 截图坐标确实不在原 1 公里检索结果内。修复前日常 HTTPS `/api/reverse` 返回 `200`、`place: null`，耗时 2577 毫秒。直接请求 Photon，同一点 `radius=1` 返回空数组；`radius=10` 返回包含“佛门乡”“高坪区”的地址属性。因此本例首先是检索范围不足，不能全部归因为网络超时。
2. 旧服务将超时／异常与真实空覆盖都缓存为 `null`，有效期五分钟。旧页面只请求一次，失败结束占位后一直显示区域或坐标，没有恢复入口。这会放大瞬时故障的影响。
3. 修复后用独立空缓存请求真实 Photon，共两次上游请求，2137 毫秒返回“高坪区”，`level: region`。部署到日常 HTTPS 后接口耗时 3213 毫秒，浏览器标题同样为“高坪区”，24 项小时天气可见、无页面错误、URL 坐标未变。该页面天气带有“缓存预报 · 重试”标记；未将旧预报写成新鲜上游天气。

真实上游记录：`qa/evidence/reverse-recovery-live.json`；日常 HTTPS 记录及截图：`reverse-recovery-https.json`、`reverse-recovery-https.png`。HTTPS 服务日志记录该次两次反向编码上游均为 200，分别为 2150 和 988 毫秒。

## 实现与取舍

- `web/lib/reverse.ts`：先查 1 公里；没有可用名称时最多补查一次 10 公里。两次共用六秒上游预算，仍按共享锁与至少一秒的启动间隔访问 Photon。近距离已有区域名时直接使用，不扩大检索。
- 扩圈结果只采用地址中的行政区域，不拿附近村镇或 POI 名直接充当选点城市。例中采用“高坪区”，没有猜测“南充市”。这依赖附近 OSM 地址的行政信息，并非行政边界点包含判定；边境、海面和覆盖稀疏地区仍可能只能显示区域或坐标。
- 成功名称保留七天缓存、故障时最长三十天旧名称回退；真实无覆盖仍缓存五分钟。临时异常只退避五秒，共享上游繁忙返回可重试结果，不写入真实无覆盖缓存。返回附加字段 `retryAfterMs`，已有 Flutter 客户端仍可读取原来的 `place`。
- 缓存命名空间更新为 `reverse-v3`，避免旧五分钟空缓存阻止新检索；不删除天气或其他缓存。
- `web/components/usePlaceLabel.tsx`：请求仍按精确坐标及语言合并，成功名称写浏览器缓存；仅对临时异常自动重试，最多两次。首次失败后即结束名称占位，后台恢复期间天气和回退文字可读。真实空覆盖不自动循环请求。浏览器 online、返回可见页或“重新识别城市”可触发新一轮；服务端缓存和退避仍生效，手动按钮不强制绕过五分钟真实空覆盖缓存。
- 切城、切语言、卸载时取消重试定时器及监听；旧请求可以完成缓存，但不能修改新页面标题。重新识别不请求天气或模型、不改变选中坐标。四语按钮文案在 `web/lib/ui-text.ts`，入口在 `WeatherScreen.tsx`。
- 本轮没有修改 Flutter 源码。共享服务的扩圈及短退避立即适用于现有客户端；Web 的自动重试与按钮不是 Flutter 新功能。原生沿用已交付的流式对话版本；97 个归档内移动端文件与当前工作区逐字节一致，不把旧原生行为写成本轮新验收。

## 命令与验收

| 命令／操作 | 实际结果与证据 |
| --- | --- |
| `npm --prefix web test` | 124/124；新增四项覆盖截图坐标扩圈、超时恢复与真实空覆盖、异常结构／邻近村镇排除、跨实例上游繁忙恢复。`qa/evidence/reverse-recovery-web-tests.log`。 |
| `npm run typecheck`、`npm run typecheck:audit` | 严格类型及审计通过；保留原有两处类型适配。`reverse-recovery-final-{typecheck,audit}.log`。修改文件经 `oxfmt` 检查。 |
| `NEXT_DIST_DIR=.next-reverse-recovery SITE_URL=http://localhost:3300 npm --prefix web run build` | 生产构建通过，`reverse-recovery-build.log`。 |
| `QA_DIST_DIR=.next-reverse-recovery QA_PERF_CHECKS=reverse-recovery-browser,place-loading,location-grant-browser node qa/next-performance-check.ts` | 先通过 19 项恢复、21 项原有加载和 6 项授权；补充取消／语言竞态并重新构建后，恢复专项 21/21。`reverse-recovery-controlled.log`、`reverse-recovery-final-browser.log`、`reverse-recovery-browser.json`、`place-loading.json`。 |
| 四语 × 1440／1024／768／390 | 16 组首次临时空结果均第二次解析成功；名称恢复额外天气请求为 0，无水平溢出。其余五项覆盖三次上限后 online 恢复、真实无覆盖手动键盘重试、切城迟到、取消排队重试与切语言迟到。均无页面错误，模型调用 0。 |
| `NODE_EXTRA_CA_CERTS="/Users/yzin/Library/Application Support/Weather Atlas/https/ca/rootCA.pem" APP_URL=https://192.168.5.22:3443 QA_REVERSE_RUN=reverse-recovery-https node qa/reverse-recovery-live.ts` | 原坐标标题“高坪区”，390 宽度实看通过，24 小时天气及缓存标记可见，无横向溢出、页面错误。`reverse-recovery-https-check.log`。 |

生产浏览器专项使用受控地名和天气响应验证状态、请求数与竞态；真实 Photon 结果单列。没有调用模型，没有新增长期位置追踪或坐标遥测。

## 过程中的修正

旧 `qa/place-loading.ts` 的浏览器预置名称缓存键仍为 `wa.reverse-label`，产品已经使用 `wa.reverse-label.v2`；同步测试键后确认真正命中已有名称、零反向编码请求，没有放宽产品缓存判断。

HTTPS 首次专项因 Node／Playwright 请求进程未信任本地 CA 失败，原日志保留为 `reverse-recovery-https-ca-failure.log`。使用已有 CA 的 `NODE_EXTRA_CA_CERTS` 后通过，没有关闭证书校验。第一轮 19 项通过记录保留为 `reverse-recovery-browser-initial.json`，后续两项是新增竞态检查。

## 服务与交付

当前生产构建 `.next-reverse-recovery`，服务继续可访问：`http://localhost:3300/zh-Hans` 与 `https://192.168.5.22:3443/zh-Hans`。旧标签页需要刷新以加载新版恢复逻辑。

```sh
cd /Users/yzin/code/weather-atlas/web
NEXT_DIST_DIR=.next-reverse-recovery npm start -- --hostname 0.0.0.0 --port 3300
# 另一终端运行本地 HTTPS
cd /Users/yzin/code/weather-atlas
NEXT_DIST_DIR=.next-reverse-recovery npm run dev:https
```

新版源码与本报告：`/Users/yzin/Documents/Codex/2026-11-16/weather-atlas-24-24-readme-md/outputs/v1.1.2-reverse-recovery`。源码由固定快照生成，排除私有配置、密钥、依赖及构建缓存，交付清单包含 SHA-256，归档检查包含 CRC 与实际模型密钥扫描。原生包继续使用 `outputs/v1.1.2-flutter-ai-stream` 中的 Android 调试包及 iOS 模拟器产物；该轮原生 42 项测试和构建事实见 `qa/FLUTTER-AI-STREAM.md`，本轮不重复宣称真机或签名验收。
