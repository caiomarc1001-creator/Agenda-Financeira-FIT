/* Relatórios: PDF simples (tabela monoespaçada), DOC (HTML do Word), CSV e impressão. */
const DOC_STYLE = 'body{font-family:Arial,sans-serif;color:#111;padding:24px}h1{font-size:22px;margin:0 0 6px}p{margin:0 0 18px;color:#444}table{width:100%;border-collapse:collapse;font-size:10pt}th,td{border:1px solid #555;padding:7px;text-align:left;vertical-align:top}th{background:#e8eef8;font-weight:bold}';

const pdfText = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const pdfCell = (v, size) => { const t = pdfText(v); return t.length > size ? t.slice(0, Math.max(1, size - 1)) + '~' : t.padEnd(size, ' '); };

function downloadTablePdf(filename, title, subtitle, headers, rows, widths) {
  const line = row => row.map((v, i) => pdfCell(v, widths[i])).join(' | ');
  const lines = [pdfText(title), pdfText(subtitle), '', line(headers), widths.map(n => '-'.repeat(n)).join('-+-'), ...rows.map(line)];
  const pages = [];
  for (let i = 0; i < lines.length; i += 46) pages.push(lines.slice(i, i + 46));
  if (!pages.length) pages.push([pdfText(title)]);

  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>';
  pages.forEach((ls, i) => {
    const page = 4 + i * 2, content = ['BT', '/F1 8 Tf', '32 806 Td', '11 TL', ...ls.map((l, j) => `${j ? 'T* ' : ''}(${pdfText(l)}) Tj`), 'ET'].join('\n');
    objects[page] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page + 1} 0 R >>`;
    objects[page + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) { offsets[id] = pdf.length; pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n` + offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  download(filename, pdf, 'application/pdf');
}

function downloadDoc(filename, title, subtitle, headers, rows) {
  const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_STYLE}</style></head><body><h1>${esc(title)}</h1><p>${esc(subtitle)}</p><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
  download(filename, ['﻿', html], 'application/msword');
}

/* ---------- cirurgias ---------- */
function surgeryReport() {
  const items = filteredSurgeries();
  if (!items.length) { alert('Nenhuma cirurgia encontrada para os filtros selecionados.'); return null; }
  const from = $('surgeryPeriodFrom').value, to = $('surgeryPeriodTo').value;
  const period = from || to ? `${from ? dateBR(from) : 'início'} até ${to ? dateBR(to) : 'hoje'}` : 'Todos os períodos';
  return { subtitle: `${period} · ${items.length} registro(s)`, headers: ['Paciente', 'Atendimento', 'Data', 'Hospital', 'Pagamento'], rows: items.map(s => [s.patientName || '', s.attendanceNumber || '', dateBR(s.date || ''), s.hospital || '', surgeryStatusLabel(surgeryClass(s.paymentStatus))]) };
}
function surgeryDoc() {
  const r = surgeryReport();
  if (r) downloadDoc(`relatorio_cirurgias_${todayISO()}.doc`, 'Relatório de Cirurgias', r.subtitle.replace(/^/, 'Período: '), ['Nome do paciente', 'Atendimento', 'Data da cirurgia', 'Hospital', 'Status de pagamento'], r.rows);
}
function surgeryPdf() {
  const r = surgeryReport();
  if (r) downloadTablePdf(`relatorio_cirurgias_${todayISO()}.pdf`, 'Relatório de Cirurgias', r.subtitle, r.headers, r.rows, [26, 15, 12, 24, 16]);
}

/* ---------- comercial ---------- */
const COMMERCIAL_HEADERS = ['Data', 'Médico(s)', 'Paciente/Lead', 'Tipo', 'Status', 'Faturamento'];
function commercialRows() {
  const rows = reportRows();
  if (!rows.length) alert('Nenhum registro encontrado para os filtros selecionados.');
  return rows;
}
function commercialCsv() {
  const csv = [COMMERCIAL_HEADERS, ...reportRows().map(x => [x.date, x.doctor, x.name, x.type, x.status, x.amount.toFixed(2).replace('.', ',')])]
    .map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(';')).join('\n');
  download(`relatorio_comercial_${todayISO()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}
function commercialDoc() {
  const rows = commercialRows();
  if (rows.length) downloadDoc(`relatorio_comercial_${todayISO()}.doc`, 'Relatório comercial por médico', `Gerado em ${new Date().toLocaleString('pt-BR')} · ${rows.length} registro(s)`, COMMERCIAL_HEADERS, rows.map(x => [dateBR(x.date), x.doctor, x.name, x.type, x.status, fmtMoney(x.amount)]));
}
function commercialPdf() {
  const rows = commercialRows();
  if (rows.length) downloadTablePdf(`relatorio_comercial_${todayISO()}.pdf`, 'Relatório comercial por médico', `${rows.length} registro(s)`, COMMERCIAL_HEADERS, rows.map(x => [dateBR(x.date), x.doctor, x.name, x.type, x.status, fmtMoney(x.amount)]), [12, 23, 23, 10, 20, 15]);
}
function commercialPrint() {
  const rows = reportRows(), win = window.open('', '_blank', 'width=1000,height=760');
  if (!win) return alert('Permita pop-ups para imprimir o relatório.');
  win.document.write(`<html><head><meta charset="utf-8"><title>Relatório comercial</title><style>body{font:14px Arial;padding:24px;color:#111}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #bbb;text-align:left}h1{font-size:22px}</style></head><body><h1>Relatório comercial</h1><p>Gerado em ${new Date().toLocaleString('pt-BR')} · ${rows.length} registro(s)</p><table><thead><tr>${COMMERCIAL_HEADERS.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(x => `<tr><td>${esc(dateBR(x.date))}</td><td>${esc(x.doctor)}</td><td>${esc(x.name)}</td><td>${x.type}</td><td>${esc(x.status)}</td><td>${fmtMoney(x.amount)}</td></tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
  win.document.close();
}
