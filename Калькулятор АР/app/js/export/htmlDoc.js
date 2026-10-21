// export/htmlDoc.js — формирование единого итогового документа (автономный HTML)

import { fmtRu, escapeHtml, todayISO } from "../utils.js";
import { buildSummaryRows, SUMMARY_HEADERS, buildAssumptions } from "../summary.js";

function table(headers, rows) {
  const th = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const trs = rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td>${c === null || c === undefined ? "" : escapeHtml(String(c))}</td>`).join("")}</tr>`
    )
    .join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

// 0. Сводная таблица показателей (спецификация output.summary_table)
function blockSummary(result) {
  const br = result.blockResults;
  const regionLabel = br.parking?.region?.label || br.social?.region?.label || "регион";
  const rows = buildSummaryRows(br, regionLabel);
  if (!rows.length) return "";
  return `
  <h2>Сводная таблица проектных показателей</h2>
  ${table(SUMMARY_HEADERS, rows)}
  `;
}

function blockParking(b) {
  if (!b) return "";
  const isResidential = (b.objectType || "жилой") === "жилой";
  const permHeader = isResidential
    ? ["Группа квартир", "Кол-во квартир, шт.", "Коэффициент", "Машино-места"]
    : ["Функция объекта", "Метод расчёта", "База, мест", "Пункт НД"];
  const permRows = b.permanent.byGroups.map((g) =>
    isResidential
      ? [g.label, fmtRu(g.count, 0), g.coefficient, fmtRu(g.spaces, 0)]
      : [g.label, g.coefficient, fmtRu(g.spaces, 1), g.refPoint]
  );
  if (isResidential) {
    permRows.push(["Итого постоянных ММ", fmtRu(b.permanent.sumF, 0), "", fmtRu(b.permanent.Nn, 0)]);
  } else {
    (b.objectCalc?.coefficients || []).forEach((c) => {
      permRows.push([c.name, `× ${c.k}`, fmtRu(c.after, 2), c.ref]);
    });
    permRows.push(["Итого постоянных ММ (после коэффициентов, ceil)", "", fmtRu(b.permanent.Nn, 0), "РНГП/МНГП региона"]);
  }
  const regionInfo = b.region
    ? `<p class="muted">Регион (РНГП/МНГП): <strong>${escapeHtml(b.region.label)}</strong> — ${escapeHtml(b.region.source || "")}. Тип объекта: <strong>${escapeHtml(b.objectType || "жилой")}</strong>.</p>`
    : "";

  // Блок «Дополнительно»: Гостевые ММ
  const extraRows = b.additional.map((a) => [
    a.name, fmtRu(a.accepted, 0), a.note || (a.rounding === "ceil" ? "Округление вверх" : "—"), a.refPoint || "—"
  ]);

  // Блок «Электромобили»
  const evRows = b.electricVehicles
    ? [[
        "Места с зарядной инфраструктурой",
        fmtRu(b.electricVehicles.places, 0),
        `${Math.round(b.electricVehicles.percent * 100)} % от постоянных машино-мест; округление вверх`,
        b.electricVehicles.refPoint
      ]]
    : [];

  // Блок «МГН»: квота и специализированные места — справочно
  const mgnRows = [];
  if (b.mgn) {
    mgnRows.push(["Квота мест для МГН (10 %)", fmtRu(b.mgn.quota, 0), "Включительно или по ТЗ", "181-ФЗ, ст. 15"]);
    mgnRows.push(["Специализированные места для МГН (6,0 × 3,6 м)", fmtRu(b.mgn.special, 0), "Справочно, по шкале СП 59.13330.2020; в итог не входят", "СП 59.13330.2020, п. 5.2.1"]);
  }

  const refRows = (b.refs || []).map((r) => [r.point, r.requirement, r.applied]);

  // Приобъектные ММ (БКТ / Функции)
  let objectHtml = "";
  if (b.objectFacilities && b.objectFacilities.maxScenario) {
    const of = b.objectFacilities;
    const maxSc = of.maxScenario;
    const isBkt = maxSc.mode === "bkt";
    const ofRows = isBkt
      ? maxSc.functions.map((f) => [f.label, fmtRu(f.S, 0), f.K, fmtRu(f.raw, 3)])
      : maxSc.functions.map((f) => [f.label, fmtRu(f.S, 0), f.K, fmtRu(f.raw, 3)]);
    ofRows.push(["Итого Σ (S/100 × K)", "", "", fmtRu(maxSc.sumRaw, 3)]);
    ofRows.push([`С учётом f = ${maxSc.f} → мест`, "", "", fmtRu(maxSc.places, 0)]);
    const scenRows = of.results.map((r) => [r.label, r.mode === "bkt" ? "БКТ" : "Функционал", r.f, fmtRu(r.afterF, 3), fmtRu(r.places, 0)]);
    const regionInfo = of.region
      ? `<p class="muted">Регион (нормативная база): <strong>${escapeHtml(of.region.label)}</strong> — ${escapeHtml(of.region.source || "")}</p>`
      : "";
    objectHtml = `
    <h3>1.2. Приобъектные (коммерция)</h3>
    ${regionInfo}
    <p class="muted">Формула: N = S / 100 × K × f. «БКТ» — один общий K на весь объект; «Функционал» — разбивка по функциональным группам. Коэффициенты K — справочные (из нормативной базы региона).</p>
    ${table(["Функция / показатель", "Площадь S_i, м²", "K_i, мест/100 м²", "Машино-мест"], ofRows)}
    <p>Принятый сценарий (максимум): ${escapeHtml(maxSc.label)} [${isBkt ? "БКТ" : "Функционал"}] → <strong>${fmtRu(maxSc.places, 0)} машино-мест</strong></p>
    ${table(["Сценарий использования", "Режим", "Коэффициент f", "N_баз после f", "Мест"], scenRows)}
    `;
  }

  // Габариты — справочным текстом (без таблицы)
  const dimStandard = b.mgn?.refs?.dimensions?.standard || "5,3 × 2,5 м (приложение А к СП 113.13330.2023)";
  const dimSpecial = b.mgn?.refs?.dimensions?.special || "6,0 × 3,6 м; вдоль проезжей части длина 6,8 м (СП 59.13330.2020, п. 5.2.4; СП 113.13330.2023, п. 5.6)";

  return `
  <h2>1. Машиноместа</h2>
  <p><strong>Нормативная база:</strong> ${escapeHtml(b.document?.fullTitle || "")}</p>
  ${regionInfo}
  <h3>1.1. Постоянные машино-места</h3>
  ${table(permHeader, permRows)}
  <p class="muted">${
    isResidential && b.permanent?.k && b.permanent.k !== 1
      ? `Понижающий коэффициент применён: ${escapeHtml(b.reduction?.label || "")} (k = ${b.permanent.k}). N = ⌈N_расч × k⌉.`
      : isResidential
        ? "Справочно: понижающий коэффициент по РНГП/МНГП региона не применён (k = 1)."
        : "Коэффициенты объекта (ОТ / МФН / совместное использование) — в таблице выше."
  }</p>
  ${objectHtml}
  <h3>1.3. Гостевые (жильцы)</h3>
  ${table(["Показатель", "Значение", "Примечание", "Пункт НД"], extraRows)}
  <h3>1.4. Электромобили</h3>
  ${table(["Показатель", "Значение", "Примечание", "Пункт НД"], evRows)}
  <p class="muted">Справочно, инженерная инфраструктура: ${escapeHtml(b.electricVehicles?.infrastructureNote || "кабель-каналы или шинопроводы учесть на 100 % машино-мест.")}</p>
  <h3>1.5. МГН</h3>
  ${table(["Показатель", "Значение", "Примечание", "Пункт НД"], mgnRows)}
  <p class="muted"><strong>Справочно, габариты машино-места:</strong></p>
  <ul class="muted">
    <li>Габариты обычного места: ${escapeHtml(dimStandard)}</li>
    <li>Габариты специализированного места: ${escapeHtml(dimSpecial)}</li>
  </ul>
  <h3>1.6. Итоговая потребность</h3>
  <p><strong>${fmtRu(b.total, 0)} машино-мест</strong></p>
  <p>Формула: ${escapeHtml(b.totalFormula)}</p>
  <h3>1.7. Нормативное обоснование</h3>
  ${b.justification ? `<h4>Текстовое обоснование для экспертизы</h4><div class="justification">${escapeHtml(b.justification)}</div>` : ""}
  ${table(["Пункт", "Требование", "Учёт в расчёте"], refRows)}
  `;
}

