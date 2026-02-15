const defaultConfig = {
  hnColor: '#4535b1',
  html5Color: '#ffb400',
  html5Alpha: 0.2,
  externalLinkColor: '#ff0000',
  internalLinkColor: '#0000ff'
};

function bytesToReadable(bytes) {
  if (!Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setupTabs() {
  const buttons = document.querySelectorAll('.tab-button');
  const panels = document.querySelectorAll('.tab-panel');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));
      button.classList.add('active');
      document.getElementById(button.dataset.tab).classList.add('active');
    });
  });
}

async function renderPerf(tabId) {
  const response = await chrome.runtime.sendMessage({ type: 'getPerfData', tabId });
  const data = response?.data;

  document.getElementById('ttfb').textContent = data?.ttfb ? `${Math.round(data.ttfb)} ms` : '-';
  document.getElementById('size').textContent = data ? bytesToReadable(data.transferSize) : '-';
  document.getElementById('compression').textContent = data?.compression || '-';
}

async function renderRedirects(tabId) {
  const response = await chrome.runtime.sendMessage({ type: 'getRedirectData', tabId });
  const data = response?.data;

  const list = document.getElementById('redirect-list');
  const empty = document.getElementById('redirect-empty');
  list.innerHTML = '';

  if (!data || !Array.isArray(data.redirects) || data.redirects.length === 0) {
    empty.style.display = 'block';
    if (data?.finalStatusCode === 200) {
      empty.textContent = `URL finale en ${data.finalStatusCode} (pas de redirection).`;
    }
    return;
  }

  empty.style.display = 'none';
  data.redirects.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = `${entry.statusCode} : ${entry.from} → ${entry.to}`;
    list.appendChild(li);
  });

  const final = document.createElement('li');
  final.textContent = `Final: ${data.finalStatusCode} : ${data.finalUrl}`;
  list.appendChild(final);
}

async function runStructureAction(tabId, feature) {
  const config = { ...defaultConfig, ...(await chrome.storage.sync.get(defaultConfig)) };
  await chrome.tabs.sendMessage(tabId, { type: 'toggleStructure', feature, config });
}

async function setupStructureActions(tabId) {
  document.getElementById('toggle-hn').addEventListener('click', () => runStructureAction(tabId, 'hn'));
  document.getElementById('toggle-html5').addEventListener('click', () => runStructureAction(tabId, 'html5'));
  document.getElementById('toggle-external').addEventListener('click', () => runStructureAction(tabId, 'externalLinks'));
  document.getElementById('toggle-internal').addEventListener('click', () => runStructureAction(tabId, 'internalLinks'));
}

async function setupTech(tabId) {
  const jsToggle = document.getElementById('disable-js');
  const cssToggle = document.getElementById('disable-css');
  const response = await chrome.runtime.sendMessage({ type: 'getTechState', tabId });

  jsToggle.checked = !!response?.data?.jsDisabled;
  cssToggle.checked = !!response?.data?.cssDisabled;

  jsToggle.addEventListener('change', async (event) => {
    await chrome.runtime.sendMessage({ type: 'setJsDisabled', tabId, disabled: event.target.checked });
    window.close();
  });

  cssToggle.addEventListener('change', async (event) => {
    await chrome.runtime.sendMessage({ type: 'setCssDisabled', tabId, disabled: event.target.checked });
    window.close();
  });
}

(async () => {
  setupTabs();
  const tab = await getCurrentTab();
  if (!tab?.id) return;

  await Promise.all([renderPerf(tab.id), renderRedirects(tab.id), setupTech(tab.id)]);
  await setupStructureActions(tab.id);
})();
