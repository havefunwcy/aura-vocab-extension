/**
 * Aura Dict - Standalone Continuous Scroll PDF Reader
 * 连续垂直流式滚轮排版、顶栏平滑折叠、按需懒加载与智能页码划词归档
 */

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
}

document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('reader-header');
  const btnCollapseHeader = document.getElementById('btn-collapse-header');
  const btnExpandHeader = document.getElementById('btn-expand-header');
  const fileInput = document.getElementById('pdf-file-input');
  const dropZone = document.getElementById('drop-zone');
  const stage = document.getElementById('reader-stage');
  const pagesStream = document.getElementById('pdf-pages-stream');
  const docTitlePill = document.getElementById('doc-title-pill');
  const pageNumEl = document.getElementById('page-num');
  const pageCountEl = document.getElementById('page-count');
  const zoomTextEl = document.getElementById('zoom-text');
  const btnPrev = document.getElementById('btn-prev-page');
  const btnNext = document.getElementById('btn-next-page');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnOpenNotebook = document.getElementById('btn-open-notebook');

  let pdfDoc = null;
  let currentPage = 1;
  let scale = 1.3;
  let currentFileName = '本地 PDF 文档';
  let currentFileSize = 0;
  let currentFileKey = null;
  let saveTimer = null;
  let pageViewports = {}; // 缓存各页标准比例
  let renderedPages = new Set(); // 记录已渲染的页码
  let pageObserver = null;
  let scrollTicking = false;

  // 1. 顶栏折叠与展开功能
  btnCollapseHeader.addEventListener('click', () => {
    header.classList.add('collapsed');
    btnExpandHeader.style.display = 'flex';
  });

  btnExpandHeader.addEventListener('click', () => {
    header.classList.remove('collapsed');
    btnExpandHeader.style.display = 'none';
  });

  // 快捷键 H 键切换顶栏折叠
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'h' || e.key === 'H') {
      if (header.classList.contains('collapsed')) {
        header.classList.remove('collapsed');
        btnExpandHeader.style.display = 'none';
      } else {
        header.classList.add('collapsed');
        btnExpandHeader.style.display = 'flex';
      }
    }
  });

  // 2. 文件加载与拖拽事件
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

  btnOpenNotebook.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('notebook.html') });
  });

  // 3. 解析与构建连续垂直页面流（包含页码历史恢复）
  function loadPdfFile(file) {
    currentFileName = file.name;
    currentFileSize = file.size;
    currentFileKey = `pdf_${encodeURIComponent(file.name)}_${file.size}`;

    docTitlePill.textContent = currentFileName;
    docTitlePill.title = currentFileName;
    document.title = `${currentFileName} - Aura 触感阅读器`;

    const reader = new FileReader();
    reader.onload = async function () {
      const typedarray = new Uint8Array(this.result);
      try {
        pdfDoc = await pdfjsLib.getDocument({ data: typedarray }).promise;
        pageCountEl.textContent = pdfDoc.numPages;

        // 查询该 PDF 历史阅读记录
        let targetPage = 1;
        try {
          const { pdfHistory = {} } = await chrome.storage.local.get('pdfHistory');
          const record = pdfHistory[currentFileKey];
          if (record && record.page && record.page >= 1 && record.page <= pdfDoc.numPages) {
            targetPage = record.page;
          }
        } catch (e) {
          console.warn('获取阅读历史失败:', e);
        }

        currentPage = targetPage;
        dropZone.style.display = 'none';
        pagesStream.style.display = 'flex';
        await initContinuousStream(targetPage);
      } catch (err) {
        alert('解析 PDF 失败: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // 初始化连续垂直流式卡片容器（自动跳转至上次记忆页码）
  async function initContinuousStream(targetPage = 1) {
    pagesStream.innerHTML = '';
    renderedPages.clear();

    if (pageObserver) pageObserver.disconnect();

    // 先预取基准页的视口比例作为默认占位
    const samplePageNum = Math.min(Math.max(1, targetPage), pdfDoc.numPages);
    const samplePage = await pdfDoc.getPage(samplePageNum);
    const baseViewport = samplePage.getViewport({ scale });
    const defaultW = baseViewport.width;
    const defaultH = baseViewport.height;

    // 为全书每一页创建轻量占位卡片（立即确定完整滚条长度，支持鼠标滚轮自由滚动）
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const card = document.createElement('div');
      card.className = 'pdf-page-card';
      card.id = `page-card-${i}`;
      card.dataset.pageNum = i;
      card.style.width = `${defaultW}px`;
      card.style.height = `${defaultH}px`;

      card.innerHTML = `
        <canvas class="pdf-canvas"></canvas>
        <div class="textLayer"></div>
      `;

      pagesStream.appendChild(card);
    }

    // 设置视口观察器：进入视口时动态按需渲染（高性能懒加载）
    pageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const num = parseInt(entry.target.dataset.pageNum, 10);
          if (!renderedPages.has(num)) {
            renderSinglePage(num);
          }
        }
      });
    }, {
      root: stage,
      rootMargin: '500px 0px' // 上下 500px 预加载缓冲区
    });

    document.querySelectorAll('.pdf-page-card').forEach((el) => {
      pageObserver.observe(el);
    });

    // 智能恢复上次阅读位置并优先渲染目标页
    if (targetPage > 1 && targetPage <= pdfDoc.numPages) {
      await renderSinglePage(targetPage);
      if (targetPage > 1) renderSinglePage(targetPage - 1);
      if (targetPage < pdfDoc.numPages) renderSinglePage(targetPage + 1);

      requestAnimationFrame(() => {
        const targetCard = document.getElementById(`page-card-${targetPage}`);
        if (targetCard) {
          stage.style.scrollBehavior = 'auto';
          const targetOffset = targetCard.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop;
          stage.scrollTop = Math.max(0, targetOffset - 12);
          stage.style.scrollBehavior = '';
          currentPage = targetPage;
          pageNumEl.textContent = currentPage;
          showToast(`已自动跳转至上次阅读位置：第 ${targetPage} / ${pdfDoc.numPages} 页`);
        }
      });
    } else {
      await renderSinglePage(1);
      if (pdfDoc.numPages > 1) renderSinglePage(2);
      currentPage = 1;
      pageNumEl.textContent = 1;
    }
  }

  // 单页渲染方法
  async function renderSinglePage(num) {
    if (!pdfDoc || renderedPages.has(num)) return;
    renderedPages.add(num);

    const card = document.getElementById(`page-card-${num}`);
    if (!card) return;

    try {
      const page = await pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale });
      pageViewports[num] = viewport;

      const dpr = window.devicePixelRatio || 1;
      const cssWidth = Math.floor(viewport.width);
      const cssHeight = Math.floor(viewport.height);

      card.style.width = `${cssWidth}px`;
      card.style.height = `${cssHeight}px`;

      const canvas = card.querySelector('.pdf-canvas');
      const textLayerEl = card.querySelector('.textLayer');

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      const ctx = canvas.getContext('2d');
      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;

      await page.render({
        canvasContext: ctx,
        transform: transform,
        viewport: viewport
      }).promise;

      // 确保 PDF 动态注入的嵌入字体 (@font-face) 完全就绪，防止 measureText 测量失真
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      // 渲染标准 TextLayer 文本层
      textLayerEl.innerHTML = '';
      textLayerEl.style.setProperty('--scale-factor', viewport.scale);

      if (pdfjsLib.setLayerDimensions) {
        pdfjsLib.setLayerDimensions(textLayerEl, viewport);
      } else {
        textLayerEl.style.width = `${cssWidth}px`;
        textLayerEl.style.height = `${cssHeight}px`;
      }

      const textContent = await page.getTextContent();
      await pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayerEl,
        viewport: viewport
      }).promise;
    } catch (err) {
      console.warn(`渲染第 ${num} 页失败:`, err);
    }
  }

  // 4. 监听鼠标滚轮滚动，动态计算当前所在页码并联动顶栏
  stage.addEventListener('scroll', () => {
    if (!scrollTicking) {
      window.requestAnimationFrame(() => {
        updateCurrentPageOnScroll();
        scrollTicking = false;
      });
      scrollTicking = true;
    }
  });

  function updateCurrentPageOnScroll() {
    if (!pdfDoc) return;
    const stageRect = stage.getBoundingClientRect();
    const stageMidY = stageRect.top + stageRect.height / 3; // 视口上三分之一为当前读点

    const cards = document.querySelectorAll('.pdf-page-card');
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (rect.top <= stageMidY && rect.bottom >= stageMidY) {
        const num = parseInt(cards[i].dataset.pageNum, 10);
        if (num !== currentPage) {
          currentPage = num;
          pageNumEl.textContent = currentPage;
          saveProgressDebounced(currentPage);
        }
        break;
      }
    }
  }

  // 5. 翻页按钮：平滑滚动到指定卡片
  btnPrev.addEventListener('click', () => {
    if (currentPage > 1) {
      scrollToPage(currentPage - 1);
    }
  });

  btnNext.addEventListener('click', () => {
    if (pdfDoc && currentPage < pdfDoc.numPages) {
      scrollToPage(currentPage + 1);
    }
  });

  function scrollToPage(num) {
    const target = document.getElementById(`page-card-${num}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      currentPage = num;
      pageNumEl.textContent = currentPage;
      saveProgressDebounced(currentPage);
    }
  }

  // 页码点击快速跳转
  const pageMeter = document.querySelector('.page-meter');
  if (pageMeter) {
    pageMeter.title = '点击跳转至指定页码';
    pageMeter.addEventListener('click', () => {
      if (!pdfDoc) return;
      const input = prompt(`请输入要跳转的页码 (1 - ${pdfDoc.numPages}):`, currentPage);
      if (input !== null) {
        const p = parseInt(input.trim(), 10);
        if (!isNaN(p) && p >= 1 && p <= pdfDoc.numPages) {
          scrollToPage(p);
          saveProgressImmediate(p);
        }
      }
    });
  }

  // 6. 缩放控制（重新调整所有卡片占位并重绘可见区）
  btnZoomIn.addEventListener('click', () => {
    if (!pdfDoc || scale >= 2.8) return;
    scale = Math.min(2.8, scale + 0.2);
    applyZoom();
  });

  btnZoomOut.addEventListener('click', () => {
    if (!pdfDoc || scale <= 0.8) return;
    scale = Math.max(0.8, scale - 0.2);
    applyZoom();
  });

  async function applyZoom() {
    zoomTextEl.textContent = `${Math.round(scale * 100 / 1.3)}%`;
    renderedPages.clear();

    const firstPage = await pdfDoc.getPage(1);
    const baseViewport = firstPage.getViewport({ scale });

    const w = Math.floor(baseViewport.width);
    const h = Math.floor(baseViewport.height);

    document.querySelectorAll('.pdf-page-card').forEach((card) => {
      card.style.width = `${w}px`;
      card.style.height = `${h}px`;
      const canvas = card.querySelector('.pdf-canvas');
      const textLayer = card.querySelector('.textLayer');
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      if (textLayer) { textLayer.innerHTML = ''; }
    });

    // 重新渲染当前页及附近页
    await renderSinglePage(currentPage);
    if (currentPage > 1) renderSinglePage(currentPage - 1);
    if (currentPage < pdfDoc.numPages) renderSinglePage(currentPage + 1);
  }

  // 7. 新拟态实体浮窗：划词查词与智能页码收录
  let popupBox = null;
  let currentWordData = null;
  let currentSelectionContext = '';
  let activePageNum = 1;

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

  // 监听全页流的划词事件
  pagesStream.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const rawText = selection.toString().trim();
    if (!rawText) return;

    const cleanText = rawText.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
    if (!cleanText || cleanText.length > 80) return;

    // 自动判断选区所在的是哪一页
    const anchor = selection.anchorNode;
    const cardEl = anchor ? (anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement).closest('.pdf-page-card') : null;
    activePageNum = cardEl ? parseInt(cardEl.dataset.pageNum, 10) : currentPage;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    currentSelectionContext = extractContext(selection);
    showLookup(cleanText, rect, activePageNum);
  });

  document.addEventListener('mousedown', (e) => {
    if (popupBox && !popupBox.contains(e.target)) {
      hidePopup();
    }
  });

  function extractContext(selection) {
    try {
      const node = selection.anchorNode;
      const text = node ? node.textContent : '';
      return text.length < 220 ? text.trim() : '';
    } catch {
      return '';
    }
  }

  async function showLookup(word, rect, pageNum) {
    const box = ensurePopup();
    box.innerHTML = `
      <div style="font-size: 11px; font-weight:600; color:#7d8b9e; margin-bottom: 6px;">AURA • 正在查询 PDF 单词...</div>
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

      box.querySelector('#pdf-btn-audio').onclick = () => {
        new Audio(currentWordData.audioUrl).play();
      };

      box.querySelector('#pdf-btn-star').onclick = async () => {
        const starBtn = box.querySelector('#pdf-btn-star');
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

      box.querySelector('#pdf-btn-close').onclick = hidePopup;
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
    const { vocabBook = {} } = await chrome.storage.local.get('vocabBook');
    return !!vocabBook[word.toLowerCase().trim()];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 8. 阅读进度持久化存储与通知系统
  function saveProgressDebounced(page) {
    if (!currentFileKey || !pdfDoc || !page) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveProgressImmediate(page);
    }, 350);
  }

  async function saveProgressImmediate(page) {
    if (!currentFileKey || !pdfDoc || !page) return;
    try {
      const { pdfHistory = {} } = await chrome.storage.local.get('pdfHistory');
      pdfHistory[currentFileKey] = {
        fileName: currentFileName,
        fileSize: currentFileSize,
        page: page,
        totalPages: pdfDoc.numPages,
        lastReadTime: Date.now()
      };
      await chrome.storage.local.set({ pdfHistory });
    } catch (err) {
      console.warn('保存阅读进度失败:', err);
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

  // 离开页面或切换后台时立即归档进度
  window.addEventListener('beforeunload', () => {
    if (pdfDoc && currentPage) saveProgressImmediate(currentPage);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && pdfDoc && currentPage) {
      saveProgressImmediate(currentPage);
    }
  });
});