// 2. Лифты (спецификация: elevators)
function blockElevators(b) {
  if (!b) return "";
  const rows = b.items.map((i) => [i.name, i.unit, fmtRu(i.value, 3), i.refPoint || "—"]);
  const refRows = (b.refs || []).map((r) => [r.point, r.requirement, r.applied]);
  const warnRows = (b.warnings || []).map((w) => `<li>${escapeHtml(w)}</li>`).join("");
  return `
  <h2>2. Лифты</h2>
  <p><strong>Нормативная база:</strong> ${escapeHtml(b.document?.fullTitle || b.document?.code || "")}</p>
  <p><strong>Назначение:</strong> ${b.inputs.purpose === "public" ? "общественный (школа / поликлиника / офис / ТЦ)" : "жилой (МКД)"}; этажность — ${fmtRu(b.inputs.floors, 0)} эт. (высота ~${fmtRu(b.calc.heightM, 1)} м).</p>
  <h3>2.1. Результаты расчёта</h3>
  ${table(["Показатель", "Ед. изм.", "Значение", "Пункт НД"], rows)}
  <p><strong>Принято лифтов: ${fmtRu(b.calc.adopted, 0)} шт. (минимум по СП — ${fmtRu(b.calc.min, 0)}, округление вверх)</strong></p>
  ${b.calc.ruleNote ? `<p class="muted">${escapeHtml(b.calc.ruleNote)}</p>` : ""}
  ${warnRows ? `<h4>Примечания и предупреждения</h4><ul>${warnRows}</ul>` : ""}
  <h3>2.2. Текстовое обоснование</h3>
  <div class="justification">${escapeHtml(b.justification || "")}</div>
  <h3>2.3. Нормативные ссылки</h3>
  ${table(["Пункт", "Требование", "Учёт в расчёте"], refRows)}
  `;
}

