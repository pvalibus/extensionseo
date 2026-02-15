async function loadTree() {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('key');
  const treeEl = document.getElementById('tree');
  const metaEl = document.getElementById('meta');
  const emptyEl = document.getElementById('empty');

  if (!key) {
    metaEl.textContent = 'Clé de données absente.';
    return;
  }

  const stored = await chrome.storage.local.get(key);
  const payload = stored[key];

  if (!payload || !Array.isArray(payload.headings) || payload.headings.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';
  metaEl.textContent = `${payload.headings.length} titres trouvés.`;

  payload.headings.forEach((hn) => {
    const li = document.createElement('li');
    li.style.marginLeft = `${(hn.level - 1) * 16}px`;

    const meta = document.createElement('div');
    meta.className = 'hn-meta';
    const charCount = (hn.text || '').length;
    meta.textContent = `#${hn.index} • ${hn.tag} • ${charCount} caractères`;

    const text = document.createElement('div');
    text.className = `hn-text hn-level-${hn.level}`;
    text.textContent = hn.text || '(vide)';

    li.appendChild(meta);
    li.appendChild(text);
    treeEl.appendChild(li);
  });

  setTimeout(() => {
    chrome.storage.local.remove(key);
  }, 15000);
}

loadTree();
