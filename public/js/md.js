/* Markdown mini: judul, paragraf, daftar, kode, tabel, kutipan, tebal/miring, tautan.
   Semua HTML dari sumber di-escape dulu, jadi aman untuk teks dari AI. */
(function (root) {
'use strict';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function inline(s) {
  const keep = [];
  const hold = html => { keep.push(html); return '\u0000' + (keep.length - 1) + '\u0000'; };
  s = esc(s).replace(/`([^`]+)`/g, (_, c) => hold(`<code>${c}</code>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => /^(https?:|mailto:|#|\/|\.\/|docs\/)/.test(u) || !/^[a-z]+:/i.test(u)
         ? hold(`<a href="${u}"${/^https?:/.test(u) ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`) : t)
       .replace(/(^|[\s(>*])(https?:\/\/[^\s<)*]+[^\s<)*.,;:])/g, (_, a, u) => a + hold(`<a href="${u}" target="_blank" rel="noopener">${u}</a>`))
       .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
       .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
       .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[i]);
}
function render(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let out = '', i = 0;
  const isTableSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; out += `<pre><code>${esc(buf.join('\n'))}</code></pre>`; continue;
    }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { const n = m[1].length + 1; out += `<h${n}>${inline(m[2])}</h${n}>`; i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out += '<hr>'; i++; continue; }
    if (l.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(l); i += 2; let rows = '';
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows += '<tr>' + cells(lines[i]).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>'; i++; }
      out += `<div class="tbl"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`; continue;
    }
    if (/^>\s?/.test(l)) {
      const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out += `<blockquote>${render(buf.join('\n'))}</blockquote>`; continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const ordered = /^\s*\d+[.)]/.test(l); const items = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        let t = lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''); i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) t += ' ' + lines[i++].trim();
        items.push(`<li>${inline(t)}</li>`);
      }
      out += ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`; continue;
    }
    if (!l.trim()) { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>\s?|\s*([-*•]|\d+[.)])\s+)/.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) buf.push(lines[i++]);
    out += `<p>${buf.map(inline).join('<br>')}</p>`;
  }
  return out;
}
root.MD = { render, esc, inline };
})(window);
