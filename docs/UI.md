# UI 与主题系统

## 视觉论点

温暖的近白背景上承载轻薄、清晰的半透明层；像 iOS 设置与 Wallet 一样平静可信，同时保留价格工具所需的信息密度。

## 内容计划

1. 顶部导航：品牌、三种价格模式、数据更新时间。
2. 价格工作区：产品选择、套餐选择、价格列表。
3. 来源与状态：官方链接、采集时间、数据状态。
4. 邮件订阅：选择产品/套餐并填写邮箱。
5. 页脚：方法说明、免责声明、数据源。

产品页面不是营销落地页，不使用夸张 Hero、统计卡片墙或无意义装饰。

## 交互论点

- 模式和产品切换使用共享布局过渡，动画从当前状态开始。
- 按钮在 pointer-down 立即缩放至 `0.98`，松开回弹；默认无过冲。
- 移动端订阅表单使用底部 sheet，进入和退出沿同一路径。
- 所有动效支持 `prefers-reduced-motion`，退化为短交叉淡入。

## 主题令牌

自动生成的设计系统提供检索参考，但本项目以 Apple 风格和系统字体为更高优先级。默认主题采用：

```css
[data-theme="atelier"] {
  --canvas: #f6f5f2;
  --canvas-elevated: rgba(255, 255, 255, 0.78);
  --surface-solid: #ffffff;
  --ink: #1d1d1f;
  --ink-secondary: #5f5f65;
  --separator: rgba(60, 60, 67, 0.14);
  --tint: #0066cc;
  --tint-pressed: #004f9f;
  --positive: #248a3d;
  --warning: #b45309;
  --negative: #c9342f;
  --focus-ring: rgba(0, 102, 204, 0.34);
  --radius-small: 12px;
  --radius-medium: 18px;
  --radius-large: 28px;
}
```

字体使用：

```css
font-family:
  -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI",
  sans-serif;
```

## 主题替换契约

每套主题只允许修改：

- 语义色彩令牌。
- 字体令牌。
- 圆角、阴影和材质令牌。
- 页面 composition 和纯展示 primitives。

不得修改：

- 数据查询。
- URL 与路由语义。
- 可访问名称。
- 表单校验。
- 领域组件的 props。

首版提供 `atelier` 默认主题，并保留 `midnight` 主题接口，验证主题确实可以无业务改动替换。

## 布局

### 桌面

- 最大内容宽度 1180px。
- 顶部为悬浮半透明导航。
- 产品选择位于价格工作区上方，Claude 固定排在全球产品第二位。
- 全球套餐从左到右按各套餐的全球最低人民币折算价由低到高排列，并默认选中最左侧；
  没有可比价格的套餐排在最右侧。
- 全球区价使用“序号、国家、原始价格、汇率、人民币、比价、官方链接”七列榜单，
  默认按低价优先；国内订阅和 API 保持紧凑三列。
- API 排行和明细以人民币为主；海外 API 在人民币价格下方显示 USD 官方原价和
  汇率，桌面与手机点击排行都定位到对应平台与模型。
- 价格与排行变化使用行内微角标，不增加列；悬浮、键盘聚焦或轻触后展示前后价格、
  名次和确认时间。API 模型目录标题区常驻“订阅新模型”入口，只汇总新增 canonical model。

API 模型目录使用约 1480px 的独立内容宽度和严格八列行式表格：Model、Lab、Context、
Output、Input、Price、Release、Updated。窄屏仅表格容器横向滚动，Model 列固定，页面
本身不得横向溢出。

- 价格使用行式列表和轻量分隔，不堆叠信息卡片。

### 手机

- 375px 起设计。
- 顶部导航简化为品牌和模式菜单。
- 模式使用横向可滚动 segmented control。
- 产品切换保持至少 44px 高点击区域。
- 全球价格行折叠为“序号 + 地区 + 原始价格”，人民币与比价作为原始价格下的次要信息。
- 底部 sheet 避开 `env(safe-area-inset-bottom)`。

## 可访问性

- 正文对比度至少 4.5:1。
- 所有交互目标至少 44×44px。
- 键盘顺序与视觉顺序一致。
- 不用颜色单独表达最便宜、失效或错误。
- 表单错误使用 `role="alert"`。
- 变化角标支持键盘、触摸与 Escape；reduced-motion 下不依赖动画表达状态。
- 图标按钮必须有 `aria-label`。
- 页面缩放不得禁用。

## 动效参数

| 场景             | 参数                                |
| ---------------- | ----------------------------------- |
| 普通状态过渡     | 180–240ms，无过冲                   |
| 产品选择共享布局 | spring，response 0.32，damping 1.0  |
| sheet            | spring，response 0.3，damping 0.8   |
| 列表首次出现     | 20ms 间隔，opacity + translateY 8px |
| pointer down     | scale 0.98，100ms                   |

动效只改变 `transform` 和 `opacity`，避免布局抖动。

## 视觉 QA 尺寸

- 375×812
- 390×844
- 768×1024
- 1024×768
- 1440×900
