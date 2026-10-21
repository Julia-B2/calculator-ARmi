// export/csv.js — «Экспорт в Excel» (спецификация: CSV с автооткрытием в Excel)
// Колонки: Показатель, Значение, Единицы, Обоснование, Норматив, Дата расчёта, Исполнитель, ГИП

import { buildSummaryRows, SUMMARY_HEADERS } from "../summary.js";
import { todayISO } from "../utils.js";

export function buildSummaryCsv(result, meta) {
  const br = result.blockResults;
  const regionLabel = br.parking?.region?.label || br.social?.region?.label || "регион";
  const rows = buildSummaryRows(br, regionLabel);
  const head = [...SUMMARY_HEADERS, "Дата расчёта", "Исполнитель", "ГИП"];
  const date = meta?.date || todayISO();
  const executor = meta?.executor || "—";
  const gip = meta?.gip || "—";
  const body = rows.map((r) => [...r, date, executor, gip]);

  const esc = (v) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [head, ...body].map((r) => r.map(esc).join(";")).join("\r\n");
}

export function downloadSummaryCsv(result, meta) {
  const csv = buildSummaryCsv(result, meta);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const name = (result.inputs?.objectName || "объект").replace(/[\\/:*?"<>|]/g, "_");
  a.href = url;
  a.download = `Сводная таблица_${name}_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
