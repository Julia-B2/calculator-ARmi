// normcheck.js — проверка актуальности нормативной базы (спецификация: кнопка «Проверить на актуальность норм»)
// Офлайн-реестр актов хранится в norms.legalActs. Статус и журнал сохраняются до конца сессии (sessionStorage).

import { escapeHtml, todayISO } from "./utils.js";

const STORAGE_KEY = "ar_norm_check_journal";
const STATUS_LABELS = { actual: "Действует", changed: "Изменён / заменён", cancelled: "Отменён" };
let lastJournal = null;

function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function getLastJournal() {
  return lastJournal;
}

// Восстановить статус после загрузки страницы (до следующего запуска сессии)
export function restoreJournal() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        lastJournal = parsed.find((x) => x && x.acts) || null;
      } else if (parsed && parsed.acts) {
        lastJournal = parsed;
      }
    }
  } catch (_) {
    /* приватный режим и т.п. */
  }
  return lastJournal;
}

function saveJournal() {
  try {
    const list = [lastJournal, ...(JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]") || [])].slice(0, 20);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (_) {
    /* игнорируем */
  }
}

function allJournals() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]") || [];
  } catch (_) {
    return lastJournal ? [lastJournal] : [];
  }
}

// --- Отрисовка: статус-пилюля, список изменений, журнал ---
export function renderNormCheck(norms) {
  const pill = document.getElementById("normStatus");
  const changesBox = document.getElementById("normChanges");
  const tbody = document.querySelector("#normJournal tbody");
  const j = lastJournal;

  if (pill) {
    if (j && Array.isArray(j.acts) && j.problems === 0) {
      pill.textContent = `Проверено — ${j.when}`;
      pill.className = "status-pill ok";
    } else if (j && Array.isArray(j.acts)) {
      pill.textContent = `Требуется актуализация (${j.problems})`;
      pill.className = "status-pill bad";
    } else {
      pill.textContent = "Статус не проверен";
      pill.className = "status-pill muted-pill";
    }
  }
  if (changesBox) {
    if (j && Array.isArray(j.acts) && j.problems > 0) {
      changesBox.hidden = false;
      changesBox.innerHTML =
        `<h4>Список изменений и реквизиты замены</h4><ul>` +
        j.acts
          .filter((a) => a.status !== "actual")
          .map(
            (a) =>
              `<li><strong>${escapeHtml(a.code)}</strong> — ${escapeHtml(STATUS_LABELS[a.status] || a.status)}. ` +
              `${a.replacement ? `Замена: ${escapeHtml(a.replacement)}. ` : ""}` +
              `${a.recommend ? `Рекомендация: ${escapeHtml(a.recommend)}.` : ""}</li>`
          )
          .join("") +
        `</ul><p class="muted">Выполните пересчёт затронутых разделов и приложите журнал проверки к обоснованию.</p>`;
    } else if (changesBox) {
      changesBox.hidden = true;
      changesBox.innerHTML = "";
    }
  }
  if (tbody) {
    const list = allJournals();
    const rows = [];
    list.forEach((entry) => {
      entry.acts.forEach((a) => {
        rows.push([entry.when, entry.user || "—", a.code, STATUS_LABELS[a.status] || a.status, a.note || a.replacement || "—"]);
      });
    });
    tbody.innerHTML = rows.length
      ? rows
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r[0])}</td><td>${escapeHtml(r[1])}</td><td>${escapeHtml(r[2])}</td>` +
              `<td class="${r[3] === "Действует" ? "st-ok" : "st-bad"}">${escapeHtml(r[3])}</td><td>${escapeHtml(r[4])}</td></tr>`
          )
          .join("")
      : `<tr><td colspan="5" class="muted">Журнал пуст — выполните проверку норм.</td></tr>`;
  }
}

// --- Запуск проверки (эмуляция по реестру + задержка со спиннером) ---
export function runNormCheck(norms, userName, done) {
  const btn = document.getElementById("btnCheckNorms");
  if (!btn) return;
  const labelSpan = btn.querySelector(".btn-label");
  const spinner = btn.querySelector(".spinner");
  const original = labelSpan ? labelSpan.textContent : btn.textContent;

  btn.disabled = true;
  if (labelSpan) labelSpan.textContent = "Проверяю нормы…";
  else btn.textContent = "Проверяю нормы…";
  if (spinner) spinner.hidden = false;

  setTimeout(() => {
    const acts = (norms?.legalActs || []).map((a) => ({
      id: a.id,
      code: a.code,
      title: a.title || "",
      status: a.status || "actual",
      note: a.note || "",
      replacement: a.replacement || "",
      recommend: a.recommend || ""
    }));
    lastJournal = {
      when: nowStr(),
      dateISO: todayISO(),
      user: userName || "—",
      acts,
      problems: acts.filter((a) => a.status !== "actual").length,
      total: acts.length
    };
    saveJournal();
    renderNormCheck(norms);
    btn.disabled = false;
    if (labelSpan) labelSpan.textContent = original;
    else btn.textContent = original;
    if (spinner) spinner.hidden = true;
    if (done) done(lastJournal);
  }, 1200);
}

// --- Выгрузка журнала в CSV ---
export function downloadJournalCsv() {
  const list = allJournals();
  if (!list.length) {
    alert("Журнал пуст — сначала выполните проверку норм.");
    return;
  }
  const head = ["Дата проверки", "Пользователь", "Акт", "Статус", "Примечание / замена", "Рекомендация"];
  const rows = [];
  list.forEach((entry) => {
    entry.acts.forEach((a) => {
      rows.push([entry.when, entry.user || "—", a.code, STATUS_LABELS[a.status] || a.status, a.note || a.replacement || "—", a.recommend || "—"]);
    });
  });
  const esc = (v) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "\uFEFF" + [head, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Журнал проверки норм_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
