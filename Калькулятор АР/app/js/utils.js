// utils.js — форматирование, округление, проверки

export function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const cleaned = String(value).replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

export function ceilInt(n) {
  return Math.ceil(toNumber(n, 0));
}

export function round(n, digits = 2) {
  const f = Math.pow(10, digits);
  return Math.round((toNumber(n, 0) + Number.EPSILON) * f) / f;
}

// Число для отображения: незначащие нули убираются
export function fmt(n, digits = 3) {
  if (!Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return String(n);
  return String(round(n, digits));
}

// Число с разделителем тысяч
export function fmtRu(n, digits = 3) {
  if (!Number.isFinite(n)) return "—";
  const s = fmt(n, digits);
  const [int, dec] = s.split(".");
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return dec ? `${intFmt},${dec}` : intFmt;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Значение поля input
export function fieldValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
