// export/xlsx.js — экспорт в XLSX (SheetJS, локально) с резервом на CSV

import { todayISO } from "../utils.js";
import { buildSummaryRows, SUMMARY_HEADERS } from "../summary.js";

function sheetFromRows(rows) {
  return rows;
}

function buildSheets(result) {
  const br = result.blockResults;
  const sheets = {};

  // 0. Сводная таблица показателей (output.summary_table)
  {
    const regionLabel = br.parking?.region?.label || br.social?.region?.label || "регион";
    const rows = buildSummaryRows(br, regionLabel);
    const meta = result.meta || {};
    const head = [
      [],
      ["Дата расчёта", meta.date || todayISO()],
      ["Исполнитель", meta.executor || "—"],
      ["Проверено ГИП", meta.gip || "—"],
      []
    ];
    if (rows.length) sheets["Сводная"] = sheetFromRows([SUMMARY_HEADERS, ...head, ...rows]);
  }

  // Журнал проверки нормативной базы (если проверка выполнялась)
  if (result.normJournal && Array.isArray(result.normJournal.acts)) {
    const j = result.normJournal;
    const label = (s) => (s === "actual" ? "Действует" : s === "changed" ? "Изменён / заменён" : "Отменён");
    sheets["Журнал проверки"] = sheetFromRows([
      ["Журнал проверки нормативной базы"],
      ["Дата проверки", j.when],
      ["Пользователь", j.user || "—"],
      ["Проверено актов", j.total],
      ["Требуют актуализации", j.problems],
      [],
      ["Акт", "Статус", "Примечание / замена", "Рекомендация"],
      ...j.acts.map((a) => [a.code, label(a.status), a.note || a.replacement || "—", a.recommend || "—"])
    ]);
  }

  if (br.parking) {
    const b = br.parking;
    const isResidential = (b.objectType || "жилой") === "жилой";
    const rows = [
      [b.document?.fullTitle || "РНГП/МНГП региона"],
      ...(b.region ? [[`Регион (РНГП/МНГП): ${b.region.label}`, b.region.source || ""]] : []),
      [`Тип объекта: ${b.objectType || "жилой"}`],
      [],
      ["Расчётные показатели (N_мм = N_норм × Q × K_корр)", "", "", ""],
      ["Норматив машино-мест", b.calcMeta?.norm || "—"],
      ["Расчётная единица", b.calcMeta?.unit || "—"],
      ["Коэффициент корректировки (K_корр)", b.calcMeta?.correction ?? 1],
      ["Итого машино-мест (расчёт)", b.calcMeta?.calculated ?? "—"],
      ["Принятое количество (ceil)", b.calcMeta?.adopted ?? "—"],
      [],
      ["1.1. Постоянные машино-места", "", "", ""],
      isResidential
        ? ["Группа квартир", "Кол-во квартир, шт.", "Коэффициент", "Машино-места"]
        : ["Функция объекта", "Метод расчёта", "База, мест", "Пункт НД"],
      ...b.permanent.byGroups.map((g) =>
        isResidential ? [g.label, g.count, g.coefficient, g.spacesRawK] : [g.label, g.coefficient, g.spaces, g.refPoint]
      ),
      ...(isResidential
        ? [
            ...(b.permanent.invalidPlaces > 0
              ? [["В том числе места постоянного размещения для инвалидов", "", "1 место / квартиру", b.permanent.invalidPlaces]]
              : []),
            ["Итого постоянных ММ (округление итога вверх)", b.permanent.sumF, "", b.permanent.Nn]
          ]
        : [
            ...(b.objectCalc?.coefficients || []).map((c) => [c.name, `× ${c.k}`, c.after, c.ref]),
            ["Итого постоянных ММ (после коэффициентов, ceil)", "", b.permanent.Nn, "РНГП/МНГП региона"]
          ]),
      [isResidential
        ? (b.permanent.k && b.permanent.k !== 1
            ? `Допустимое отклонение применено: ${b.deviation?.label || ""} (k = ${b.permanent.k}). N = ⌈N_расч × k⌉ (п. 6.2.4.1; отклонение более 10 % — решение ГЗК Москвы, п. 6.2.4.2).`
            : "Справочно: отклонение от расчётного числа мест не применяется (k = 1,0) — п. 6.2.4.1 ПП № 945-ПП.")
        : "Коэффициенты объекта (ОТ / МФН / совместное использование) — в таблице выше."],
      ...(isResidential && b.permanent.method
        ? [[`Метод расчёта: ${b.permanent.methodLabel || b.permanent.method}`, `Формула: ${b.permanent.formula || ""}`]]
        : []),
      []
    ];

    if (b.objectFacilities && b.objectFacilities.maxScenario) {
      const of = b.objectFacilities;
      const maxSc = of.maxScenario;
      rows.push(["1.2. Приобъектные (коммерция)"]);
      if (of.region) {
        rows.push([`Регион (нормативная база): ${of.region.label}`, of.region.source || ""]);
      }
      rows.push(["Формула: Nв = X / X2 × К1 × К2 (приложение 6 ПП № 945-ПП; X2 — приложение 1)"]);
      rows.push([`Основание расчёта: ${of.basis || ""}`]);
      if (of.k1Note) rows.push([of.k1Note]);
      if (of.k2Note) rows.push([of.k2Note]);
      rows.push(["Сценарий", "Режим", "База Σ", "После К1 и К2", "Отклонение", "Мест"]);
      rows.push(...of.results.map((r) => [
        r.label, r.mode === "bkt" ? "БКТ" : "Функционал", r.sumRaw, r.withK, of.deviation?.label || "не применяется", r.places
      ]));
      rows.push([`Принят максимум: ${maxSc.label} [${maxSc.mode === "bkt" ? "БКТ" : "Функционал"}]`]);
      rows.push(["Функция / показатель", "Площадь S_i, м²", "Расчётная база", "X2, м²/место", "Машино-мест"]);
      rows.push(...maxSc.functions.map((f) => [f.label, f.S, f.basis, f.x2 ?? "—", f.raw]));
      rows.push(["Итого Σ (база)", "", "", "", maxSc.sumRaw]);
      rows.push([`С учётом К1 = ${of.k1} и К2 = ${of.k2} → мест`, "", "", "", maxSc.places]);
      rows.push([]);
    }

    rows.push(["1.3. Гостевые (жильцы)"]);
    rows.push(["Показатель", "Значение", "Примечание", "Пункт НД"]);
    rows.push(...b.additional.map((a) => [
      a.name, a.accepted, a.note || (a.rounding === "ceil" ? "Округление вверх" : "—"), a.refPoint
    ]));
    rows.push([]);

    rows.push(["1.4. Электромобили"]);
    rows.push(["Показатель", "Значение", "Примечание", "Пункт НД"]);
    if (b.electricVehicles) {
      rows.push([
        "Места с зарядной инфраструктурой",
        b.electricVehicles.places,
        `${Math.round(b.electricVehicles.percent * 100)} % от постоянных машино-мест; округление вверх`,
        b.electricVehicles.refPoint
      ]);
    }
    rows.push([`Справочно, инженерная инфраструктура: ${b.electricVehicles?.infrastructureNote || "кабель-каналы или шинопроводы учесть на 100 % машино-мест."}`]);
    rows.push([]);

    rows.push(["1.5. МГН"]);
    rows.push(["Показатель", "Значение", "Примечание", "Пункт НД"]);
    if (b.mgn) {
      rows.push(["Квота мест для МГН (10 %)", b.mgn.quota, "Включительно или по ТЗ", "181-ФЗ, ст. 15"]);
      rows.push(["Специализированные места для МГН (6,0 × 3,6 м)", b.mgn.special, "Справочно, по шкале СП 59.13330.2020; в итог не входят", "СП 59.13330.2020, п. 5.2.1"]);
      rows.push(["Специализированные места из гостевой парковки", b.mgn.specOfGuest, "10 % от числа гостевых мест (справочно)", "СП 59.13330.2020, п. 5.2.1"]);
      rows.push(["Специализированные места из приобъектной парковки", b.mgn.specOfObject, "10 % от числа приобъектных мест (справочно)", "СП 59.13330.2020, п. 5.2.1"]);
    }
    rows.push([]);
    rows.push(["Справочно, габариты машино-места:"]);
    rows.push([`Габариты обычного места: ${b.mgn?.refs?.dimensions?.standard || "5,3 × 2,5 м (приложение А к СП 113.13330.2023)"}`]);
    rows.push([`Габариты специализированного места: ${b.mgn?.refs?.dimensions?.special || "6,0 × 3,6 м; вдоль проезжей части длина 6,8 м (СП 59.13330.2020, п. 5.2.4; СП 113.13330.2023, п. 5.6)"}`]);
    rows.push([]);

    rows.push(["1.6. Итоговая потребность, шт.", b.total]);
    rows.push(["Формула", b.totalFormula]);
    rows.push([]);
    if ((b.items || []).length) {
      rows.push(["1.7. Итоговые показатели"]);
      rows.push(["Показатель", "Ед. изм.", "Значение", "Пункт НД"]);
      rows.push(...b.items.map((i) => [i.name, i.unit, i.value, i.refPoint || ""]));
      rows.push([]);
    }
    rows.push(["1.8. Нормативное обоснование"]);
    if (b.justification) {
      b.justification.split("\n\n").forEach((p) => rows.push([p]));
      rows.push([]);
    }
    (b.refs || []).forEach((r) => rows.push([r.point, r.requirement, r.applied]));
    sheets["Машиноместа"] = sheetFromRows(rows);
  }

  if (br.elevators) {
    const b = br.elevators;
    sheets["Лифты"] = sheetFromRows([
      [b.document?.code || "СП 54.13330.2022; СП 118.13330; ГОСТ 34758-2021"],
      [`Назначение: ${b.inputs.purpose === "public" ? "общественный" : "жилой (МКД)"}`, `Этажность: ${b.inputs.floors} эт.`],
      [],
      ["Показатель", "Ед. изм.", "Значение", "Пункт НД"],
      ...b.items.map((i) => [i.name, i.unit, i.value, i.refPoint]),
      [],
      [`Принято лифтов: ${b.calc.adopted} шт. (минимум по СП: ${b.calc.min}, округление вверх)`],
      ...(b.calc.ruleNote ? [[b.calc.ruleNote]] : []),
      [],
      ["Текстовое обоснование"],
      ...(b.justification ? b.justification.split("\n\n").map((p) => [p]) : []),
      [],
      ["Нормативные ссылки"],
      ...(b.refs || []).map((r) => [r.point, r.requirement, r.applied]),
      ...(b.warnings || []).map((w) => ["Примечание:", w])
    ]);
  }

  if (br.tko) {
    const b = br.tko;
    const fracRows = (b.fractions || []).map((f) => [f.label, `${f.percent} %`, f.volume, f.mass]);
    sheets["ТКО"] = sheetFromRows([
      [b.document?.fullTitle || ""],
      [],
      ["Показатель", "Ед. изм.", "Значение", "Пункт НД"],
      ...b.items.map((i) => [i.name, i.unit, i.value, i.refPoint]),
      ...(fracRows.length
        ? [
            [],
            ["Разбивка по фракциям (справочно)"],
            ["Фракция", "Доля, %", "Объём, м³/год", "Масса, т/год"],
            ...fracRows,
            ["Итого", `${(b.fractions || []).reduce((s, f) => s + Number(f.percent || 0), 0)} %`, b.calc.VyearSeason, b.calc.Myear],
            [b.fractionsNote || ""]
          ]
        : [])
    ]);
  }

  if (br.social) {
    const b = br.social;
    const d = b.calc.deficitSurplus;
    const dTxt = d > 0 ? `−${d} (дефицит)` : d < 0 ? `+${Math.abs(d)} (избыток)` : "0 (нет дефицита)";
    sheets["Соцобеспечение"] = sheetFromRows([
      [b.document?.fullTitle || ""],
      [],
      ["Показатель", "Ед. изм.", "Значение", "Пункт НД"],
      ...b.items.map((i) => [i.name, i.unit, i.value, i.refPoint]),
      [],
      [`Дефицит / избыток: ${dTxt} (существующие: ${b.calc.existing})`],
      ["Вывод по обеспеченности"],
      [b.conclusion || ""],
      [],
      ["Примечания"],
      ...(b.notes || []).map((n) => [n])
    ]);
  }

  return sheets;
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(result) {
  const sheets = buildSheets(result);
  let out = "";
  for (const [name, rows] of Object.entries(sheets)) {
    out += `### ${name}\n`;
    out += rows.map((r) => r.map(csvEscape).join(";")).join("\n");
    out += "\n\n";
  }
  const blob = new Blob(["\ufeff" + out], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Расчёт проектных показателей_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportXlsx(result) {
  const sheets = buildSheets(result);

  if (typeof window.XLSX === "undefined") {
    // Резерв: CSV (открывается в Excel)
    downloadCsv(result);
    return { format: "csv" };
  }

  const wb = window.XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    window.XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  window.XLSX.writeFile(wb, `Расчёт проектных показателей_${todayISO()}.xlsx`);
  return { format: "xlsx" };
}
