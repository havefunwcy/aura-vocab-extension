/**
 * Aura Dict - PDF Reflow Immersive Reader (方案二：重排版沉浸流模式)
 * 100% 网页原生语义文本，彻底根除 Canvas 与文本层错位问题
 * 支持羊皮纸护眼主题、字号自由调节、章节目录大纲、原生极速划词查词与页码记忆
 */

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
}

document.addEventListener('DOMContentLoaded', () => {
  // 1. 元素抓取
  const header = document.getElementById('reader-header');
  const btnCollapseHeader = document.getElementById('btn-collapse-header');
  const btnExpandHeader = document.getElementById('btn-expand-header');
  const fileInput = document.getElementById('pdf-file-input');
  const dropZone = document.getElementById('drop-zone');
  const stage = document.getElementById('reader-stage');
  const docTitlePill = document.getElementById('doc-title-pill');
  const pageMeter = document.getElementById('page-meter');
  const pageNumEl = document.getElementById('page-num');
  const pageCountEl = document.getElementById('page-count');
  const btnPrev = document.getElementById('btn-prev-page');
  const btnNext = document.getElementById('btn-next-page');
  const btnToggleToc = document.getElementById('btn-toggle-toc');
  const tocDrawer = document.getElementById('toc-drawer');
  const tocList = document.getElementById('toc-list');
  const btnCloseToc = document.getElementById('btn-close-toc');
  const tocBackdrop = document.getElementById('toc-backdrop');
  const btnTypography = document.getElementById('btn-typography');
  const typographyPopover = document.getElementById('typography-popover');
  const btnOpenNotebook = document.getElementById('btn-open-notebook');
  const modeSwitcher = document.getElementById('mode-switcher');
  const tabReflow = document.getElementById('tab-reflow');
  const tabOriginal = document.getElementById('tab-original');
  const reflowContainer = document.getElementById('reflow-container');
  const reflowArticle = document.getElementById('reflow-article');
  const reflowSentinel = document.getElementById('reflow-sentinel');
  const originalViewerContainer = document.getElementById('original-viewer-container');
  const originalPagesStream = document.getElementById('original-pages-stream');

  // 排版调控元素
  const fontSizeVal = document.getElementById('font-size-val');
  const btnFontDec = document.getElementById('btn-font-dec');
  const btnFontInc = document.getElementById('btn-font-inc');
  const btnFontSerif = document.getElementById('btn-font-serif');
  const btnFontSans = document.getElementById('btn-font-sans');

  // 2. 状态管理
  let pdfDoc = null;
  let currentFileName = '本地 PDF 文档';
  let currentFileSize = 0;
  let currentFileKey = null;
  let totalPages = 0;
  let currentPage = 1;
  let currentLoadedMaxPage = 0;
  let isRenderingBatch = false;
  let activeMode = 'reflow'; // 'reflow' 或 'original'
  let outlineItems = [];
  let saveTimer = null;

  // 排版用户偏好
  let userFontSize = parseInt(localStorage.getItem('aura_reflow_font_size') || '18', 10);
  let userTheme = localStorage.getItem('aura_reflow_theme') || 'theme-warm';
  let userFamily = localStorage.getItem('aura_reflow_family') || 'serif';
  let userWidth = localStorage.getItem('aura_reflow_width') || '840px';

  applyTypographySettings();

  // 3. 排版偏好设置应用
  function applyTypographySettings() {
    document.body.className = `reader-app ${userTheme}`;
    document.documentElement.style.setProperty('--reflow-font-size', `${userFontSize}px`);
    document.documentElement.style.setProperty('--reflow-max-width', userWidth);

    if (userFamily === 'serif') {
      document.documentElement.style.setProperty('--reflow-font-family', '"Georgia", "Merriweather", "Songti SC", "SimSun", serif');
      btnFontSerif.classList.add('active');
      btnFontSans.classList.remove('active');
    } else {
      document.documentElement.style.setProperty('--reflow-font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif');
      btnFontSans.classList.add('active');
      btnFontSerif.classList.remove('active');
    }

    fontSizeVal.textContent = `${userFontSize}px`;

    // 高亮对应的主题选择器
    document.querySelectorAll('.theme-dot').forEach(dot => {
      dot.classList.toggle('active', dot.dataset.theme === userTheme);
    });

    document.querySelectorAll('.width-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.width === userWidth);
    });
  }

  // 监听排版交互
  btnTypography.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShowing = typographyPopover.style.display === 'flex';
    typographyPopover.style.display = isShowing ? 'none' : 'flex';
  });

  document.addEventListener('click', (e) => {
    if (typographyPopover && !typographyPopover.contains(e.target) && e.target !== btnTypography) {
      typographyPopover.style.display = 'none';
    }
  });

  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      userTheme = dot.dataset.theme;
      localStorage.setItem('aura_reflow_theme', userTheme);
      applyTypographySettings();
    });
  });

  btnFontDec.addEventListener('click', () => {
    if (userFontSize > 13) {
      userFontSize -= 1;
      localStorage.setItem('aura_reflow_font_size', userFontSize);
      applyTypographySettings();
    }
  });

  btnFontInc.addEventListener('click', () => {
    if (userFontSize < 28) {
      userFontSize += 1;
      localStorage.setItem('aura_reflow_font_size', userFontSize);
      applyTypographySettings();
    }
  });

  btnFontSerif.addEventListener('click', () => {
    userFamily = 'serif';
    localStorage.setItem('aura_reflow_family', userFamily);
    applyTypographySettings();
  });

  btnFontSans.addEventListener('click', () => {
    userFamily = 'sans';
    localStorage.setItem('aura_reflow_family', userFamily);
    applyTypographySettings();
  });

  document.querySelectorAll('.width-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      userWidth = tab.dataset.width;
      localStorage.setItem('aura_reflow_width', userWidth);
      applyTypographySettings();
    });
  });

  // 4. 顶栏折叠与展开 (快捷键 H)
  function toggleHeader(collapse) {
    if (collapse) {
      header.classList.add('collapsed');
      btnExpandHeader.style.display = 'flex';
    } else {
      header.classList.remove('collapsed');
      btnExpandHeader.style.display = 'none';
    }
  }

  btnCollapseHeader.addEventListener('click', () => toggleHeader(true));
  btnExpandHeader.addEventListener('click', () => toggleHeader(false));

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'h' || e.key === 'H') {
      toggleHeader(!header.classList.contains('collapsed'));
    }
  });

  // 5. 目录大纲抽屉开关
  btnToggleToc.addEventListener('click', () => {
    tocDrawer.classList.add('open');
    tocBackdrop.classList.add('visible');
  });

  function closeToc() {
    tocDrawer.classList.remove('open');
    tocBackdrop.classList.remove('visible');
  }

  btnCloseToc.addEventListener('click', closeToc);
  tocBackdrop.addEventListener('click', closeToc);

  btnOpenNotebook.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('notebook.html') });
  });

  // 6. 文件加载与拖拽事件
  fileInput.addEventListener('click', () => {
    fileInput.value = '';
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadPdfFile(file);
  });

  stage.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
      loadPdfFile(files[0]);
    }
  });

  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  // 7. 解析与构建语义化沉浸重排流
  function loadPdfFile(file) {
    currentFileName = file.name;
    currentFileSize = file.size;
    currentFileKey = `pdf_${encodeURIComponent(file.name)}_${file.size}`;

    docTitlePill.textContent = currentFileName;
    docTitlePill.title = currentFileName;
    document.title = `${currentFileName} - Aura 沉浸阅读`;

    const reader = new FileReader();
    reader.onload = async function () {
      const typedarray = new Uint8Array(this.result);
      try {
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        pdfDoc = await loadingTask.promise;
        totalPages = pdfDoc.numPages;
        pageCountEl.textContent = totalPages;

        dropZone.style.display = 'none';
        btnToggleToc.style.display = 'flex';
        modeSwitcher.style.display = 'flex';

        // 查询该 PDF 历史阅读记录
        let targetPage = 1;
        try {
          const { pdfHistory = {} } = await chrome.storage.local.get('pdfHistory');
          const record = pdfHistory[currentFileKey];
          if (record && record.page && record.page >= 1 && record.page <= totalPages) {
            targetPage = record.page;
          }
        } catch (e) {
          console.warn('获取阅读历史失败:', e);
        }

        currentPage = targetPage;
        pageNumEl.textContent = currentPage;

        // 提取章节目录大纲
        await loadDocumentOutline();

        // 渲染重排流
        reflowContainer.style.display = 'flex';
        reflowArticle.innerHTML = '';
        currentLoadedMaxPage = 0;

        // 先渲染目标页及其附近章节 (秒级启动)
        await renderReflowBatch(Math.max(1, targetPage - 1), Math.min(totalPages, targetPage + 8));

        // 自动平滑滚动至上次记忆的页面
        if (targetPage > 1) {
          requestAnimationFrame(() => {
            const marker = document.getElementById(`reflow-marker-${targetPage}`);
            if (marker) {
              marker.scrollIntoView({ behavior: 'smooth', block: 'start' });
              showToast(`已自动跳转至上次阅读位置：第 ${targetPage} / ${totalPages} 页`);
            }
          });
        }
      } catch (err) {
        alert('解析 PDF 失败: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // 加载文档大纲
  async function loadDocumentOutline() {
    tocList.innerHTML = '';
    try {
      const outline = await pdfDoc.getOutline();
      if (outline && outline.length > 0) {
        outlineItems = outline;
        for (const item of outline) {
          const div = document.createElement('div');
          div.className = 'toc-item';
          
          let targetPageNum = 1;
          if (item.dest) {
            try {
              const destObj = typeof item.dest === 'string' ? await pdfDoc.getDestination(item.dest) : item.dest;
              if (destObj && destObj[0]) {
                targetPageNum = (await pdfDoc.getPageIndex(destObj[0])) + 1;
              }
            } catch (e) {}
          }

          div.innerHTML = `
            <span>${escapeHtml(item.title)}</span>
            <span class="toc-item-page">P.${targetPageNum}</span>
          `;

          div.onclick = async () => {
            closeToc();
            await jumpToPage(targetPageNum);
          };

          tocList.appendChild(div);
        }
      } else {
        tocList.innerHTML = '<div style="padding:16px; font-size:12px; color:#798799; text-align:center;">此文档未包含书签大纲</div>';
      }
    } catch (e) {
      console.warn('解析目录失败:', e);
    }
  }

  // 批量流式解析并注入页面至文章
  async function renderReflowBatch(startPage, endPage) {
    if (isRenderingBatch || !pdfDoc) return;
    isRenderingBatch = true;
    reflowSentinel.style.display = 'flex';

    for (let p = startPage; p <= endPage; p++) {
      if (document.getElementById(`reflow-page-${p}`)) continue;

      try {
        const page = await pdfDoc.getPage(p);
        const textContent = await page.getTextContent();
        const pageHtml = parsePageToSemanticHtml(textContent.items, p);

        const pageWrapper = document.createElement('div');
        pageWrapper.id = `reflow-page-${p}`;
        pageWrapper.className = 'reflow-page-section';
        pageWrapper.dataset.pageNum = p;
        pageWrapper.innerHTML = pageHtml;

        reflowArticle.appendChild(pageWrapper);
        currentLoadedMaxPage = Math.max(currentLoadedMaxPage, p);
      } catch (err) {
        console.warn(`解析第 ${p} 页失败:`, err);
      }
    }

    isRenderingBatch = false;
    if (currentLoadedMaxPage >= totalPages) {
      reflowSentinel.style.display = 'none';
    }
  }

  // 8. 核心重排算法：将 PDF 离散坐标字符流聚合为纯正语义段落
  function parsePageToSemanticHtml(items, pageNum) {
    if (!items || items.length === 0) {
      return `<div class="reflow-page-empty"><p style="text-align:center; color:var(--book-subtext); font-style:italic; font-size:0.9em; margin: 2em 0;">[第 ${pageNum} 页为图片或无文字版面]</p></div>`;
    }

    // 1. 将散落的 item 按 Y 坐标聚合成物理行 (3px 容差)
    const linesMap = new Map();
    for (const item of items) {
      if (!item.str && !item.hasEOL) continue;
      const y = Math.round(item.transform[5]);
      let foundKey = null;
      for (const k of linesMap.keys()) {
        if (Math.abs(k - y) <= 3) {
          foundKey = k;
          break;
        }
      }
      const key = foundKey !== null ? foundKey : y;
      if (!linesMap.has(key)) linesMap.set(key, []);
      linesMap.get(key).push(item);
    }

    const sortedYKeys = [...linesMap.keys()].sort((a, b) => b - a);
    if (sortedYKeys.length === 0) return '';

    // 2. 检测该页的正文基准左边距 (Base Left Margin)
    const lefts = [];
    const lineDetails = [];

    for (const y of sortedYKeys) {
      const rawItems = linesMap.get(y).sort((a, b) => a.transform[4] - b.transform[4]);
      let lineStr = '';
      let maxFontSize = 0;

      for (let j = 0; j < rawItems.length; j++) {
        const it = rawItems[j];
        const fs = Math.round(Math.hypot(it.transform[0], it.transform[1]));
        if (fs > maxFontSize) maxFontSize = fs;

        if (j > 0) {
          const prevIt = rawItems[j - 1];
          const prevRight = prevIt.transform[4] + (prevIt.width || 0);
          const currLeft = it.transform[4];
          if (currLeft - prevRight > 2 && !it.str.startsWith(' ') && !lineStr.endsWith(' ')) {
            lineStr += ' ';
          }
        }
        lineStr += it.str;
      }

      lineStr = lineStr.trim();
      if (!lineStr) continue;

      const minX = Math.round(rawItems[0].transform[4]);
      if (lineStr.length > 18) lefts.push(minX);

      lineDetails.push({ y, minX, text: lineStr, fontSize: maxFontSize });
    }

    if (lineDetails.length === 0) return '';

    // 取多数行作为正文基准左对齐
    const baseLeft = lefts.length > 0 ? Math.min(...lefts) : 72;

    // 3. 将物理行重构为语义段落与标题
    const paragraphs = [];
    let curPara = '';
    let prevY = null;

    for (let i = 0; i < lineDetails.length; i++) {
      const line = lineDetails[i];
      const isHeading = line.fontSize >= 21 || /^Chapter \d+/i.test(line.text) || /^第[一二三四五六七八九十百千0-9]+[章回卷]/i.test(line.text);

      if (isHeading) {
        if (curPara) {
          paragraphs.push({ type: 'p', text: curPara.trim() });
          curPara = '';
        }
        paragraphs.push({ type: 'h2', text: line.text });
        prevY = line.y;
        continue;
      }

      // 缩进判断 (首行缩进通常大于等于基准左距 + 10px)
      const isIndented = line.minX >= baseLeft + 10;
      const isLargeGap = prevY !== null && Math.abs(prevY - line.y) > 26;
      const isNewPara = (isIndented || isLargeGap) && curPara.length > 0;

      if (isNewPara) {
        paragraphs.push({ type: 'p', text: curPara.trim() });
        curPara = line.text;
      } else {
        if (!curPara) {
          curPara = line.text;
        } else {
          // 连字符折行自动合并 (如 in- + creased -> increased)
          if (curPara.endsWith('-') && !curPara.endsWith(' -')) {
            curPara = curPara.slice(0, -1) + line.text;
          } else {
            curPara += ' ' + line.text;
          }
        }
      }
      prevY = line.y;
    }

    if (curPara) {
      paragraphs.push({ type: 'p', text: curPara.trim() });
    }

    // 4. 生成该页的标准 HTML 片段
    let html = `<div class="page-marker" id="reflow-marker-${pageNum}" data-page="${pageNum}"><span class="marker-pill">P. ${pageNum}</span></div>`;

    paragraphs.forEach(p => {
      if (p.type === 'h2') {
        html += `<h2 class="reflow-heading">${escapeHtml(p.text)}</h2>`;
      } else {
        html += `<p class="reflow-paragraph">${escapeHtml(p.text)}</p>`;
      }
    });

    return html;
  }

  // 9. 智能滚动监听与当前阅读页码感知
  stage.addEventListener('scroll', () => {
    // 1. 无限滚动触底加载下一批章节
    if (activeMode === 'reflow' && pdfDoc && currentLoadedMaxPage < totalPages) {
      const scrollBottom = stage.scrollHeight - stage.scrollTop - stage.clientHeight;
      if (scrollBottom < 600) {
        renderReflowBatch(currentLoadedMaxPage + 1, Math.min(totalPages, currentLoadedMaxPage + 6));
      }
    }

    // 2. 动态感知当前视口正在读第几页
    updateCurrentPageOnScroll();
  });

  let scrollTicking = false;
  function updateCurrentPageOnScroll() {
    if (scrollTicking || !pdfDoc) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      const markers = document.querySelectorAll('.page-marker');
      const stageRect = stage.getBoundingClientRect();
      const readingLineY = stageRect.top + 100;

      let detectedPage = currentPage;
      for (let i = 0; i < markers.length; i++) {
        const rect = markers[i].getBoundingClientRect();
        if (rect.top <= readingLineY) {
          detectedPage = parseInt(markers[i].dataset.page, 10);
        } else {
          break;
        }
      }

      if (detectedPage !== currentPage) {
        currentPage = detectedPage;
        pageNumEl.textContent = currentPage;
        saveProgressDebounced(currentPage);
      }
      scrollTicking = false;
    });
  }

  // 10. 跳转至指定页码
  async function jumpToPage(target) {
    if (!pdfDoc || target < 1 || target > totalPages) return;

    if (target > currentLoadedMaxPage) {
      await renderReflowBatch(currentLoadedMaxPage + 1, Math.min(totalPages, target + 4));
    }

    requestAnimationFrame(() => {
      const targetMarker = document.getElementById(`reflow-marker-${target}`);
      if (targetMarker) {
        targetMarker.scrollIntoView({ behavior: 'smooth', block: 'start' });
        currentPage = target;
        pageNumEl.textContent = currentPage;
        saveProgressImmediate(currentPage);
      }
    });
  }

  // 翻页与页码点击
  btnPrev.addEventListener('click', () => {
    if (currentPage > 1) jumpToPage(currentPage - 1);
  });

  btnNext.addEventListener('click', () => {
    if (currentPage < totalPages) jumpToPage(currentPage + 1);
  });

  pageMeter.addEventListener('click', () => {
    if (!pdfDoc) return;
    const input = prompt(`请输入要跳转的页码 (1 - ${totalPages}):`, currentPage);
    if (input !== null) {
      const p = parseInt(input.trim(), 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) {
        jumpToPage(p);
      }
    }
  });

  // 11. 双模式切换 (沉浸重排流 / 原版视图)
  tabReflow.addEventListener('click', () => {
    if (activeMode === 'reflow') return;
    activeMode = 'reflow';
    tabReflow.classList.add('active');
    tabOriginal.classList.remove('active');
    originalViewerContainer.style.display = 'none';
    reflowContainer.style.display = 'flex';
    jumpToPage(currentPage);
  });

  tabOriginal.addEventListener('click', () => {
    if (activeMode === 'original') return;
    activeMode = 'original';
    tabOriginal.classList.add('active');
    tabReflow.classList.remove('active');
    reflowContainer.style.display = 'none';
    originalViewerContainer.style.display = 'flex';
    renderOriginalCurrentPage(currentPage);
  });

  async function renderOriginalCurrentPage(pageNum) {
    originalPagesStream.innerHTML = '';
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });

    const card = document.createElement('div');
    card.className = 'original-page-card';
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');

    card.appendChild(canvas);
    originalPagesStream.appendChild(card);

    await page.render({ canvasContext: ctx, viewport }).promise;
  }

  // 12. 100% 原生划词感知与有道词典新拟态浮窗
  let popupBox = null;
  let currentWordData = null;
  let currentSelectionContext = '';

  function ensurePopup() {
    if (popupBox) return popupBox;
    popupBox = document.createElement('div');
    popupBox.id = 'aura-pdf-floating-panel';
    popupBox.style.cssText = `
      position: fixed;
      z-index: 999999;
      width: 310px;
      background: #e9edf2;
      color: #2e3846;
      border-radius: 16px;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 8px 8px 20px rgba(166, 175, 189, 0.45), -8px -8px 20px rgba(255, 255, 255, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.5);
      display: none;
      user-select: none;
    `;
    document.body.appendChild(popupBox);
    return popupBox;
  }

  function hidePopup() {
    if (popupBox) popupBox.style.display = 'none';
  }

  // 监听划词事件（原生 HTML，无任何 Canvas 文本层错位）
  document.addEventListener('mouseup', (e) => {
    if (popupBox && popupBox.contains(e.target)) return;

    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

      const raw = selection.toString().trim();
      if (!raw) return;

      // 清洗首尾标点符号
      const cleanWord = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
      if (!cleanWord || cleanWord.length > 80) return;

      const range = selection.getRangeAt(0);
      let rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        rect = { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 1, height: 1 };
      }

      currentSelectionContext = extractContextSentence(selection);
      showLookup(cleanWord, rect, currentPage);
    }, 10);
  });

  document.addEventListener('mousedown', (e) => {
    if (popupBox && !popupBox.contains(e.target)) {
      hidePopup();
    }
  });

  // 提取当前完整上下文原句
  function extractContextSentence(selection) {
    try {
      const node = selection.anchorNode;
      if (!node) return '';
      const text = node.textContent || '';
      const offset = selection.anchorOffset;

      const startMatch = text.slice(0, offset).search(/([.?!;。！？；]\s*)([^.?!;。！？；]*)$/);
      const startIdx = startMatch !== -1 ? startMatch + RegExp.$1.length : 0;
      const endMatch = text.slice(offset).search(/[.?!;。！？；]/);
      const endIdx = endMatch !== -1 ? offset + endMatch + 1 : text.length;

      const s = text.slice(startIdx, endIdx).trim();
      return s.length < 240 ? s : '';
    } catch {
      return '';
    }
  }

  // 弹窗展示有道词典
  async function showLookup(word, rect, pageNum) {
    const box = ensurePopup();
    box.innerHTML = `
      <div style="font-size: 11px; font-weight:600; color:#7d8b9e; margin-bottom: 6px;">AURA • 正在查询生词...</div>
      <div style="font-size: 13px; color: #4a5568;">${escapeHtml(word)}</div>
    `;

    positionPanel(box, rect);
    box.style.display = 'block';

    chrome.runtime.sendMessage({ action: 'FETCH_YOUDAO', word }, async (res) => {
      if (!res || !res.success || !res.data) {
        box.innerHTML = `<div style="font-size: 12px; color: #bf6060;">未收录该单词释义</div>`;
        return;
      }

      currentWordData = res.data;
      const isStarred = await checkStarred(currentWordData.word);

      box.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="font-size:11px; font-weight:700; color:#7d8b9e; letter-spacing:0.5px;">AURA • 有道词典 (第 ${pageNum} 页)</div>
          <div style="display:flex; gap:6px;">
            <button id="pdf-btn-audio" class="tactile-circle-btn" title="播放发音">🔊</button>
            <button id="pdf-btn-star" class="tactile-circle-btn" style="color:${isStarred ? '#d97736' : '#7d8b9e'}" title="加入生词本">${isStarred ? '★' : '☆'}</button>
            <button id="pdf-btn-close" class="tactile-circle-btn" title="关闭">×</button>
          </div>
        </div>

        <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:8px;">
          <span style="font-size:16px; font-weight:700; color:#252e3b;">${escapeHtml(currentWordData.word)}</span>
          ${currentWordData.phonetic ? `<span style="font-size:12px; color:#7d8b9e;">[${escapeHtml(currentWordData.phonetic)}]</span>` : ''}
        </div>

        <div style="background:#e9edf2; border-radius:10px; padding:8px 10px; box-shadow:inset 2px 2px 4px rgba(166,175,189,0.38), inset -2px -2px 4px rgba(255,255,255,0.9); max-height:130px; overflow-y:auto; margin-bottom:8px;">
          <ul style="list-style:none; padding:0; margin:0; font-size:12px; color:#3b4655; line-height:1.5;">
            ${currentWordData.explains.map((item) => `<li style="padding:2px 0;">• ${escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>

        <div style="display:flex; justify-content:space-between; font-size:10px; color:#9caab9;">
          <span>来源: ${escapeHtml(currentFileName)} [P.${pageNum}]</span>
          <span>${isStarred ? '● 已收录' : '○ 点击星标入库'}</span>
        </div>
      `;

      const audioBtn = box.querySelector('#pdf-btn-audio');
      if (audioBtn) {
        audioBtn.onclick = () => {
          if (currentWordData.audioUrl) new Audio(currentWordData.audioUrl).play();
        };
      }

      const starBtn = box.querySelector('#pdf-btn-star');
      if (starBtn) {
        starBtn.onclick = async () => {
          const key = currentWordData.word.toLowerCase().trim();
          const { vocabBook = {} } = await chrome.storage.local.get('vocabBook');

          if (vocabBook[key]) {
            delete vocabBook[key];
            starBtn.textContent = '☆';
            starBtn.style.color = '#7d8b9e';
          } else {
            vocabBook[key] = {
              word: currentWordData.word,
              phonetic: currentWordData.phonetic || '',
              explains: currentWordData.explains || [],
              audioUrl: currentWordData.audioUrl || '',
              contextSentence: currentSelectionContext || '',
              sourceUrl: `PDF: ${currentFileName} (第 ${pageNum} 页)`,
              sourceTitle: `${currentFileName} [第 ${pageNum} 页]`,
              addTime: Date.now()
            };
            starBtn.textContent = '★';
            starBtn.style.color = '#d97736';
          }
          await chrome.storage.local.set({ vocabBook });
        };
      }

      const closeBtn = box.querySelector('#pdf-btn-close');
      if (closeBtn) closeBtn.onclick = hidePopup;
    });
  }

  function positionPanel(box, rect) {
    const margin = 10;
    const w = 310;
    let left = rect.left + rect.width / 2 - w / 2;
    if (left < margin) left = margin;
    if (left + w > window.innerWidth - margin) left = window.innerWidth - w - margin;

    let top = rect.bottom + 8;
    if (top + 180 > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - 188);
    }
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  }

  async function checkStarred(word) {
    try {
      const { vocabBook = {} } = await chrome.storage.local.get('vocabBook');
      return !!vocabBook[word.toLowerCase().trim()];
    } catch {
      return false;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 13. 进度持久化存储
  function saveProgressDebounced(page) {
    if (!currentFileKey || !pdfDoc || !page) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveProgressImmediate(page);
    }, 400);
  }

  async function saveProgressImmediate(page) {
    if (!currentFileKey || !pdfDoc || !page) return;
    try {
      const { pdfHistory = {} } = await chrome.storage.local.get('pdfHistory');
      pdfHistory[currentFileKey] = {
        fileName: currentFileName,
        fileSize: currentFileSize,
        page: page,
        totalPages: totalPages,
        lastReadTime: Date.now()
      };
      await chrome.storage.local.set({ pdfHistory });
    } catch (err) {
      console.warn('保存进度失败:', err);
    }
  }

  let toastTimer = null;
  function showToast(msg) {
    let toast = document.getElementById('reader-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'reader-toast';
      toast.className = 'reader-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span class="reader-toast-icon">🔖</span><span>${escapeHtml(msg)}</span>`;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2800);
  }

  window.addEventListener('beforeunload', () => {
    if (pdfDoc && currentPage) saveProgressImmediate(currentPage);
  });
});
