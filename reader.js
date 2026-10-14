/**
 * Aura Dict - Standalone Continuous Scroll PDF Reader
 * Mozilla 官方标准 PDFViewer 架构：零错位严丝合缝划词、连续滚轮排版、顶栏平滑折叠与历史页码记忆
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
  const viewerContainer = document.getElementById('viewerContainer');
  const viewerEl = document.getElementById('viewer');
  const docTitlePill = document.getElementById('doc-title-pill');
  const pageMeter = document.getElementById('page-meter');
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
  let targetSavedPage = 1;
  let currentFileName = '本地 PDF 文档';
  let currentFileSize = 0;
  let currentFileKey = null;
  let saveTimer = null;

  // 1. 初始化 Mozilla PDF.js 官方标准 PDFViewer 架构
  const eventBus = new pdfjsViewer.EventBus();
  const linkService = new pdfjsViewer.PDFLinkService({
    eventBus: eventBus,
  });

  const pdfViewer = new pdfjsViewer.PDFViewer({
    container: viewerContainer,
    viewer: viewerEl,
    eventBus: eventBus,
    linkService: linkService,
    l10n: pdfjsViewer.NullL10n,
    removePageBorders: true,
    textLayerMode: 1, // ENABLE
    annotationMode: 0, // DISABLE (纯净阅读，杜绝干扰图层拦截鼠标)
    annotationEditorMode: 0, // DISABLE
  });
  linkService.setViewer(pdfViewer);

  // 2. 监听官方 EventBus 事件流
  eventBus.on('pagesinit', () => {
    // 设置舒适阅读默认缩放比例 (130%)
    pdfViewer.currentScale = 1.3;
    updateZoomDisplay(pdfViewer.currentScale);

    // 智能恢复上次阅读位置
    if (targetSavedPage > 1 && targetSavedPage <= pdfDoc.numPages) {
      pdfViewer.currentPageNumber = targetSavedPage;
      currentPage = targetSavedPage;
      pageNumEl.textContent = currentPage;
      showToast(`已自动跳转至上次阅读位置：第 ${targetSavedPage} / ${pdfDoc.numPages} 页`);
    } else {
      currentPage = 1;
      pageNumEl.textContent = 1;
    }
  });

  eventBus.on('pagechanging', (evt) => {
    const pageNum = evt.pageNumber;
    if (pageNum && pageNum !== currentPage) {
      currentPage = pageNum;
      pageNumEl.textContent = currentPage;
      saveProgressDebounced(currentPage);
    }
  });

  eventBus.on('scalechanging', (evt) => {
    if (evt && typeof evt.scale === 'number') {
      updateZoomDisplay(evt.scale);
    }
  });

  // 3. 顶栏折叠与展开功能 (支持 H 快捷键)
  function setHeaderCollapsed(collapsed) {
    if (collapsed) {
      header.classList.add('collapsed');
      viewerContainer.classList.add('header-collapsed');
      btnExpandHeader.style.display = 'flex';
    } else {
      header.classList.remove('collapsed');
      viewerContainer.classList.remove('header-collapsed');
      btnExpandHeader.style.display = 'none';
    }
  }

  btnCollapseHeader.addEventListener('click', () => setHeaderCollapsed(true));
  btnExpandHeader.addEventListener('click', () => setHeaderCollapsed(false));

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'h' || e.key === 'H') {
      setHeaderCollapsed(!header.classList.contains('collapsed'));
    }
  });

  // 4. 翻页与缩放控制
  function updateZoomDisplay(val) {
    zoomTextEl.textContent = `${Math.round(val * 100)}%`;
  }

  btnZoomIn.addEventListener('click', () => {
    if (!pdfDoc) return;
    const current = pdfViewer.currentScale || 1.3;
    const next = Math.min(3.0, current + 0.15);
    pdfViewer.currentScale = Math.round(next * 100) / 100;
  });

  btnZoomOut.addEventListener('click', () => {
    if (!pdfDoc) return;
    const current = pdfViewer.currentScale || 1.3;
    const next = Math.max(0.5, current - 0.15);
    pdfViewer.currentScale = Math.round(next * 100) / 100;
  });

  btnPrev.addEventListener('click', () => {
    if (!pdfDoc || pdfViewer.currentPageNumber <= 1) return;
    pdfViewer.previousPage();
  });

  btnNext.addEventListener('click', () => {
    if (!pdfDoc || pdfViewer.currentPageNumber >= pdfDoc.numPages) return;
    pdfViewer.nextPage();
  });

  // 页码点击快速跳转
  if (pageMeter) {
    pageMeter.addEventListener('click', () => {
      if (!pdfDoc) return;
      const input = prompt(`请输入要跳转的页码 (1 - ${pdfDoc.numPages}):`, pdfViewer.currentPageNumber);
      if (input !== null) {
        const p = parseInt(input.trim(), 10);
        if (!isNaN(p) && p >= 1 && p <= pdfDoc.numPages) {
          pdfViewer.currentPageNumber = p;
          saveProgressImmediate(p);
        }
      }
    });
  }

  // 快捷键支持
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (!pdfDoc) return;

    if (e.key === 'PageUp' || e.key === 'ArrowLeft') {
      if (pdfViewer.currentPageNumber > 1) pdfViewer.previousPage();
    } else if (e.key === 'PageDown' || e.key === 'ArrowRight') {
      if (pdfViewer.currentPageNumber < pdfDoc.numPages) pdfViewer.nextPage();
    } else if (e.key === '+' || e.key === '=') {
      const next = Math.min(3.0, (pdfViewer.currentScale || 1.3) + 0.15);
      pdfViewer.currentScale = Math.round(next * 100) / 100;
    } else if (e.key === '-') {
      const next = Math.max(0.5, (pdfViewer.currentScale || 1.3) - 0.15);
      pdfViewer.currentScale = Math.round(next * 100) / 100;
    }
  });

  // 5. 文件加载与拖拽事件
  fileInput.addEventListener('click', () => {
    fileInput.value = '';
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadPdfFile(file);
  });

  viewerContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  viewerContainer.addEventListener('drop', (e) => {
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
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        pdfDoc = await loadingTask.promise;
        pageCountEl.textContent = pdfDoc.numPages;

        targetSavedPage = 1;
        try {
          const { pdfHistory = {} } = await chrome.storage.local.get('pdfHistory');
          const record = pdfHistory[currentFileKey];
          if (record && record.page && record.page >= 1 && record.page <= pdfDoc.numPages) {
            targetSavedPage = record.page;
          }
        } catch (e) {
          console.warn('获取阅读历史失败:', e);
        }

        dropZone.style.display = 'none';
        viewerEl.style.display = 'block';

        pdfViewer.setDocument(pdfDoc);
        linkService.setDocument(pdfDoc, null);
      } catch (err) {
        alert('解析 PDF 失败: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // 6. 新拟态实体浮窗：严丝合缝划词查词与智能页码归档
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

  // 监听划词事件（在 document 上全局监听，确保任何边界释放均可稳定捕获）
  document.addEventListener('mouseup', (e) => {
    // 若点击发生在浮窗内部（如点击发音或星标），不处理关闭或重新查词
    if (popupBox && popupBox.contains(e.target)) return;

    // 延迟 10ms 确保浏览器完成当前选区确定
    setTimeout(() => {
      handleTextSelection(e);
    }, 10);
  });

  function handleTextSelection(e) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const rawText = selection.toString().trim();
    if (!rawText) return;

    // 智能提取完整单词（解决双击截断或特殊排版分段问题，不破坏原生选区）
    const targetWord = resolveFullWord(selection, rawText);
    if (!targetWord || targetWord.length > 80) return;

    const range = selection.getRangeAt(0);
    let rect = range.getBoundingClientRect();

    // 坐标兜底：若 getBoundingClientRect 获取异常则从 ClientRects 或鼠标坐标提取
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      const clientRects = range.getClientRects();
      if (clientRects && clientRects.length > 0) {
        rect = clientRects[0];
      } else {
        rect = {
          left: e.clientX,
          right: e.clientX,
          top: e.clientY,
          bottom: e.clientY,
          width: 1,
          height: 1
        };
      }
    }

    // 感知选区所在的是哪一页
    let pageNum = pdfViewer.currentPageNumber || 1;
    try {
      const anchor = selection.anchorNode;
      const el = anchor ? (anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement) : null;
      const pageEl = el ? el.closest('.page') : null;
      if (pageEl && pageEl.getAttribute('data-page-number')) {
        pageNum = parseInt(pageEl.getAttribute('data-page-number'), 10);
      }
    } catch (err) {}

    currentSelectionContext = extractContext(selection);
    showLookup(targetWord, rect, pageNum);
  }

  // 点击外部空白区域关闭浮窗
  document.addEventListener('mousedown', (e) => {
    if (popupBox && !popupBox.contains(e.target)) {
      hidePopup();
    }
  });

  // 智能词界探测：解析完整目标词汇，避免双击误伤或边缘碎片，完全不污染原生 Range 与选区
  function resolveFullWord(selection, rawText) {
    let clean = rawText.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
    if (!clean) return '';

    // 若选中的是长句（超过 6 个单词），按句子处理不自动扩词
    if (clean.split(/\s+/).length > 6) return clean;

    try {
      const range = selection.getRangeAt(0);
      const startNode = range.startContainer;
      if (startNode && startNode.nodeType === Node.TEXT_NODE) {
        const fullContent = startNode.textContent;
        const startOffset = range.startOffset;
        const endOffset = range.endOffset;

        // 向前探测同一文本节点内的单词起点
        let wordStart = startOffset;
        while (wordStart > 0 && /[\p{L}\p{N}]/u.test(fullContent[wordStart - 1])) {
          wordStart--;
        }

        // 向后探测同一文本节点内的单词终点
        let wordEnd = range.endContainer === startNode ? endOffset : fullContent.length;
        while (wordEnd < fullContent.length && /[\p{L}\p{N}]/u.test(fullContent[wordEnd])) {
          wordEnd++;
        }

        const expanded = fullContent.slice(wordStart, wordEnd).trim();
        if (expanded && expanded.length > clean.length) {
          clean = expanded;
        }

        // 跨 Span 碎片向前探测（如相邻的前一个 span 是 st，当前是 uff）
        if (wordStart === 0 && startNode.parentElement) {
          const prevSpan = startNode.parentElement.previousElementSibling;
          if (prevSpan && prevSpan.tagName === 'SPAN') {
            const prevText = prevSpan.textContent || '';
            const prevMatch = prevText.match(/[\p{L}\p{N}]+$/u);
            if (prevMatch) {
              const currRect = startNode.parentElement.getBoundingClientRect();
              const prevRect = prevSpan.getBoundingClientRect();
              if (Math.abs(currRect.top - prevRect.top) < 8 && Math.abs(currRect.left - prevRect.right) < 12) {
                clean = prevMatch[0] + clean;
              }
            }
          }
        }

        // 跨 Span 碎片向后探测
        const endNode = range.endContainer;
        if (endNode && endNode.nodeType === Node.TEXT_NODE && endNode.parentElement) {
          if (range.endOffset >= endNode.textContent.length) {
            const nextSpan = endNode.parentElement.nextElementSibling;
            if (nextSpan && nextSpan.tagName === 'SPAN') {
              const nextText = nextSpan.textContent || '';
              const nextMatch = nextText.match(/^[\p{L}\p{N}]+/u);
              if (nextMatch) {
                const currRect = endNode.parentElement.getBoundingClientRect();
                const nextRect = nextSpan.getBoundingClientRect();
                if (Math.abs(currRect.top - nextRect.top) < 8 && Math.abs(nextRect.left - currRect.right) < 12) {
                  clean = clean + nextMatch[0];
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('resolveFullWord error:', e);
    }

    return clean;
  }

  function extractContext(selection) {
    try {
      const node = selection.anchorNode;
      if (!node) return '';
      const text = node.textContent || '';
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

    try {
      chrome.runtime.sendMessage({ action: 'FETCH_YOUDAO', word }, async (res) => {
        if (chrome.runtime.lastError) {
          box.innerHTML = `<div style="font-size: 12px; color: #bf6060;">查词通信异常，请刷新页面后重试</div>`;
          return;
        }

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
            if (currentWordData.audioUrl) {
              new Audio(currentWordData.audioUrl).play();
            }
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
    } catch (e) {
      box.innerHTML = `<div style="font-size: 12px; color: #bf6060;">查询出错: ${escapeHtml(e.message)}</div>`;
    }
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

  // 7. 阅读进度持久化存储与通知系统
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
