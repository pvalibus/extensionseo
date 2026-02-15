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

function removeLabels(scopeClass) {
  document.querySelectorAll(`.${labelClass}.${scopeClass}`).forEach((node) => node.remove());
}

function placeLabel(element, text, color, scopeClass) {
  if (getComputedStyle(element).position === 'static') {
    element.style.position = 'relative';
  }

  const label = document.createElement('span');
  label.className = `${labelClass} ${scopeClass}`;
  label.textContent = text;
  Object.assign(label.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    transform: 'translate(0, -100%)',
    background: color,
    color: '#fff',
    fontSize: '11px',
    fontFamily: 'Arial, sans-serif',
    zIndex: '2147483647',
    padding: '1px 4px',
    borderRadius: '3px'
  });
  element.appendChild(label);
}

function clearFeature(feature) {
  const className = `${appliedClassPrefix}${feature}`;
  document.querySelectorAll(`.${className}`).forEach((el) => {
    el.classList.remove(className);
    el.style.outline = '';
    if (feature === 'html5') {
      el.style.backgroundColor = '';
    }
  });
  removeLabels(className);
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
    el.style.outline = `3px solid ${config.hnColor}`;
    placeLabel(el, el.tagName.toUpperCase(), config.hnColor, className);
  });
  state[feature] = true;
}

function toggleHtml5(config) {
  const feature = 'html5';
  const className = `${appliedClassPrefix}${feature}`;
  if (state[feature]) {
    clearFeature(feature);
    state[feature] = false;
    return;
  }

  document.querySelectorAll('main, footer, header, aside, section').forEach((el) => {
    el.classList.add(className);
    el.style.outline = `3px solid ${config.html5Color}`;
    el.style.backgroundColor = hexToRgba(config.html5Color, config.html5Alpha);
    placeLabel(el, el.tagName.toLowerCase(), config.html5Color, className);
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
      el.style.outline = `3px solid ${internal ? config.internalLinkColor : config.externalLinkColor}`;
    }
  });
  state[feature] = true;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'toggleStructure') return;

  const { feature, config } = message;
  if (feature === 'hn') toggleHn(config);
  if (feature === 'html5') toggleHtml5(config);
  if (feature === 'externalLinks') toggleLinks(config, false);
  if (feature === 'internalLinks') toggleLinks(config, true);

  sendResponse({ ok: true });
});
