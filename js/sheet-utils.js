(function (global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    const api = factory();
    const existing = global.PetrioleseSheets || {};
    global.PetrioleseSheets = Object.assign(existing, api);
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const gvizCsvURL = (fileId, gid) =>
    `https://docs.google.com/spreadsheets/d/${fileId}/gviz/tq?gid=${encodeURIComponent(gid ?? '0')}&headers=1&tqx=out:csv`;

  const exportCsvURL = (fileId, gid) =>
    `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv&id=${fileId}&gid=${encodeURIComponent(gid ?? '0')}`;

  function pubCsvURL(pubhtmlUrl) {
    if (!pubhtmlUrl) return null;
    try {
      const u = new URL(pubhtmlUrl);
      const gid = u.searchParams.get('gid') || '0';
      const parts = u.pathname.split('/');
      const idIdx = parts.findIndex((p) => p === 'e') + 1;
      const id = parts[idIdx] || '';
      const root = `${u.protocol}//${u.host}${parts.slice(0, idIdx).join('/')}/${id}`;
      return `${root}/pub?gid=${encodeURIComponent(gid)}&single=true&output=csv`;
    } catch (err) {
      console.warn('[PetrioleseSheets] Invalid pub URL', err);
      return null;
    }
  }

  function parseCSV(text) {
    let t = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const lines = t.split('\n').filter((ln, i) => i === 0 || ln.trim().length > 0);
    if (!lines.length) return [];
    const rows = [];
    let row = [];
    let cur = '';
    let inQ = false;
    const pushCell = () => {
      row.push(cur);
      cur = '';
    };
    const pushRow = () => {
      rows.push(row);
      row = [];
    };
    const s = lines.join('\n');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      const n = s[i + 1];
      if (inQ) {
        if (c === '"' && n === '"') {
          cur += '"';
          i++;
        } else if (c === '"') {
          inQ = false;
        } else {
          cur += c;
        }
      } else if (c === '"') {
        inQ = true;
      } else if (c === ',') {
        pushCell();
      } else if (c === '\n') {
        pushCell();
        pushRow();
      } else {
        cur += c;
      }
    }
    if (cur !== '' || row.length) {
      pushCell();
      pushRow();
    }
    const header = (rows.shift() || []).map((h) => String(h || '').trim());
    return rows.map((r) =>
      Object.fromEntries(header.map((h, i) => [h, r[i] !== undefined ? r[i] : '']))
    );
  }

  async function fetchCsvPrefer(fileId, gid, pubUrl) {
    const tryFetch = async (url) => {
      if (!url) return null;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        const text = await res.text();
        return parseCSV(text);
      } catch (err) {
        console.warn('[PetrioleseSheets] Fetch failed', url, err);
        return null;
      }
    };

    let lastRows = null;
    const gvizUrl = fileId && gid !== undefined && gid !== null ? gvizCsvURL(fileId, gid) : null;
    const pubUrlCsv = pubCsvURL(pubUrl);
    const exportUrl = fileId && gid !== undefined && gid !== null ? exportCsvURL(fileId, gid) : null;

    let rows = await tryFetch(gvizUrl);
    if (rows) {
      if (rows.length) return rows;
      lastRows = rows;
    }

    rows = await tryFetch(pubUrlCsv);
    if (rows) {
      if (rows.length) return rows;
      lastRows = rows;
    }

    rows = await tryFetch(exportUrl);
    if (rows) return rows;

    return lastRows || [];
  }

  function normalizeMeta(rows) {
    const m = new Map();
    rows.forEach((r) => {
      const keys = Object.keys(r);
      if (!keys.length) return;
      const keyK = keys.find((k) => /^(key|chiave)$/i.test(k)) || keys[0];
      const valK = keys.find((k) => /^(value|valore|val)$/i.test(k)) || keys[1] || keys[0];
      const k = ('' + (r[keyK] || '')).trim().toLowerCase();
      const v = ('' + (r[valK] || '')).trim();
      if (k) m.set(k, v);
    });
    return m;
  }

  function normalizeOpp(rows) {
    const out = new Map();
    rows.forEach((r) => {
      const name = ('' + (r.Squadra || r.squadra || '')).trim();
      const url = ('' + (r.Logo || r.logo || '')).trim();
      if (name) out.set(name.toLowerCase(), url);
    });
    return out;
  }

  function slugify(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function resolveLogoSrc(teamName, oppMap) {
    const name = (teamName || '').trim();
    if (!name) return '';
    const fromSheet = oppMap?.get?.(name.toLowerCase()) || '';
    if (fromSheet) return fromSheet;
    return `logos/${slugify(name)}.webp`;
  }

  function setLogo(imgEl, src, alt) {
    if (!imgEl) return;
    if (!src) {
      imgEl.style.visibility = 'hidden';
      return;
    }
    imgEl.alt = alt || '';
    imgEl.crossOrigin = 'anonymous';
    imgEl.src = src;
    imgEl.onload = () => {
      imgEl.style.visibility = 'visible';
    };
    imgEl.onerror = () => {
      imgEl.style.visibility = 'hidden';
    };
  }

  function parseDateTimeIT(dateStr, timeStr) {
    const s = String(dateStr || '').trim();
    const t = String(timeStr || '').trim();
    if (!s) return null;
    const combined = s.includes(':') ? s : t ? `${s} ${t}` : s;
    const m1 = combined.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
    const m2 = combined.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
    let y;
    let M;
    let d;
    let h = 15;
    let min = 0;
    if (m1) {
      d = +m1[1];
      M = +m1[2] - 1;
      y = +m1[3];
      if (m1[4]) {
        h = +m1[4];
        min = +m1[5];
      }
    } else if (m2) {
      y = +m2[1];
      M = +m2[2] - 1;
      d = +m2[3];
      if (m2[4]) {
        h = +m2[4];
        min = +m2[5];
      }
    } else {
      const fallback = new Date(s);
      if (!Number.isNaN(+fallback)) return fallback;
      return null;
    }
    return new Date(y, M, d, h, min, 0, 0);
  }

  return {
    gvizCsvURL,
    exportCsvURL,
    pubCsvURL,
    parseCSV,
    fetchCsvPrefer,
    normalizeMeta,
    normalizeOpp,
    slugify,
    resolveLogoSrc,
    setLogo,
    parseDateTimeIT,
  };
});
