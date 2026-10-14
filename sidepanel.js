/**
 * Aura Dict - Side Panel Controller
 * 原生 PDF 阅读伴侣：右键查词、剪贴板自动感知 (Ctrl+C)、即时发音与生词本联动
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusLed = document.getElementById('status-led');
  const btnOpenNotebook = document.getElementById('btn-open-notebook');
  const badgeCount = document.getElementById('badge-count');
  const toggleClipboard = document.getElementById('toggle-clipboard');
  const toggleAutoplay = document.getElementById('toggle-autoplay');
  const searchInput = document.getElementById('search-input');
  const btnSearch = document.getElementById('btn-search');
  const lookupEmpty = document.getElementById('lookup-empty');
  const lookupCard = document.getElementById('lookup-card');
  const cardWord = document.getElementById('card-word');
  const cardPhonetic = document.getElementById('card-phonetic');
  const cardBtnAudio = document.getElementById('card-btn-audio');
  const cardBtnStar = document.getElementById('card-btn-star');
  const cardExplains = document.getElementById('card-explains');
  const cardContext = document.getElementById('card-context');
  const cardSource = document.getElementById('card-source');
  const cardStatus = document.getElementById('card-status');
  const recentList = document.getElementById('recent-list');
  const btnClearRecent = document.getElementById('btn-clear-recent');
  const btnExportAnki = document.getElementById('btn-export-anki');

  let currentWordData = null;
  let lastCopiedText = '';
  let sessionHistory = [];
  let clipboardInterval = null;

  // 1. 初始化设置与生词计数
  await updateBadgeCount();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.vocabBook) {
      updateBadgeCount();
      if (currentWordData) updateStarButtonState(currentWordData.word);
    }
  });

  async function updateBadgeCount() {
    try {
      const { vocabBook = {} } = await chrome.storage.local.get('vocabBook');
      const count = Object.keys(vocabBook).length;
      badgeCount.textContent = count;
    } catch {
      badgeCount.textContent = '0';
    }
  }

  btnOpenNotebook.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('notebook.html') });
  });

  // 2. 检查由右键菜单触发的最新查词
  try {
    const { lastLookupData } = await chrome.storage.local.get('lastLookupData');
    if (lastLookupData && lastLookupData.word && (Date.now() - lastLookupData.timestamp < 10000)) {
      performLookup(lastLookupData.word, lastLookupData.sourceTitle, lastLookupData.sourceUrl);
    }
  } catch (e) {}

  // 3. 监听来自 Background 的实时查词广播（如右键菜单）
  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === 'SIDEPANEL_LOOKUP' && req.word) {
      performLookup(req.word, req.sourceTitle, req.sourceUrl);
    }
  });

  // 4. 即时搜索框
  function handleManualSearch() {
    const q = searchInput.value.trim();
    if (q) {
      performLookup(q, '侧边栏搜索', '主动查询');
      searchInput.value = '';
    }
  }

  btnSearch.addEventListener('click', handleManualSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleManualSearch();
  });

  // 5. 核心查词函数
  async function performLookup(rawWord, sourceTitle = '原生 PDF', sourceUrl = '原生阅读器', context = '') {
    const word = rawWord.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!word || word.length > 80) return;

    lookupEmpty.style.display = 'none';
    lookupCard.style.display = 'flex';

    cardWord.textContent = word;
    cardPhonetic.textContent = '正在感知释义...';
    cardExplains.innerHTML = '<li style="color:#7d8b9e; font-style:italic;">正在连接有道词典引擎...</li>';
    cardSource.textContent = sourceTitle || '原生阅读器';
    cardContext.textContent = context || '可在阅读器中选中句子补充，或点击直接编辑';

    statusLed.classList.add('active');

    chrome.runtime.sendMessage({ action: 'FETCH_YOUDAO', word }, async (res) => {
      if (!res || !res.success || !res.data) {
        cardPhonetic.textContent = '';
        cardExplains.innerHTML = `<li style="color:#bf6060;">未检索到 “${escapeHtml(word)}” 的释义</li>`;
        return;
      }

      currentWordData = {
        ...res.data,
        sourceTitle: sourceTitle || '原生 PDF',
        sourceUrl: sourceUrl || '原生阅读器',
        context: context || ''
      };

      cardWord.textContent = currentWordData.word;
      cardPhonetic.textContent = currentWordData.phonetic ? `[${currentWordData.phonetic}]` : '';

      cardExplains.innerHTML = currentWordData.explains.map(item => `
        <li>• ${escapeHtml(item)}</li>
      `).join('');

      await updateStarButtonState(currentWordData.word);
      addToRecent(currentWordData.word);

      // 自动朗读选项
      if (toggleAutoplay.checked && currentWordData.audioUrl) {
        new Audio(currentWordData.audioUrl).play().catch(() => {});
      }
    });
  }

  // 6. 星标收藏与音频发音
  async function updateStarButtonState(word) {
    const isStarred = await checkIsStarred(word);
    if (isStarred) {
      cardBtnStar.classList.add('starred');
      cardBtnStar.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
      cardBtnStar.title = '已收录至生词本（点击移除）';
      cardStatus.textContent = '● 已加入生词本';
      cardStatus.style.color = '#d97736';
    } else {
      cardBtnStar.classList.remove('starred');
      cardBtnStar.innerHTML = '<svg viewBox="0 0 24 24"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/></svg>';
      cardBtnStar.title = '收录至生词本';
      cardStatus.textContent = '○ 点击星标入库';
      cardStatus.style.color = '#798799';
    }
  }

  async function checkIsStarred(word) {
    try {
      const { vocabBook = {} } = await chrome.storage.local.get('vocabBook');
      return !!vocabBook[word.toLowerCase().trim()];
    } catch {
      return false;
    }
  }

  cardBtnStar.addEventListener('click', async () => {
    if (!currentWordData) return;
    const key = currentWordData.word.toLowerCase().trim();
    const { vocabBook = {} } = await chrome.storage.local.get('vocabBook');

    if (vocabBook[key]) {
      delete vocabBook[key];
    } else {
      vocabBook[key] = {
        word: currentWordData.word,
        phonetic: currentWordData.phonetic || '',
        explains: currentWordData.explains || [],
        audioUrl: currentWordData.audioUrl || '',
        contextSentence: cardContext.textContent.trim() || '',
        sourceUrl: currentWordData.sourceUrl || '原生 PDF',
        sourceTitle: currentWordData.sourceTitle || '原生 PDF 阅读器',
        addTime: Date.now()
      };
    }

    await chrome.storage.local.set({ vocabBook });
    await updateStarButtonState(currentWordData.word);
    await updateBadgeCount();
  });

  cardBtnAudio.addEventListener('click', () => {
    if (currentWordData && currentWordData.audioUrl) {
      new Audio(currentWordData.audioUrl).play();
    }
  });

  // 7. 「复制即查词」剪贴板智能感知引擎
  // 用户在原生 PDF 中双击单词按 Ctrl+C，侧边栏便可自动捕获并查词
  function startClipboardSensor() {
    if (clipboardInterval) clearInterval(clipboardInterval);

    // 每 750ms 探测剪贴板更新
    clipboardInterval = setInterval(async () => {
      if (!toggleClipboard.checked) return;

      try {
        // 读取剪贴板纯文本
        const text = await navigator.clipboard.readText();
        if (!text) return;

        const trimmed = text.trim();
        // 过滤非目标内容：长度在 1~50 字符内，纯单词或短语，非长文
        if (
          trimmed &&
          trimmed !== lastCopiedText &&
          trimmed.length <= 50 &&
          /^[\p{L}\p{N}\s\-',.!?]+$/u.test(trimmed) &&
          trimmed.split(/\s+/).length <= 4
        ) {
          lastCopiedText = trimmed;
          performLookup(trimmed, '原生 PDF (剪贴板感知)', 'Ctrl+C 自动捕获');
        }
      } catch (err) {
        // 剪贴板未授权或未聚焦时静默跳过
      }
    }, 750);
  }

  function stopClipboardSensor() {
    if (clipboardInterval) {
      clearInterval(clipboardInterval);
      clipboardInterval = null;
    }
  }

  toggleClipboard.addEventListener('change', () => {
    if (toggleClipboard.checked) {
      startClipboardSensor();
    } else {
      stopClipboardSensor();
    }
  });

  // 默认启动剪贴板感知
  startClipboardSensor();

  // 8. 最近查词胶囊列表
  function addToRecent(word) {
    const w = word.trim();
    if (!w) return;
    sessionHistory = [w, ...sessionHistory.filter(x => x.toLowerCase() !== w.toLowerCase())].slice(0, 20);
    renderRecentList();
  }

  function renderRecentList() {
    recentList.innerHTML = '';
    sessionHistory.forEach(item => {
      const chip = document.createElement('span');
      chip.className = 'recent-chip';
      chip.textContent = item;
      chip.title = `点击再次查看 “${item}”`;
      chip.onclick = () => performLookup(item, '历史记录', '会话历史');
      recentList.appendChild(chip);
    });
  }

  btnClearRecent.addEventListener('click', () => {
    sessionHistory = [];
    renderRecentList();
  });

  // 9. 一键导出 Anki CSV 牌组
  btnExportAnki.addEventListener('click', async () => {
    try {
      const { vocabBook = {} } = await chrome.storage.local.get('vocabBook');
      const list = Object.values(vocabBook);
      if (list.length === 0) {
        alert('当前生词本为空，请先在原生 PDF 中收录生词！');
        return;
      }

      const rows = [
        ['Word', 'Phonetic', 'Meaning', 'ContextSentence', 'SourceTitle', 'AddTime']
      ];

      list.forEach(item => {
        rows.push([
          item.word || '',
          item.phonetic ? `[${item.phonetic}]` : '',
          (item.explains || []).join('；'),
          item.contextSentence || '',
          item.sourceTitle || '',
          new Date(item.addTime || Date.now()).toLocaleDateString()
        ]);
      });

      const csvContent = '\uFEFF' + rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Aura_Anki_Vocab_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('导出失败: ' + err.message);
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
