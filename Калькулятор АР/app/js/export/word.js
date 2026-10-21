// export/word.js — «Экспорт в Word» (спецификация): готовый раздел для пояснительной записки
// Файл .doc на основе Word-HTML (открывается в Microsoft Word / LibreOffice Writer).

import { fmtRu, escapeHtml, todayISO } from "../utils.js";
import { buildAssumptions } from "../summary.js";

// --- Тексты разделов по шаблону ТЗ ---
function secParking(p) {
  if (!p) return "Раздел не заполнен (расчёт машино-мест не выполнен).";
  const regionSrc = p.region?.source || "РНГП/МНГП региона";
  const cm = p.calcMeta || {};
  const parts = [];
  parts.push(`Количество машино-мест принято в соответствии с нормативами, установленными ${regionSrc}.`);
  parts.push(`Расчёт выполнен по нормативу «${cm.norm || "—"}» на единицу «${cm.unit || "—"}» (N_мм = N_норм × Q × K_корр).`);
  const extra = (p.additional || []).filter((a) => a.include).map((a) => `${a.name.toLowerCase()} — ${a.accepted}`);
  parts.push(`Принято ${fmtRu(p.total, 0)} машино-мест (постоянные — ${fmtRu(p.permanent?.Nn ?? 0, 0)}${p.objectPlaces > 0 ? `, приобъектные — ${fmtRu(p.objectPlaces, 0)}` : ""}${extra.length ? `; ${extra.join(", ")}` : ""}) с округлением вверх.`);
  const k = p.permanent?.k;
  const corr = cm.correction;
  const ks = [];
  if (k != null && k !== 1) ks.push(`k = ${k} (${p.reduction?.label || "по транспортной доступности"})`);
  if (corr != null && corr !== 1) ks.push(`K_корр = ${corr} (по заданию на проектирование)`);
  parts.push(`Учтены коэффициенты: ${ks.length ? ks.join(", ") : "не применялись (k = 1, K_корр = 1)"}, а также планировочная ситуация участка.`);
  if ((p.federalApplied || []).length) {
    parts.push(`Контроль федерального минимума (Приказ Минстроя РФ № 250/пр): повышены нормативы — ${p.federalApplied.join("; ")}; приняты федеральные значения.`);
  }
  if (p.mgn) parts.push(`Места для МГН: квота ${p.mgn.quota} шт. (не менее 10 % — ФЗ № 181-ФЗ, ст. 15); специализированные места — ${p.mgn.special} шт. (справочно).`);
  if (p.electricVehicles) parts.push(`Места с зарядной инфраструктурой — ${p.electricVehicles.places} шт. (справочно, в итог не входят).`);
  return parts.join(" ");
}

function secElevators(e) {
  if (!e) return "Раздел не заполнен (расчёт лифтов не выполнен).";
  const isPublic = e.inputs?.purpose === "public";
  const parts = [];
  parts.push(`Количество лифтов принято в соответствии с требованиями ${isPublic ? "СП 118.13330 (общественные здания)" : "СП 54.13330.2022 (здания жилые)"}; расчёт выполнен по этажности (${fmtRu(e.inputs.floors, 0)} эт., высота ~${fmtRu(e.calc.heightM, 1)} м)${e.calc.flow > 0 ? ` и пассажиропотоку в час пик ${fmtRu(e.calc.flow, 0)} чел/ч` : ""}.`);
  parts.push(`Требования безопасности — ГОСТ 34758-2021. Принято ${fmtRu(e.calc.adopted, 0)} лифтов (минимум по СП — ${fmtRu(e.calc.min, 0)}) грузоподъёмностью ${fmtRu(e.inputs.loadCapacity, 0)} кг, скоростью ${fmtRu(e.inputs.speed, 1)} м/с${e.calc.recLoad ? ` (рекомендуемая грузоподъёмность — не менее ${e.calc.recLoad} кг)` : ""}, с учётом обеспечения доступности для МГН (ФЗ № 181-ФЗ, ст. 15; СП 59.13330.2020).`);
  if (e.calc.ruleNote) parts.push(`Применённое правило: ${e.calc.ruleNote}.`);
  return parts.join(" ");
}

