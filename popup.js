/**
 * Aura Dict - Mini Popup Controller
 * 管理划词插件的主电源开关与沉浸重排阅读器、侧边栏、生词本入口
 */

document.addEventListener('DOMContentLoaded', async () => {
  const powerToggle = document.getElementById('power-toggle');
  const statusLed = document.getElementById('status-led');
  const stateText = document.getElementById('state-text');
  const badgeCount = document.getElementById('badge-count');
  const openReaderBtn = document.getElementById('btn-open-reader');
  const openSidepanelBtn = document.getElementById('btn-open-sidepanel');
  const openNotebookBtn = document.getElementById('btn-open-notebook');

  // 读取配置与词汇总量
  const { enabled = true, vocabBook = {} } = await chrome.storage.local.get(['enabled', 'vocabBook']);

  // 初始化 UI 状态
  const count = Object.keys(vocabBook).length;
  badgeCount.textContent = count;
  updateSwitchUI(enabled);

  // 监听物理开关切换
  powerToggle.addEventListener('change', async () => {
    const isEnabled = powerToggle.checked;
    await chrome.storage.local.set({ enabled: isEnabled });
    updateSwitchUI(isEnabled);
  });

  // 打开 PDF 触感沉浸重排阅读器
  if (openReaderBtn) {
    openReaderBtn.addEventListener('click', () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL('reader.html')
      });
      window.close();
    });
  }

  // 打开 Chrome 原生阅读伴侣侧边栏
  if (openSidepanelBtn) {
    openSidepanelBtn.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          try {
            await chrome.sidePanel.open({ tabId: tab.id });
          } catch {
            await chrome.sidePanel.open({ windowId: tab.windowId });
          }
        }
      } catch (e) {
        console.warn('开启侧边栏异常:', e);
      }
      window.close();
    });
  }

  // 打开独立全屏生词本网页
  if (openNotebookBtn) {
    openNotebookBtn.addEventListener('click', () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL('notebook.html')
      });
      window.close();
    });
  }

  function updateSwitchUI(isEnabled) {
    powerToggle.checked = isEnabled;
    if (isEnabled) {
      statusLed.classList.remove('disabled');
      stateText.classList.remove('disabled');
      stateText.textContent = '已开启';
    } else {
      statusLed.classList.add('disabled');
      stateText.classList.add('disabled');
      stateText.textContent = '已休眠';
    }
  }
});
