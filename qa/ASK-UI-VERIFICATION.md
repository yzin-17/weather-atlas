# Web 问答浮窗与语言控件验收

原始证据保管：完整日志、快照和多数截图仅作为本地产物保存；Git 中保留的摘要、精选截图及原始记录位置见 [验收证据索引](../docs/verification/README.md)。

日期：2026-11-16。范围为现有 Web 交互组件，沿用 Weather Atlas 的配色、字体和图标。

## 行为与实现

- `web/components/FloatingPanel.tsx`：右下角非模态面板，不加遮罩、不锁页面滚动。支持 Escape 收起、焦点返回入口；监听 `visualViewport` 调整可视高度和底部位置。
- `web/components/WeatherScreen.tsx`：右下角常驻入口与原逐小时入口共用面板；收起只隐藏面板，保留输入、回答及比较上下文，其他地点弹窗独立工作。
- `web/components/AskDialog.tsx`：回答区域独立滚动，输入区固定底部；保留快捷问题、三轮追问、409 刷新及对应城市依据。Shift+Enter 换行，输入法组合确认不会误发。
- `web/app/globals.css`：语言选择器使用固定宽度，桌面 150 px、窄屏 112 px、360 px 以下为 96 px，不随中英文选项长度变化；320 px 下品牌保持单行。
- `web/lib/ui-text.ts`：补齐浮窗收起、欢迎和预报提示的四语文案。

## 已执行的检查

```sh
APP_URL=http://localhost:3304 node qa/language-control.ts
APP_URL=http://localhost:3304 node qa/floating-ask.ts
cd web
npm test
NEXT_DIST_DIR=.next-permission-build npm run build
```

- 四种语言 × 五档宽度，共 20 个工具栏场景：选择器宽度一致，无横向溢出。[原始记录](../docs/verification/README.md#record-f575d4502c6c)。
- 浮窗覆盖 1440、1024、820、768、390、320 px；检查右下角定位、背景页面可操作、无模态遮罩、输入保留、Escape 与焦点恢复。[原始记录](../docs/verification/README.md#record-fa5e50a7c0de)。
- 首尔／台北三轮规则问答得到三个 200；等待回答时收起后仍能恢复结果，下午时段和温度指标保持正确。点击台北依据后，其时区与小时记录在浮窗内置顶显示。
- 可视高度缩至 440 px 时，输入框和发送按钮均在可见范围。此项为浏览器视口检查，未冒充真机软键盘验收。
- Node 测试 44/44 通过；独立输出目录的生产构建通过。

桌面截图：`evidence/ask-floating-1440.png`；手机截图：`evidence/ask-floating-390.png`；依据页：`evidence/ask-floating-evidence.png`。截图在有限入场动画结束状态采集，避免将淡入中间帧当作界面最终效果。

当前预览服务为 `http://localhost:3304/zh-Hans/weather/seoul-1835848`；开发启动命令为 `cd web && NEXT_DIST_DIR=.next-permission-check npm run dev -- --hostname 0.0.0.0 --port 3304`。
