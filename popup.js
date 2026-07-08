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

function getStatusClass(statusCode) {
  if (statusCode === 'ERR') return 'status-5xx';
  const code = Number(statusCode);
  if (!Number.isFinite(code)) return 'status-5xx';
  if (code >= 200 && code < 300) return 'status-2xx';
  if (code >= 300 && code < 400) return 'status-3xx';
  if (code >= 400 && code < 500) return 'status-4xx';
  return 'status-5xx';
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function runInTab(tabId, func, args = []) {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func,
      args
    });
    return injection?.result;
  } catch (_error) {
    return null;
  }
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

function addClickListener(id, handler) {
  const element = document.getElementById(id);
  if (!element) return;
  element.addEventListener('click', handler);
}

function renderAbout() {
  const versionEl = document.getElementById('about-version');
  if (!versionEl) return;
  versionEl.textContent = chrome.runtime.getManifest().version || '-';
}

function truncateByPixels(text, maxWidthPx, font) {
  if (!text) return '';
  const canvas = truncateByPixels.canvas || (truncateByPixels.canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');
  ctx.font = font;

  if (ctx.measureText(text).width <= maxWidthPx) return text;

  const ellipsis = '...';
  let result = text;
  while (result.length > 0 && ctx.measureText(`${result}${ellipsis}`).width > maxWidthPx) {
    result = result.slice(0, -1);
  }
  return `${result}${ellipsis}`;
}

async function renderPerf(tabId) {
  const response = await chrome.runtime.sendMessage({ type: 'getPerfData', tabId });
  let data = response?.data || {};

  const pagePerf = await runInTab(tabId, () => {
    const navEntry = performance.getEntriesByType('navigation')[0];
    if (!navEntry) return null;

    return {
      transferSize: Number.isFinite(navEntry.transferSize) ? navEntry.transferSize : null,
      ttfb: Number.isFinite(navEntry.responseStart) ? navEntry.responseStart : null
    };
  });

  if (pagePerf) {
    data = {
      ...data,
      ttfb: Number.isFinite(data.ttfb) ? data.ttfb : pagePerf.ttfb,
      transferSize: Number.isFinite(pagePerf.transferSize) ? pagePerf.transferSize : data.transferSize
    };
  }

  document.getElementById('ttfb').textContent = Number.isFinite(data.ttfb) ? `${Math.round(data.ttfb)} ms` : '-';
  document.getElementById('size').textContent = Number.isFinite(data.transferSize) ? bytesToReadable(data.transferSize) : '-';
  document.getElementById('compression').textContent = data.compression || '-';
}

function appendRedirectStep(list, step) {
  const li = document.createElement('li');
  li.className = 'redirect-step';

  const badge = document.createElement('span');
  badge.className = `status-badge ${getStatusClass(step.statusCode)}`;
  badge.textContent = `${step.statusCode}`;

  const text = document.createElement('span');
  if (step.statusCode === 'ERR') {
    text.textContent = `Étape ${step.step} : ${step.from} (erreur: ${step.error || 'inconnue'})`;
  } else if (step.final) {
    text.textContent = `Étape ${step.step} : ${step.from} (URL finale)`;
  } else {
    text.textContent = `Étape ${step.step} : ${step.from} → ${step.to}`;
  }

  li.appendChild(badge);
  li.appendChild(text);
  list.appendChild(li);
}

async function renderRedirects(tabId) {
  const response = await chrome.runtime.sendMessage({ type: 'getRedirectData', tabId });
  const data = response?.data;

  const list = document.getElementById('redirect-list');
  const empty = document.getElementById('redirect-empty');
  list.innerHTML = '';

  if (!data || !Array.isArray(data.redirects) || data.redirects.length === 0) {
    empty.style.display = 'block';
    empty.textContent = 'Aucune donnée de redirection disponible pour cette page.';
    return;
  }

  empty.style.display = 'none';
  data.redirects.forEach((step) => appendRedirectStep(list, step));
}

function setText(id, value) {
  document.getElementById(id).textContent = value || '-';
}

function formatSerpText(data) {
  const title = data.title || 'Title non renseigné';
  const metaDescription = data.metaDescription || 'Meta description non renseignée';
  const baseUrl = `${data.host || ''}${data.slug && data.slug !== '/' ? `/${data.slug}` : ''}`;

  return {
    urlDesktop: truncateByPixels(baseUrl || 'example.com', 360, '11px Arial'),
    urlMobile: truncateByPixels(baseUrl || 'example.com', 240, '11px Arial'),
    titleDesktop: truncateByPixels(title, 540, '18px Arial'),
    titleMobile: truncateByPixels(title, 340, '16px Arial'),
    descDesktop: truncateByPixels(metaDescription, 960, '13px Arial'),
    descMobile: truncateByPixels(metaDescription, 680, '13px Arial')
  };
}

async function renderTriplette(tabId) {
  const data = await runInTab(tabId, () => {
    const title = document.title || '';
    const h1 = document.querySelector('h1')?.textContent?.trim() || '';
    const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';

    let slug = '';
    try {
      const url = new URL(window.location.href);
      const cleanPath = url.pathname.replace(/\/+$/, '');
      slug = cleanPath.split('/').filter(Boolean).pop() || '/';
      return {
        title,
        titleLength: title.length,
        h1,
        h1Length: h1.length,
        slug,
        metaDescription,
        host: url.host
      };
    } catch (_error) {
      return {
        title,
        titleLength: title.length,
        h1,
        h1Length: h1.length,
        slug,
        metaDescription,
        host: window.location.host
      };
    }
  });

  if (!data) return;

  setText('trip-title', data.title);
  setText('trip-title-len', `${data.titleLength || 0}`);
  setText('trip-h1', data.h1);
  setText('trip-h1-len', `${data.h1Length || 0}`);
  setText('trip-slug', data.slug);
  setText('trip-meta', data.metaDescription);

  const serp = formatSerpText(data);
  setText('serp-desktop-url', serp.urlDesktop);
  setText('serp-desktop-title', serp.titleDesktop);
  setText('serp-desktop-desc', serp.descDesktop);
  setText('serp-mobile-url', serp.urlMobile);
  setText('serp-mobile-title', serp.titleMobile);
  setText('serp-mobile-desc', serp.descMobile);
}

async function openHnTree(tabId) {
  const hnData = await runInTab(tabId, () => {
    function headingDisplayText(el) {
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
      if (text) return text;

      const img = el.querySelector('img[alt]');
      if (img) {
        const alt = (img.getAttribute('alt') || '').trim();
        if (alt) return `🖼 image (${alt})`;
      }

      return '';
    }

    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    return headings.map((el, index) => ({
      index: index + 1,
      level: Number(el.tagName.substring(1)),
      tag: el.tagName.toUpperCase(),
      text: headingDisplayText(el).slice(0, 300)
    }));
  });

  const key = `hnTree-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await chrome.storage.local.set({
    [key]: {
      createdAt: Date.now(),
      sourceTabId: tabId,
      headings: hnData || []
    }
  });

  const target = chrome.runtime.getURL(`hn-tree.html?key=${encodeURIComponent(key)}`);
  await chrome.tabs.create({ url: target });
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportLinksCsv(tabId, internal) {
  const data = await runInTab(tabId, (isInternal) => {
    const origin = window.location.origin;
    const zoneSelector = 'main, footer, header, aside, section, nav, article';

    function getEmplacement(anchor) {
      const zones = [];
      let current = anchor.parentElement;
      while (current) {
        if (current.matches && current.matches(zoneSelector)) {
          zones.push(current.tagName.toLowerCase());
        }
        current = current.parentElement;
      }
      return zones.reverse().join(' > ');
    }

    function getAnchorAndType(linkEl) {
      const img = linkEl.querySelector('img');
      if (img) {
        const alt = (img.getAttribute('alt') || '').trim();
        return {
          type: 'image',
          ancre: alt || '(image sans alt)'
        };
      }

      return {
        type: 'texte',
        ancre: (linkEl.textContent || '').trim().replace(/\s+/g, ' ')
      };
    }

    return Array.from(document.querySelectorAll('a[href]')).map((a) => {
      try {
        const target = new URL(a.href, window.location.href);
        const sameOrigin = target.origin === origin;
        if ((isInternal && !sameOrigin) || (!isInternal && sameOrigin)) return null;

        const { ancre, type } = getAnchorAndType(a);
        return {
          ancre,
          target: target.href,
          emplacement: getEmplacement(a),
          type
        };
      } catch (_error) {
        return null;
      }
    }).filter(Boolean);
  }, [internal]);

  const rows = [
    ['ancre', 'url du lien cible', 'emplacement', 'type'],
    ...(data || []).map((item) => [item.ancre, item.target, item.emplacement, item.type])
  ];
  const suffix = internal ? 'liens-internes' : 'liens-externes';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadCsv(`${suffix}-${stamp}.csv`, rows);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getDateStamp(date = new Date()) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

function computeHostAndSlug(urlString) {
  try {
    const url = new URL(urlString);
    const cleanPath = url.pathname.replace(/\/+$/, '');
    const slug = cleanPath.split('/').filter(Boolean).pop() || '/';
    return { host: url.host, slug };
  } catch (_error) {
    return { host: '', slug: '/' };
  }
}

function sanitizeFilenamePart(text) {
  const cleaned = String(text || '')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'na';
}

function buildScreenshotFilename(urlString) {
  const { host, slug } = computeHostAndSlug(urlString);
  const slugPart = slug === '/' ? 'home' : slug;
  return `${getDateStamp()}_${sanitizeFilenamePart(host)}_${sanitizeFilenamePart(slugPart)}.jpg`;
}

function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

async function copyDataUrlImageToClipboard(dataUrl) {
  const jpegBlob = await (await fetch(dataUrl)).blob();
  // Chrome's clipboard image support is reliable for image/png only,
  // so the JPEG capture is re-encoded before being copied.
  const bitmap = await createImageBitmap(jpegBlob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
}

function setToolsStatus(message) {
  const el = document.getElementById('capture-status');
  if (!el) return;
  el.textContent = message || '';
}

function friendlyCaptureError(rawMessage) {
  const text = String(rawMessage || '');
  if (/cannot attach/i.test(text)) {
    return 'Capture impossible sur cette page (page interne du navigateur ou protégée).';
  }
  if (/another debugger/i.test(text)) {
    return 'Un autre outil de débogage (DevTools) est déjà attaché à cet onglet. Fermez-le puis réessayez.';
  }
  return text || 'échec de la capture.';
}

async function runStructureAction(tabId, feature) {
  const config = { ...defaultConfig, ...(await chrome.storage.sync.get(defaultConfig)) };
  await chrome.tabs.sendMessage(tabId, { type: 'toggleStructure', feature, config });
}

async function setupStructureActions(tabId) {
  addClickListener('toggle-hn', () => runStructureAction(tabId, 'hn'));
  addClickListener('toggle-html5', () => runStructureAction(tabId, 'html5'));
  addClickListener('toggle-external', () => runStructureAction(tabId, 'externalLinks'));
  addClickListener('toggle-internal', () => runStructureAction(tabId, 'internalLinks'));
  addClickListener('export-external', () => exportLinksCsv(tabId, false));
  addClickListener('export-internal', () => exportLinksCsv(tabId, true));
  addClickListener('open-hn-tree', async () => {
    await openHnTree(tabId);
    window.close();
  });
}

async function setupToolsActions(tabId) {
  addClickListener('open-scrap-tool', async () => {
    const toolUrl = chrome.runtime.getURL(`scrap-tool.html?tabId=${encodeURIComponent(String(tabId))}`);
    await chrome.windows.create({
      url: toolUrl,
      type: 'popup',
      width: 880,
      height: 760
    });
    window.close();
  });

  addClickListener('capture-full-page', async () => {
    const button = document.getElementById('capture-full-page');
    button.disabled = true;
    setToolsStatus('Capture en cours...');
    try {
      const tab = await chrome.tabs.get(tabId);
      const response = await chrome.runtime.sendMessage({ type: 'captureFullPageScreenshot', tabId });
      if (!response?.ok) throw new Error(response?.error);
      const filename = buildScreenshotFilename(tab.url);
      downloadDataUrl(filename, response.dataUrl);

      let clipboardOk = true;
      try {
        await copyDataUrlImageToClipboard(response.dataUrl);
      } catch (_clipboardError) {
        clipboardOk = false;
      }

      setToolsStatus(clipboardOk
        ? `Capture téléchargée et copiée dans le presse-papiers : ${filename}`
        : `Capture téléchargée : ${filename} (échec de la copie dans le presse-papiers)`);
    } catch (error) {
      setToolsStatus(`Erreur : ${friendlyCaptureError(error.message)}`);
    } finally {
      button.disabled = false;
    }
  });
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
  renderAbout();

  const tab = await getCurrentTab();
  if (!tab?.id) return;

  await setupStructureActions(tab.id);
  await setupToolsActions(tab.id);

  await Promise.allSettled([renderPerf(tab.id), renderRedirects(tab.id), renderTriplette(tab.id), setupTech(tab.id)]);
})();