function secSocial(s) {
  if (!s) return "Раздел не заполнен (расчёт социальной обеспеченности не выполнен).";
  const c = s.calc;
  const parts = [];
  const regionRef = s.region ? `РНГП/МНГП региона «${s.region.label}»` : "РНГП/МНГП региона";
  parts.push(`Обеспеченность объектами социальной инфраструктуры рассчитана по нормативам, установленным ${regionRef} (зона «${s.zone?.label || "—"}»: ДОУ — ${s.zone?.douPer1000 ?? "—"}, школы — ${s.zone?.schoolPer1000 ?? "—"} мест на 1000 жителей).`);
  parts.push(`Расчётная численность населения принята ${fmtRu(c.population, 0)} чел. (${s.populationMethod === "types" ? "по типам квартир с учётом коэффициента семейности" : "по площади квартир"}).`);
  parts.push(`Требуемая обеспеченность — ${fmtRu(c.requiredPlaces, 0)} мест (ДОУ — ${fmtRu(c.dou, 0)}, школы — ${fmtRu(c.school, 0)}). Существующая — ${fmtRu(c.existing, 0)} мест.`);
  parts.push(
    c.deficitSurplus > 0
      ? `Дефицит — ${fmtRu(c.deficitSurplus, 0)} мест, который планируется компенсировать размещением недостающих объектов в пределах участка либо компенсационными мероприятиями в зоне обитания (выкуп мощностей, взнос по механизму КРТ) в рамках РНГП/ГПЗУ.`
      : c.deficitSurplus < 0
        ? `Избыток — ${fmtRu(-c.deficitSurplus, 0)} мест: существующая обеспеченность покрывает расчётную потребность.`
        : `Дефицит отсутствует либо сведения о существующей обеспеченности не заполнены.`
  );
  if (c.areaTotal > 0) parts.push(`Требуемая площадь помещений поликлиники — ${fmtRu(c.areaTotal, 0)} м² (СП 158.13330.2014).`);
  return parts.join(" ");
}

function secTko(t, stage) {
  if (!t) return "Раздел не заполнен (расчёт ТКО не выполнен).";
  const c = t.calc;
  const parts = [];
  parts.push(`Объём ТКО рассчитан по нормативу накопления n = ${fmtRu(t.inputs.n, 3)} м³/м²·год, утверждённому в порядке ФЗ № 89-ФЗ (санитарные требования — СанПиН 2.1.3684-21; СП 42.13330.2016, п. 7.1).`);
  parts.push(`Расчёт выполнен для стадии ${stage || "—"} по площади квартир ${fmtRu(t.inputs.S, 2)} м².`);
  parts.push(`Годовой объём — ${fmtRu(c.VyearSeason, 1)} м³/год${c.Kseason !== 1 ? ` (с учётом сезонного коэффициента K_сез = ${c.Kseason})` : ""}; среднесуточный — ${fmtRu(c.Vday, 2)} м³/сут.`);
  parts.push(`Масса — ${fmtRu(c.Myear, 2)} т/год (плотность принята по справочным данным ρ = ${c.density} т/м³; уточняется по данным регионального оператора ТКО).`);
  parts.push(`Требуемое количество контейнеров — ${fmtRu(c.Ncont, 0)} шт. (период вывоза ${fmtRu(t.inputs.T, 0)} сут., объём контейнера ${fmtRu(t.inputs.Vcont, 2)} м³, полезный объём с учётом заполнения — ${fmtRu(c.Vuseful, 2)} м³).`);
  return parts.join(" ");
}