function blockTko(b) {
  if (!b) return "";
  const c = b.calc;
  const rows = b.items.map((i) => [i.name, i.unit, fmtRu(i.value, 3), i.refPoint || "—"]);
  const refRows = (b.refs || []).map((r) => [r.point, r.requirement, r.applied]);
  const fracRows = (b.fractions || []).map((f) => [f.label, fmtRu(f.percent, 0), fmtRu(f.volume, 1), fmtRu(f.mass, 2)]);
  if (fracRows.length) {
    const pctSum = (b.fractions || []).reduce((s, f) => s + Number(f.percent || 0), 0);
    fracRows.push(["Итого", fmtRu(pctSum, 0), fmtRu(c.VyearSeason, 1), fmtRu(c.Myear, 2)]);
  }
  return `
  <h2>4. ТКО</h2>
  <p><strong>Нормативная база:</strong> ${escapeHtml(b.document?.fullTitle || "")}</p>
  <h3>4.1. Результаты расчёта</h3>
  ${table(["Показатель", "Ед. изм.", "Значение", "Пункт НД"], rows)}
  ${fracRows.length ? `<h3>4.2. Разбивка по фракциям (справочно)</h3>${table(["Фракция", "Доля, %", "Объём, м³/год", "Масса, т/год"], fracRows)}<p class="muted">${escapeHtml(b.fractionsNote || "")}</p>` : ""}
  <h3>4.3. Нормативные ссылки</h3>
  ${table(["Пункт", "Требование", "Учёт в расчёте"], refRows)}
  `;
}

function blockSocial(b) {
  if (!b) return "";
  const rows = b.items.map((i) => [i.name, i.unit, fmtRu(i.value, 3), i.refPoint || "—"]);
  const refRows = (b.refs || []).map((r) => [r.point, r.requirement, r.applied]);
  const notes = (b.notes || []).map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  const methodLabel = b.populationMethod === "types" ? "по типам квартир" : "по площади квартир";
  const aptRows = (b.types || []).map((t) => [t.label, fmtRu(t.count, 0), t.coefficient, fmtRu(t.people, 2)]);
  return `
  <h2>3. Социальное обеспечение</h2>
  <p><strong>Нормативная база:</strong> ${escapeHtml(b.document?.fullTitle || "")}</p>
  <p><strong>Метод расчёта населения:</strong> ${escapeHtml(methodLabel)}. <strong>Зона:</strong> ${escapeHtml(b.zone?.label || "")} (ДОУ — ${escapeHtml(String(b.zone?.douPer1000 ?? ""))}, школы — ${escapeHtml(String(b.zone?.schoolPer1000 ?? ""))} мест/1000 жителей).</p>
  <h3>3.1. Квартирография</h3>
  ${table(["Тип квартиры", "Кол-во, шт.", "Коэф. семейности", "Население, чел."], aptRows)}
  <h3>3.2. Результаты расчёта</h3>
  ${table(["Показатель", "Ед. изм.", "Значение", "Пункт НД"], rows)}
  <h3>3.3. Вывод по обеспеченности</h3>
  <div class="justification">${escapeHtml(b.conclusion || "")}</div>
  <h3>3.4. Примечания и рекомендации</h3>
  <ul>${notes}</ul>
  <h3>3.5. Нормативные ссылки</h3>
  ${table(["Пункт", "Требование", "Учёт в расчёте"], refRows)}
  `;
}

