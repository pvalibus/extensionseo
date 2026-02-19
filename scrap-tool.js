const csvDefaults = {
  csvQuoteValues: true,
  csvSeparator: ','
};

let tabId = null;
let latestRows = [];
let latestHeaders = [];
let csvConfig = { ...csvDefaults };

function getTabIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('tabId');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function setStatus(message) {
  document.getElementById('status').textContent = message;
}

function normalizeSeparator(value) {
  const raw = String(value || '').trim();
  if (!raw) return ',';
  if (raw === '\\t') return '\t';
  return raw[0];
}

async function loadCsvConfig() {
  const stored = await chrome.storage.sync.get(csvDefaults);
  csvConfig = {
    csvQuoteValues: stored.csvQuoteValues !== false,
    csvSeparator: normalizeSeparator(stored.csvSeparator)
  };
}

function getColumnsConfig() {
  return Array.from(document.querySelectorAll('.column-row')).map((row, index) => ({
    label: row.querySelector('.col-label').value.trim() || `colonne_${index + 1}`,
    relativeXPath: row.querySelector('.col-xpath').value.trim()
  }));
}

function addColumnRow(label = '', relativeXPath = '') {
  const container = document.getElementById('columns');
  const row = document.createElement('div');
  row.className = 'column-row';

  const labelInput = document.createElement('input');
  labelInput.className = 'col-label';
  labelInput.placeholder = 'Nom de colonne';
  labelInput.value = label;

  const xpathInput = document.createElement('input');
  xpathInput.className = 'col-xpath';
  xpathInput.placeholder = '/h2 ou .//a[@class="title"]';
  xpathInput.value = relativeXPath;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '🗑';
  removeBtn.title = 'Supprimer la colonne';
  removeBtn.addEventListener('click', () => {
    row.remove();
  });

  row.appendChild(labelInput);
  row.appendChild(xpathInput);
  row.appendChild(removeBtn);
  container.appendChild(row);
}

function encodeCsvValue(value) {
  const text = String(value ?? '');
  if (!csvConfig.csvQuoteValues) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(headers, rows) {
  const separator = csvConfig.csvSeparator || ',';
  const lines = [headers, ...rows].map((line) => line.map(encodeCsvValue).join(separator));
  return lines.join('\n');
}

function renderTable(headers, rows) {
  const thead = document.querySelector('#result-table thead');
  const tbody = document.querySelector('#result-table tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  if (!headers.length) {
    return;
  }

  const trHead = document.createElement('tr');
  headers.forEach((header) => {
    const th = document.createElement('th');
    th.textContent = header;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    row.forEach((cell) => {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

async function runScrap() {
  const baseXPath = document.getElementById('base-xpath').value.trim();
  const columns = getColumnsConfig();

  if (!tabId) {
    setStatus('Impossible de trouver l’onglet source.');
    return;
  }

  if (!baseXPath) {
    setStatus('Veuillez renseigner un XPath de base.');
    return;
  }

  if (!columns.length) {
    setStatus('Ajoutez au moins une colonne.');
    return;
  }

  setStatus('Extraction en cours...');

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (xpath, cols) => {
        function evaluateNodes(path, contextNode) {
          const snapshot = document.evaluate(
            path,
            contextNode || document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null
          );
          const nodes = [];
          for (let i = 0; i < snapshot.snapshotLength; i += 1) {
            nodes.push(snapshot.snapshotItem(i));
          }
          return nodes;
        }

        function getNodeValue(node) {
          if (!node) return '';

          if (node.nodeType === Node.ATTRIBUTE_NODE) {
            return (node.nodeValue || '').trim();
          }

          if (node.nodeType === Node.TEXT_NODE) {
            return (node.nodeValue || '').replace(/\s+/g, ' ').trim();
          }

          if (node.nodeType === Node.ELEMENT_NODE) {
            if ('value' in node && typeof node.value === 'string') {
              const inputValue = node.value.trim();
              if (inputValue) return inputValue;
            }

            return (node.textContent || '').replace(/\s+/g, ' ').trim();
          }

          return (node.textContent || '').replace(/\s+/g, ' ').trim();
        }

        function normalizeRelativeXPath(path) {
          if (!path) return '';
          const trimmed = path.trim();
          if (!trimmed) return '';
          if (trimmed.startsWith('./') || trimmed.startsWith('.//')) return trimmed;
          if (trimmed.startsWith('/')) return `.${trimmed}`;
          return `.//${trimmed}`;
        }

        const rows = evaluateNodes(xpath, document);
        const data = rows.map((rowNode) => cols.map((col) => {
          try {
            if (!col.relativeXPath) {
              return (rowNode.innerHTML || '').trim();
            }

            const scopedXPath = normalizeRelativeXPath(col.relativeXPath);
            const colNodes = evaluateNodes(scopedXPath, rowNode);
            if (!colNodes.length) return '';
            return colNodes.map((n) => getNodeValue(n)).filter(Boolean).join(' | ');
          } catch (_error) {
            return '';
          }
        }));

        return { count: rows.length, data };
      },
      args: [baseXPath, columns]
    });

    const result = injection?.result;
    if (!result) {
      setStatus('Aucune donnée retournée.');
      return;
    }

    latestHeaders = columns.map((c) => c.label);
    latestRows = result.data || [];
    renderTable(latestHeaders, latestRows);

    const hasData = latestRows.length > 0;
    document.getElementById('copy-csv').disabled = !hasData;
    document.getElementById('download-csv').disabled = !hasData;

    setStatus(`${result.count} lignes détectées, ${latestRows.length} lignes extraites.`);
  } catch (_error) {
    setStatus('Erreur durant l’extraction XPath. Vérifiez vos expressions.');
  }
}

async function copyCsv() {
  if (!latestHeaders.length || !latestRows.length) return;
  const csv = buildCsv(latestHeaders, latestRows);
  try {
    await navigator.clipboard.writeText(csv);
    setStatus('CSV copié dans le presse-papiers.');
  } catch (_error) {
    setStatus('Impossible de copier dans le presse-papiers.');
  }
}

function downloadCsv() {
  if (!latestHeaders.length || !latestRows.length) return;
  const csv = buildCsv(latestHeaders, latestRows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scrap-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('CSV exporté.');
}

async function setup() {
  tabId = getTabIdFromQuery();
  await loadCsvConfig();

  document.getElementById('add-column').addEventListener('click', () => addColumnRow());
  document.getElementById('run-scrap').addEventListener('click', runScrap);
  document.getElementById('copy-csv').addEventListener('click', copyCsv);
  document.getElementById('download-csv').addEventListener('click', downloadCsv);

  addColumnRow('colonne_1', '/h2');
  addColumnRow('colonne_2', '/div[1]');

  if (!tabId) {
    setStatus('Avertissement : tabId manquant, ouvrez cet outil depuis la popup.');
    return;
  }

  const separatorLabel = csvConfig.csvSeparator === '\t' ? '\\t (tabulation)' : csvConfig.csvSeparator;
  const quoteLabel = csvConfig.csvQuoteValues ? 'oui' : 'non';
  setStatus(`Format CSV: guillemets ${quoteLabel}, séparateur "${separatorLabel}".`);
}

setup();
