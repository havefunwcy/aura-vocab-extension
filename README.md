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

### 2. 专属连续垂直流 PDF 阅读器（Continuous Scroll PDF Reader）
- **滚轮连贯排版**：采用连续垂直流式排版，支持鼠标滚轮自由上下翻滚阅读整部 PDF 文档；
- **按需懒加载机制**：视口进入动态渲染，百万字文献亦可流畅阅读；
- **像素级标准文本对齐（TextLayer）**：严格遵循嵌入字体渲染度量，精准支持鼠标划词与有道查词；
- **页码历史自动记忆**：关闭标签页或重新打开已读 PDF 时，**自动秒级跳转至上次阅读的页面与位置**；
- **顶栏一键折叠（沉浸纯净模式）**：支持快捷键 **`H`** 或点击右上角实体按键一键平滑收起顶栏，保留极致纯净的阅读视野。

### 3. 全功能生词本工作台（Vocab Workbench）
- **实时响应式网格**：多维度展示生词、音标、释义、上下文例句、阅读来源；
- **一键 Anki 词库导出**：支持标准 UTF-8 CSV 导出，完美兼容 Anki 牌组导入与移动端同步；
- **生词管理**：支持一键发音、单条移除、清空与实时词汇计数。

### 4. 精密硬件微型控制面板（Popup Console）
- **微米级机械倒角雕刻**：一体压铸成型的实体仪器外壳质感，多层高光棱边与内敛微倒角；
- **下沉式 CNC 控制槽**：一键开启/停用划词取词，状态实时同步全浏览器标签页；
- **硬件级微型 LED 指示灯**：实时指示扩展运行状态。

---

## 🛠️ 安装与使用教程

### 适用于 Google Chrome / Microsoft Edge

1. **下载或克隆本项目代码**：
   ```bash
   git clone https://github.com/havefunwcy/aura-vocab-extension.git
   ```
2. **打开浏览器扩展管理页面**：
   - **Microsoft Edge**：访问 `edge://extensions/`
   - **Google Chrome**：访问 `chrome://extensions/`
3. **开启「开发者模式 (Developer Mode)」**（通常位于右上角或左下角开关）；
4. **加载扩展**：
   - 点击 **「加载解压缩的扩展 / Load unpacked」**；
   - 选择本项目的根目录文件夹。
5. **本地 PDF 权限开启（重要）**：
   - 在扩展管理页中找到 **Aura | 触感划词与生词本**，点击 **详细信息 (Details)**；
   - 勾选开启 **「允许访问文件网址 (Allow access to file URLs)」**。

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
├── reader.html         # 专属本地 PDF 触感阅读器
├── reader.css          # 阅读器连续流排版与折叠动效
├── reader.js           # 阅读器核心渲染、滚轮监听与页码记忆
├── notebook.html       # 全屏生词本工作台
├── notebook.css        # 生词本新拟态网格排版
├── notebook.js         # 生词本管理、音频发音与 Anki CSV 导出
├── libs/               # 离线 PDF.js 核心引擎库
└── icons/              # 新拟态应用图标资源
```

---

## 📄 开源许可证

MIT License © 2026 [havefunwcy](https://github.com/havefunwcy)