// --- Допущения и ограничения (спецификация) ---
function blockAssumptions(result) {
  const list = buildAssumptions(result.blockResults);
  if (!list.length) return "";
  const rows = list.map((x, i) => [i + 1, x]);
  return `<h2>Допущения и ограничения</h2>${table(["№", "Допущение / ограничение"], rows)}`;
}

// --- Журнал проверки нормативной базы (спецификация: прикладывается к обоснованию) ---
function blockJournal(result) {
  const j = result.normJournal;
  if (!j || !Array.isArray(j.acts)) return "";
  const label = (s) => (s === "actual" ? "Действует" : s === "changed" ? "Изменён / заменён" : "Отменён");
  const rows = j.acts.map((a) => [a.code, label(a.status), a.note || a.replacement || "—", a.recommend || "—"]);
  return `<h2>Журнал проверки нормативной базы</h2>
  <p>Проверка выполнена: ${escapeHtml(j.when)} · Пользователь: ${escapeHtml(j.user || "—")} ·
     Проверено актов: ${j.total} · Требуют актуализации: ${j.problems}.</p>
  ${table(["Акт", "Статус", "Примечание / замена", "Рекомендация"], rows)}
  <p class="muted">Журнал подтверждает актуальность нормативной базы на дату расчёта и указывается в конечном отчёте.</p>`;
}

export function buildHtmlDocument(result) {
  const br = result.blockResults;
  const objectName = result.inputs?.objectName || "—";
  const regionLabel = br.parking?.region?.label || br.social?.region?.label || "—";
  const objectType = br.parking?.objectType || "—";
  const stage = br.parking?.inputs?.designStage || "—";
  const meta = result.meta || {};
  const assumptions = buildAssumptions(br);
  const journal = result.normJournal;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Расчёт проектных показателей — ${escapeHtml(objectName)}</title>
<style>
  body { font-family: "Times New Roman", Georgia, serif; color: #111; margin: 32px; line-height: 1.45; }
  h1 { font-size: 22px; text-align: center; margin-bottom: 4px; }
  h2 { font-size: 18px; border-bottom: 1px solid #999; padding-bottom: 4px; margin-top: 28px; }
  h3 { font-size: 15px; margin-top: 18px; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px; }
  th, td { border: 1px solid #999; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #eee; }
  .meta { text-align: center; color: #444; margin-bottom: 20px; font-size: 13px; }
  ul { font-size: 13px; }
  h4 { font-size: 14px; margin: 14px 0 6px; }
  .justification { background: #f6f7f9; border: 1px solid #ccc; padding: 10px 14px; font-size: 13px; line-height: 1.55; white-space: pre-wrap; }
</style>
</head>
<body>
  <h1>Расчёт проектных показателей</h1>
  <div class="meta">
    Объект: ${escapeHtml(objectName)}<br>
    Регион (РНГП/МНГП): ${escapeHtml(regionLabel)} · Тип объекта: ${escapeHtml(objectType)} · Стадия: ${escapeHtml(stage)}<br>
    Исполнитель: ${escapeHtml(meta.executor || "—")} · Проверено ГИП: ${escapeHtml(meta.gip || "—")} · Дата расчёта: ${escapeHtml(meta.date || todayISO())}<br>
    Разделы: Сводная таблица · Машиноместа · Лифты${br.social ? " · Социальное обеспечение" : ""} · ТКО · Допущения${journal ? " · Журнал проверки норм" : ""}
  </div>
  ${blockSummary(result)}
  ${blockParking(br.parking)}
  ${blockElevators(br.elevators)}
  ${blockSocial(br.social)}
  ${blockTko(br.tko)}
  ${blockAssumptions(result)}
  ${blockJournal(result)}
</body>
</html>`;
}

export function downloadHtmlDocument(result) {
  const html = buildHtmlDocument(result);
  const objectName = (result.inputs?.objectName || "объект").replace(/[\\/:*?"<>|]/g, "_");
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Расчёт проектных показателей_${objectName}_${todayISO()}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
