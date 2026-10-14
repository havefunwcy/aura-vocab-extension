# Aura Dict | 触感划词与生词本 (Neumorphic Edition)

![Manifest V3](https://img.shields.io/badge/Manifest-V3-success?style=flat-square)
![Design Style](https://img.shields.io/badge/Design-Neumorphism-blue?style=flat-square)
![Browser Support](https://img.shields.io/badge/Browser-Chrome%20%7C%20Edge-informational?style=flat-square)

专为沉浸式阅读打造的新拟态（Neumorphism）物理触感交互浏览器扩展。  
选用有道词典为查词源，提供物理级按压反馈的生词收藏管理与 Anki 词库导出，并内置专属本地 PDF 流式触感阅读器。

---

## ✨ 核心特性

### 1. 物理触感划词浮窗（In-Page Floating Tooltip）
- **新拟态美学**：柔和的环境漫反射阴影、凹凸质感按键、微发光状态指示灯；
- **智能双引擎查词**：基于有道词典 API（完整释义 + 联想双源容灾备份），支持中英互译、国际音标、真人发音；
- **智能语境捕获**：划词时自动提取所在段落/句子的上下文语境，入库后保留第一手阅读语境。

### 2. 沉浸重排本地 PDF 触感阅读器（Reflow Immersive Reader）
- **彻底告别 Canvas 选词错位**：采用智能段落聚类算法，将 PDF 文本流直接解析并重构为 100% 原生语义 HTML 段落（`<p>`、`<h2>`），从根本上解决 PDF.js 文本层首字母截断与文字偏离问题；
- **4 款拟物护眼阅读纸张**：
  - 📜 **暖柔羊皮纸 (Warm Parchment)**：温润典雅，长篇小说阅读首选；
  - 📄 **精炼纯白 (Clean Paper)**：经典黑白报章对比；
  - 🍃 **豆沙护眼绿 (Eye-care Green)**：舒缓视觉疲劳；
  - 🌙 **暗夜深灰 (Dark Mode)**：低照度舒适夜读；
- **专业级排版微调器 (Aa)**：
  - 字号调节：13px 至 28px 自由缩放；
  - 字体切换：非衬线现代体（Sans-Serif）与优雅衬线体（Serif）即时切换；
  - 版心宽度：680px ~ 1400px 自定义阅读页宽；
- **全智能章节目录抽屉（TOC Drawer）**：自动提取 PDF 原生大纲目录与页码，支持侧边抽屉滑动展开与一键跳章；
- **极速无限滚动与断点续读**：首屏极速加载，滚轮无限追加后续章节，阅读进度自动记忆并于下次打开时无缝续读；
- **双模随意切换**：随时在「✨ 沉浸重排」与「📄 原版视图」之间无缝切换；
- **原汁原味划词查词**：重排流内享受纯原生文本选取体验，有道音标释义浮窗、真人发音朗读与一键星标生词本。

### 3. 原生 PDF 极速伴侣：触感侧边栏（Chrome Side Panel）
- **畅享 Chrome / Edge 原生 C++ 引擎**：可在浏览器自带原生阅读器中配合侧边栏阅读；
- **全生态触感侧边栏**：快捷键 **`Alt+S`**、工具栏图标或右键一键呼出；
- **右键即刻查词**：选中任意词汇右键点击 **「Aura 触感查词」** 直达侧边栏；
- **智能「📋 复制即查词」**：双击词汇按 **`Ctrl+C`**，侧边栏通过剪贴板传感器自动感知并瞬间给出释义；
- **即时星标与会话历史**：支持一键星标加入生词本、真人发音朗读与历史查词回溯。

### 4. 全功能生词本工作台（Vocab Workbench）
- **实时响应式网格**：多维度展示生词、音标、释义、上下文例句、阅读来源；
- **一键 Anki 词库导出**：支持标准 UTF-8 CSV 导出，完美兼容 Anki 牌组导入与移动端同步；
- **生词管理**：支持一键发音、单条移除、清空与实时词汇计数。

### 5. 精密硬件微型控制面板（Popup Console）
- **微米级机械倒角雕刻**：一体压铸成型的实体仪器外壳质感，多层高光棱边与内敛微倒角；
- **三大触感功能入口**：直达 **「重排阅读」**、**「触感侧栏」** 与 **「生词本」**；
- **下沉式 CNC 控制槽**：一键开启/停用划词取词，状态实时同步全浏览器标签页；
- **硬件级微型 LED 指示灯**：实时指示扩展运行状态。

---

## 🛠️ 安装与使用教程

### 适用于 Google Chrome / Microsoft Edge

1. **打开浏览器扩展管理页面**：
   - **Microsoft Edge**：访问 `edge://extensions/`
   - **Google Chrome**：访问 `chrome://extensions/`
2. **开启「开发者模式 (Developer Mode)」**（通常位于右上角或左下角开关）；
3. **加载扩展**：
   - 点击 **「加载解压缩的扩展 / Load unpacked」**；
   - 选择本项目的根目录文件夹 (`youdao-vocab-extension`)。
4. **本地 PDF 权限开启（重要）**：
   - 在扩展管理页中找到 **Aura | 触感划词与生词本**，点击 **详细信息 (Details)**；
   - 勾选开启 **「允许访问文件网址 (Allow access to file URLs)」**。
5. **开启沉浸阅读**：
   - 点击浏览器右上角扩展图标，在微型控制台中点击 **「✨ 重排阅读」**；
   - 点击 **「打开本地 PDF 文件」**，即可进入高拟真排版沉浸流。

---

## 📂 项目结构

```
aura-vocab-extension/
├── manifest.json       # Manifest V3 核心配置清单
├── background.js       # Background Service Worker（跨域查词代理与通信）
├── content.js          # 网页划词捕获与 Shadow DOM 隔离浮窗
├── popup.html          # 工具栏微型硬件控制台
├── popup.css           # 控制台新拟态样式
├── popup.js            # 控制台逻辑与状态同步
├── reader.html         # 沉浸重排流式 PDF 阅读器（方案二）
├── reader.css          # 护眼纸张主题、字体排版与大纲抽屉样式
├── reader.js           # PDF 文本段落重构引擎、无限滚动与划词交互
├── sidepanel.html      # 原生 PDF 伴侣：新拟态触感侧边栏（方案四）
├── sidepanel.css       # 侧边栏触感立体样式
├── sidepanel.js        # 侧边栏剪贴板感知、查词与生词本联动
├── notebook.html       # 全屏生词本工作台
├── notebook.css        # 生词本新拟态网格排版
├── notebook.js         # 生词本管理、音频发音与 Anki CSV 导出
├── libs/               # 离线 PDF.js 核心引擎库
└── icons/              # 新拟态应用图标资源
```

---

## 📄 开源许可证

MIT License © 2026 [havefunwcy](https://github.com/havefunwcy)

