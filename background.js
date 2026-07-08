const requestTracker = new Map();
const perfByTab = new Map();
const redirectsByTab = new Map();
const redirectChainsByRequest = new Map();

const togglesByTab = new Map();
let nextRuleId = 1000;

const SCREENSHOT_JPEG_QUALITY = 90;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureFullPageScreenshot(tabId) {
  const debuggee = { tabId };
  await chrome.debugger.attach(debuggee, '1.3');
  try {
    const { cssContentSize } = await chrome.debugger.sendCommand(debuggee, 'Page.getLayoutMetrics');
    const width = Math.ceil(cssContentSize.width);
    const height = Math.ceil(cssContentSize.height);

    // Resize the emulated viewport to the full page height so that
    // position: fixed/sticky elements (headers, sidebars) are laid out
    // once instead of being repainted for every internal capture tile.
    await chrome.debugger.sendCommand(debuggee, 'Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 0,
      mobile: false
    });
    await wait(100);

    const { data } = await chrome.debugger.sendCommand(debuggee, 'Page.captureScreenshot', {
      format: 'jpeg',
      quality: SCREENSHOT_JPEG_QUALITY,
      clip: { x: 0, y: 0, width, height, scale: 1 }
    });
    return `data:image/jpeg;base64,${data}`;
  } finally {
    await chrome.debugger.sendCommand(debuggee, 'Emulation.clearDeviceMetricsOverride').catch(() => {});
    await chrome.debugger.detach(debuggee).catch(() => {});
  }
}

function getTabToggles(tabId) {
  if (!togglesByTab.has(tabId)) {
    togglesByTab.set(tabId, { jsDisabled: false, cssDisabled: false, jsRuleId: null, cssRuleId: null });
  }
  return togglesByTab.get(tabId);
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.type !== 'main_frame') return;

    requestTracker.set(details.requestId, {
      tabId: details.tabId,
      url: details.url,
      startTime: details.timeStamp,
      headersTime: null,
      statusCode: null,
      responseHeaders: []
    });

    if (!redirectChainsByRequest.has(details.requestId)) {
      redirectChainsByRequest.set(details.requestId, []);
    }
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.type !== 'main_frame') return;
    const req = requestTracker.get(details.requestId);
    if (!req) return;

    req.headersTime = details.timeStamp;
    req.statusCode = details.statusCode;
    req.responseHeaders = details.responseHeaders || [];
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

chrome.webRequest.onBeforeRedirect.addListener(
  (details) => {
    if (details.type !== 'main_frame') return;

    const workflow = redirectChainsByRequest.get(details.requestId) || [];
    workflow.push({
      step: workflow.length + 1,
      statusCode: details.statusCode,
      from: details.url,
      to: details.redirectUrl
    });

    redirectChainsByRequest.set(details.requestId, workflow);
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.type !== 'main_frame') return;

    const req = requestTracker.get(details.requestId);
    if (!req) return;

    const headerMap = Object.fromEntries(
      (req.responseHeaders || []).map((header) => [header.name.toLowerCase(), header.value || ''])
    );

    const ttfb = req.headersTime ? Math.max(0, req.headersTime - req.startTime) : null;
    const transferSize = details.encodedDataLength;
    const compression = (headerMap['content-encoding'] || '').trim() || 'aucune compression détectée';

    perfByTab.set(req.tabId, {
      url: req.url,
      statusCode: req.statusCode || details.statusCode,
      ttfb,
      transferSize,
      compression,
      timestamp: Date.now()
    });

    const workflow = redirectChainsByRequest.get(details.requestId) || [];
    workflow.push({
      step: workflow.length + 1,
      statusCode: details.statusCode,
      from: details.url,
      to: details.url,
      final: true
    });

    redirectsByTab.set(req.tabId, {
      finalUrl: details.url,
      finalStatusCode: details.statusCode,
      redirects: workflow,
      timestamp: Date.now()
    });

    requestTracker.delete(details.requestId);
    redirectChainsByRequest.delete(details.requestId);
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.type !== 'main_frame') return;

    const workflow = redirectChainsByRequest.get(details.requestId) || [];
    workflow.push({
      step: workflow.length + 1,
      statusCode: 'ERR',
      from: details.url,
      to: details.url,
      error: details.error,
      final: true
    });

    redirectsByTab.set(details.tabId, {
      finalUrl: details.url,
      finalStatusCode: 'ERR',
      redirects: workflow,
      timestamp: Date.now(),
      error: details.error
    });

    requestTracker.delete(details.requestId);
    redirectChainsByRequest.delete(details.requestId);
  },
  { urls: ['<all_urls>'] }
);

async function updateBlockingRule(tabId, type, enableDisable) {
  const tabToggles = getTabToggles(tabId);
  const key = type === 'script' ? 'jsRuleId' : 'cssRuleId';
  const stateKey = type === 'script' ? 'jsDisabled' : 'cssDisabled';

  const removeRuleIds = [];
  if (tabToggles[key]) {
    removeRuleIds.push(tabToggles[key]);
    tabToggles[key] = null;
  }

  const addRules = [];
  if (enableDisable) {
    const ruleId = nextRuleId++;
    tabToggles[key] = ruleId;
    addRules.push({
      id: ruleId,
      priority: 1,
      action: { type: 'block' },
      condition: {
        tabIds: [tabId],
        resourceTypes: [type]
      }
    });
  }

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds,
    addRules
  });

  tabToggles[stateKey] = enableDisable;
  togglesByTab.set(tabId, tabToggles);
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabToggles = togglesByTab.get(tabId);
  if (!tabToggles) return;

  const removeRuleIds = [tabToggles.jsRuleId, tabToggles.cssRuleId].filter(Boolean);
  if (removeRuleIds.length) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds, addRules: [] });
  }

  togglesByTab.delete(tabId);
  perfByTab.delete(tabId);
  redirectsByTab.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === 'getPerfData') {
      sendResponse({ data: perfByTab.get(message.tabId) || null });
      return;
    }

    if (message.type === 'getRedirectData') {
      sendResponse({ data: redirectsByTab.get(message.tabId) || null });
      return;
    }

    if (message.type === 'getTechState') {
      sendResponse({ data: getTabToggles(message.tabId) });
      return;
    }

    if (message.type === 'setJsDisabled') {
      await updateBlockingRule(message.tabId, 'script', message.disabled);
      chrome.tabs.reload(message.tabId);
      sendResponse({ ok: true, data: getTabToggles(message.tabId) });
      return;
    }

    if (message.type === 'setCssDisabled') {
      await updateBlockingRule(message.tabId, 'stylesheet', message.disabled);
      chrome.tabs.reload(message.tabId);
      sendResponse({ ok: true, data: getTabToggles(message.tabId) });
      return;
    }

    if (message.type === 'captureFullPageScreenshot') {
      const dataUrl = await captureFullPageScreenshot(message.tabId);
      sendResponse({ ok: true, dataUrl });
      return;
    }

    sendResponse({ ok: false, error: 'Unknown message type' });
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message });
  });

  return true;
});
