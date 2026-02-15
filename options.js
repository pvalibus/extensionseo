const defaults = {
  hnColor: '#4535b1',
  html5Color: '#ffb400',
  html5Alpha: 0.2,
  externalLinkColor: '#ff0000',
  internalLinkColor: '#0000ff'
};

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

async function load() {
  const values = { ...defaults, ...(await chrome.storage.sync.get(defaults)) };
  document.getElementById('hnColor').value = values.hnColor;
  document.getElementById('html5Color').value = values.html5Color;
  document.getElementById('html5Alpha').value = values.html5Alpha;
  document.getElementById('html5AlphaValue').textContent = values.html5Alpha;
  document.getElementById('externalLinkColor').value = values.externalLinkColor;
  document.getElementById('internalLinkColor').value = values.internalLinkColor;
}

function bind() {
  const alpha = document.getElementById('html5Alpha');
  alpha.addEventListener('input', () => {
    document.getElementById('html5AlphaValue').textContent = alpha.value;
  });

  document.getElementById('save').addEventListener('click', async () => {
    const payload = {
      hnColor: document.getElementById('hnColor').value,
      html5Color: document.getElementById('html5Color').value,
      html5Alpha: Number.parseFloat(document.getElementById('html5Alpha').value),
      externalLinkColor: document.getElementById('externalLinkColor').value,
      internalLinkColor: document.getElementById('internalLinkColor').value
    };

    await chrome.storage.sync.set(payload);
    const status = document.getElementById('status');
    status.textContent = 'Configuration enregistrée.';
    setTimeout(() => {
      status.textContent = '';
    }, 1500);
  });
}

setupTabs();
load();
bind();
