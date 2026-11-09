// CSV export of the displayed page. Cells that start with = + - @ are prefixed
// with ' so spreadsheet apps don't execute them as formulas.
export function toCsv(rows, cols) {
  const cell = v => `"${String(v ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  return [cols.join(','), ...rows.map(r => cols.map(k => cell(r[k])).join(','))].join('\r\n');
}
export function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click(); URL.revokeObjectURL(url);
}
