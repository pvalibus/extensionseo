const state = {
  hn: false,
  html5: false,
  externalLinks: false,
  internalLinks: false
};

const labelClass = 'gone-seo-label';
const appliedClassPrefix = 'gone-seo-';

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const r = Number.parseInt(clean.substring(0, 2), 16);
  const g = Number.parseInt(clean.substring(2, 4), 16);
  const b = Number.parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function removeLabels(scopeClass, feature) {
  document.querySelectorAll(`.${labelClass}.${scopeClass}`).forEach((node) => node.remove());
  if (feature) {
    document.querySelectorAll(`.${labelClass}[data-gone-seo-feature="${feature}"]`).forEach((node) => node.remove());
  }
}

function placeLabel(element, text, color, scopeClass, { inside = false } = {}) {
  if (getComputedStyle(element).position === 'static') {
    element.style.position = 'relative';
  }

  const label = document.createElement('span');
  label.className = `${labelClass} ${scopeClass}`;
  label.dataset.goneSeoFeature = scopeClass.replace(appliedClassPrefix, "");
  label.textContent = text;

  const nearTop = element.getBoundingClientRect().top < 28;
  const forceInside = inside || nearTop;

  Object.assign(label.style, {
    position: 'absolute',
    top: forceInside ? '2px' : '0',
    left: '2px',
    transform: forceInside ? 'none' : 'translate(0, -100%)',
    background: color,
    color: '#fff',
    fontSize: '11px',
    fontFamily: 'Arial, sans-serif',
    zIndex: '2147483647',
    padding: '1px 4px',
    borderRadius: '3px',
    pointerEvents: 'none'
  });

  element.appendChild(label);
}

function clearFeature(feature) {
  const className = `${appliedClassPrefix}${feature}`;
  document.querySelectorAll(`.${className}`).forEach((el) => {
    el.classList.remove(className);
    el.style.outline = '';
    el.style.outlineOffset = '';
    el.style.boxShadow = '';
    if (feature === 'html5') {
      el.style.backgroundColor = '';
      if (el.dataset.goneSeoPrevMarginTop !== undefined) {
        el.style.marginTop = el.dataset.goneSeoPrevMarginTop;
        el.style.marginRight = el.dataset.goneSeoPrevMarginRight || '';
        el.style.marginBottom = el.dataset.goneSeoPrevMarginBottom || '';
        el.style.marginLeft = el.dataset.goneSeoPrevMarginLeft || '';
        delete el.dataset.goneSeoPrevMarginTop;
        delete el.dataset.goneSeoPrevMarginRight;
        delete el.dataset.goneSeoPrevMarginBottom;
        delete el.dataset.goneSeoPrevMarginLeft;
      }
    }
  });
  removeLabels(className, feature);
}

function addOutlineWithSpacing(el, color) {
  el.style.outline = `3px solid ${color}`;
  el.style.outlineOffset = '3px';
}

function toggleHn(config) {
  const feature = 'hn';
  const className = `${appliedClassPrefix}${feature}`;
  if (state[feature]) {
    clearFeature(feature);
    state[feature] = false;
    return;
  }

  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
    el.classList.add(className);
    addOutlineWithSpacing(el, config.hnColor);
    placeLabel(el, el.tagName.toUpperCase(), config.hnColor, className);
  });
  state[feature] = true;
}

function getSemanticBlocksWithDepth() {
  const selector = 'main, footer, header, aside, section, nav, article';
  return Array.from(document.querySelectorAll(selector)).map((el) => ({
    el,
    nested: !!el.parentElement?.closest(selector)
  }));
}

function toggleHtml5(config) {
  const feature = 'html5';
  const className = `${appliedClassPrefix}${feature}`;
  if (state[feature]) {
    clearFeature(feature);
    state[feature] = false;
    return;
  }

  getSemanticBlocksWithDepth().forEach(({ el, nested }) => {
    el.classList.add(className);
    el.style.boxShadow = `inset 0 0 0 3px ${config.html5Color}`;
    el.style.backgroundColor = hexToRgba(config.html5Color, config.html5Alpha);

    if (nested) {
      if (el.dataset.goneSeoPrevMarginTop === undefined) {
        el.dataset.goneSeoPrevMarginTop = el.style.marginTop || '';
        el.dataset.goneSeoPrevMarginRight = el.style.marginRight || '';
        el.dataset.goneSeoPrevMarginBottom = el.style.marginBottom || '';
        el.dataset.goneSeoPrevMarginLeft = el.style.marginLeft || '';
      }
      el.style.marginTop = '17px';
      el.style.marginRight = '6px';
      el.style.marginBottom = '6px';
      el.style.marginLeft = '6px';
    }

    placeLabel(el, el.tagName.toLowerCase(), config.html5Color, className, { inside: true });
  });
  state[feature] = true;
}

function toggleLinks(config, internal) {
  const feature = internal ? 'internalLinks' : 'externalLinks';
  const className = `${appliedClassPrefix}${feature}`;
  if (state[feature]) {
    clearFeature(feature);
    state[feature] = false;
    return;
  }

  const origin = window.location.origin;
  document.querySelectorAll('a[href]').forEach((el) => {
    let targetUrl;
    try {
      targetUrl = new URL(el.href, window.location.href);
    } catch (_error) {
      return;
    }

    const isInternal = targetUrl.origin === origin;
    if ((internal && isInternal) || (!internal && !isInternal)) {
      el.classList.add(className);
      addOutlineWithSpacing(el, internal ? config.internalLinkColor : config.externalLinkColor);
    }
  });
  state[feature] = true;
}

function getNavigationPerfData() {
  const navEntry = performance.getEntriesByType('navigation')[0];
  if (!navEntry) return null;

  const transferSize = Number.isFinite(navEntry.transferSize) ? navEntry.transferSize : null;
  const ttfb = Number.isFinite(navEntry.responseStart) ? navEntry.responseStart : null;

  return {
    transferSize,
    ttfb
  };
}

function getTripletteData() {
  const title = document.title || '';
  const h1 = document.querySelector('h1')?.textContent?.trim() || '';
  const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';

  let slug = '';
  try {
    const url = new URL(window.location.href);
    const cleanPath = url.pathname.replace(/\/+$/, '');
    slug = cleanPath.split('/').filter(Boolean).pop() || '/';
  } catch (_error) {
    slug = '';
  }

  return {
    title,
    titleLength: title.length,
    h1,
    h1Length: h1.length,
    slug,
    metaDescription,
    metaDescriptionLength: metaDescription.length,
    url: window.location.href,
    host: window.location.host
  };
}

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

function getHnTreeData() {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  return headings.map((el, index) => {
    const display = headingDisplayText(el);
    return {
      index: index + 1,
      level: Number(el.tagName.substring(1)),
      tag: el.tagName.toUpperCase(),
      text: display.slice(0, 300)
    };
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'toggleStructure') {
    const { feature, config } = message;
    if (feature === 'hn') toggleHn(config);
    if (feature === 'html5') toggleHtml5(config);
    if (feature === 'externalLinks') toggleLinks(config, false);
    if (feature === 'internalLinks') toggleLinks(config, true);

    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'getPagePerfData') {
    sendResponse({ data: getNavigationPerfData() });
    return;
  }

  if (message.type === 'getTripletteData') {
    sendResponse({ data: getTripletteData() });
    return;
  }

  if (message.type === 'getHnTreeData') {
    sendResponse({ data: getHnTreeData() });
  }
});