export function buildWordDocument(result, meta) {
  const br = result.blockResults;
  const p = br.parking;
  const objectName = result.inputs?.objectName || "—";
  const regionLabel = p?.region?.label || br.social?.region?.label || "—";
  const stage = p?.inputs?.designStage || "—";
  const date = meta?.date || todayISO();
  const executor = meta?.executor || "—";
  const gip = meta?.gip || "—";
  const assumptions = buildAssumptions(br);
  const journal = result.normJournal && Array.isArray(result.normJournal.acts) ? result.normJournal : null;

  const li = (arr) => arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("");

  // Заголовок — только по фактически включённым разделам
  const titleParts = ["машино-местам", "лифтам"];
  if (br.social) titleParts.push("социальной обеспеченности");
  titleParts.push("обращению с ТКО");
  const titleList = titleParts.length > 1
    ? `${titleParts.slice(0, -1).join(", ")} и ${titleParts[titleParts.length - 1]}`
    : titleParts[0];

  // Раздел 3 (социальное обеспечение) включается только для жилья/МФН
  const sectionHtml = [];
  let sn = 0;
  if (p) sectionHtml.push(`<h2>${++sn}. Машино-места</h2>\n  <p>${escapeHtml(secParking(p))}</p>`);
  if (br.elevators) sectionHtml.push(`<h2>${++sn}. Лифты</h2>\n  <p>${escapeHtml(secElevators(br.elevators))}</p>`);
  if (br.social) sectionHtml.push(`<h2>${++sn}. Социальное обеспечение</h2>\n  <p>${escapeHtml(secSocial(br.social))}</p>`);
  if (br.tko) sectionHtml.push(`<h2>${++sn}. Обращение с ТКО</h2>\n  <p>${escapeHtml(secTko(br.tko, stage))}</p>`);

  let journalHtml = "";
  if (journal) {
    const probs = journal.acts.filter((a) => a.status !== "actual");
    journalHtml = `
      <h2>Актуальность нормативной базы</h2>
      <p>Проверка выполнена: ${escapeHtml(journal.when)}. Пользователь: ${escapeHtml(journal.user || "—")}.
      Проверено актов: ${journal.total}; требуют актуализации: ${journal.problems}.</p>
      ${probs.length ? `<p><strong>Требуется актуализация:</strong></p><ul>${li(probs.map((a) => `${a.code} — ${a.replacement || a.note || ""}`))}</ul>` : "<p>Все акты реестра имеют статус «Действует».</p>"}
      <p class="muted">Журнал проверки является подтверждением актуальности нормативной базы и прикладывается к обоснованию.</p>`;
  }

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>Обоснование проектных решений — ${escapeHtml(objectName)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  body { font-family: "Times New Roman", serif; font-size: 12pt; line-height: 1.3; }
  h1 { font-size: 14pt; text-align: center; }
  h2 { font-size: 13pt; }
  table { border-collapse: collapse; font-size: 11pt; }
  th, td { border: 1px solid #666; padding: 3px 6px; }
  .muted { color: #555; font-size: 10pt; }
  .sig { margin-top: 18px; }
</style>
</head>
<body>
  <h1>Раздел: Обоснование проектных решений по ${escapeHtml(titleList)}</h1>
  <p><strong>Объект:</strong> ${escapeHtml(objectName)}<br>
     <strong>Адрес / регион (РНГП/МНГП):</strong> ${escapeHtml(regionLabel)}<br>
     <strong>Тип объекта:</strong> ${escapeHtml(p?.objectType || "—")}<br>
     <strong>Стадия:</strong> ${escapeHtml(stage)}<br>
     <strong>Исполнитель:</strong> ${escapeHtml(executor)}<br>
     <strong>Проверено ГИП:</strong> ${escapeHtml(gip)}<br>
     <strong>Дата:</strong> ${escapeHtml(date)}</p>

  ${sectionHtml.join("\n\n  ")}

  <h2>Допущения и ограничения</h2>
  <ul>${li(assumptions)}</ul>

  ${journalHtml}

  <div class="sig">
    <p>Расчёт выполнил: ${escapeHtml(executor)} ______________________ / ______________ /<br>
       Проверил ГИП: ${escapeHtml(gip)} ______________________ / ______________ /</p>
  </div>
</body>
</html>`;
}

export function downloadWordDocument(result, meta) {
  const html = buildWordDocument(result, meta);
  const objectName = (result.inputs?.objectName || "объект").replace(/[\\/:*?"<>|]/g, "_");
  const blob = new Blob(["\uFEFF" + html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Пояснительная записка_${objectName}_${todayISO()}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
