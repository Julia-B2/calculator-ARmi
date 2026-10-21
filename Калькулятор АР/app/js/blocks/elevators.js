// blocks/elevators.js — Лифты: минимальное число по таблице В.1 СП 54.13330.2022 и проверка расчёта по ГОСТ Р 52941
// СП 54.13330.2022 (п. 5.2, таблица 5.1; приложение В, таблица В.1, примечания 1–4), ГОСТ Р 52941-2012,
// 181-ФЗ (ст. 15) и СП 59.13330.2020 (лифт для МГН).

import { toNumber, ceilInt, round } from "../utils.js";
import { item } from "../engine.js";

// Строка таблицы В.1 по этажности
function pickTableRow(rows, floors) {
  const list = rows || [];
  const inRange = list.filter(
    (r) => (r.minFloors == null || floors >= r.minFloors) && (r.maxFloors == null || floors <= r.maxFloors)
  );
  if (inRange.length) return { rows: inRange, primary: inRange[0], above25: false };
  // Этажность выше 25 — таблица В.1 значений не содержит (расчёт по ГОСТ Р 52941)
  const last = list[list.length - 1];
  return { rows: last ? [last] : [], primary: last || null, above25: true };
}

export function calculateElevators(norms, inputs) {
  const cfg = norms.elevators || {};
  const d = cfg.defaults || {};
  const floors = Math.max(1, Math.round(toNumber(inputs.floors, d.floors || 1)));
  const purpose = inputs.purpose === "public" ? "public" : "residential";
  const heightM = round(floors * (cfg.floorsHeightM || 3), 1);

  // Пассажиропоток в час пик — справочный показатель (без норматива «1 лифт на 500 чел/ч»)
  const capacity = toNumber(inputs.capacity, 0);
  const occupancy = toNumber(inputs.occupancy, 1);
  let flow = toNumber(inputs.passengerFlow, 0);
  let flowNote = "принят по заданию";
  if (flow <= 0 && capacity > 0) {
    flow = round(capacity * occupancy, 0);
    flowNote = "оценочно: вместимость × коэффициент загрузки (справочно, уточнить расчётом)";
  }

  // --- Исходные данные для проверки ГОСТ Р 52941 (примечание 3 к таблице В.1) ---
  const basis = cfg.tableV1?.basis || { peopleArea: 18, floorHeight: 2.8, interval: "81–100 с" };
  const floorArea = toNumber(inputs.floorArea, 0); // наибольшая поэтажная площадь квартир, м²
  const floorHeight = toNumber(inputs.floorHeight, 0); // высота этажа, м
  const peopleArea = toNumber(inputs.peopleArea, 0); // общая площадь квартир на 1 проживающего, м²
  const mode = inputs.mode === "gost" ? "gost" : "table";

  // --- Минимальное число лифтов: таблица В.1 (жилые) / требование МГН (общественные) ---
  const rules = (cfg.rules && cfg.rules[purpose]) || [];
  let min = 0;
  let ruleNote = "";
  let tableRow = null;
  let tableRows = [];
  let exceedsFloorArea = false;
  let above25 = false;

  if (purpose === "residential") {
    const picked = pickTableRow(cfg.tableV1?.rows, floors);
    tableRows = picked?.rows || [];
    tableRow = picked?.primary || null;
    above25 = !!picked?.above25;
    if (tableRows.length > 1 && floorArea > 0) {
      // Строки 20–25 этажей различаются числом лифтов и предельной поэтажной площадью:
      // 3 лифта — 350 м², 4 лифта — 450 м². Берётся строка с наименьшим числом лифтов,
      // предельная площадь которой не меньше фактической.
      const fitting = tableRows.filter((r) => floorArea <= toNumber(r.maxFloorArea, Infinity));
      if (fitting.length) {
        tableRow = fitting.reduce((best, r) => (toNumber(r.minElevators, 0) < toNumber(best.minElevators, 0) ? r : best), fitting[0]);
      } else {
        tableRow = tableRows.reduce(
          (best, r) => (toNumber(r.maxFloorArea, 0) > toNumber(best.maxFloorArea, 0) ? r : best),
          tableRows[0]
        );
        exceedsFloorArea = true;
      }
    }
    min = toNumber(tableRow?.minElevators, 0);
    ruleNote = tableRow
      ? `СП 54.13330.2022, приложение В, таблица В.1: ${tableRow.label} — не менее ${tableRow.minElevators} лифт(ов), предельная поэтажная площадь квартир ${tableRow.maxFloorArea} м².`
      : "Требования к лифтам по таблице В.1 не определены.";
    if (above25) {
      ruleNote += ` ${cfg.tableV1?.above25Note || ""}`;
    }
  } else {
    for (const r of rules) {
      if (r.maxFloors === null || r.maxFloors === undefined || floors <= r.maxFloors) {
        min = toNumber(r.min, 0);
        ruleNote = r.note || "";
        break;
      }
    }
  }

  // Лифт для МГН в зданиях с этажностью 2 и более (181-ФЗ, ст. 15; СП 59.13330.2020)
  const mgnRequired = floors >= 2;
  if (mgnRequired && min === 0 && purpose === "public") min = 1;

  // --- Принятое количество ---
  const adoptedRaw = toNumber(inputs.adopted, 0);
  const adopted = Math.max(min, Math.ceil(adoptedRaw > 0 ? adoptedRaw : min));

  // --- Проверка исходных данных против принятых в таблице В.1 (примечание 3) ---
  const deviations = [];
  if (floorArea > 0 && tableRow && floorArea > toNumber(tableRow.maxFloorArea, Infinity)) {
    deviations.push(`поэтажная площадь квартир ${floorArea} м² превышает предельную по таблице В.1 (${tableRow.maxFloorArea} м²)`);
  }
  if (floorHeight > 0 && Math.abs(floorHeight - basis.floorHeight) > 0.05) {
    deviations.push(`высота этажа ${floorHeight} м отличается от принятой в расчёте таблицы В.1 (${basis.floorHeight} м)`);
  }
  if (peopleArea > 0 && Math.abs(peopleArea - basis.peopleArea) > 0.05) {
    deviations.push(`общая площадь квартир на одного проживающего ${peopleArea} м² отличается от принятой в расчёте таблицы В.1 (${basis.peopleArea} м²)`);
  }
  const gostRequired = mode === "gost" || deviations.length > 0;

  // --- Площади квартир по таблице 5.1 (п. 5.2 СП 54.13330.2022) ---
  const aptRows = cfg.apartmentAreas?.rows || [];
  const aptInput = inputs.apartmentAreas || {};
  const aptCheck = aptRows
    .map((r) => {
      const actual = toNumber(aptInput[String(r.rooms)], 0);
      if (!actual) return null;
      const diff = round(actual - r.sqm, 2);
      return { rooms: r.rooms, min: r.sqm, actual, diff, below: diff < 0 };
    })
    .filter(Boolean);
  const aptDeviation = aptCheck.some((x) => x.diff !== 0);

  // --- Рекомендуемые параметры ---
  let recLoad = null;
  if (purpose === "residential" && Array.isArray(tableRow?.capacities)) {
    recLoad = tableRow.capacities[0];
  } else if (purpose === "public") {
    recLoad = (cfg.capacityPublic && cfg.capacityPublic.kg) || null;
  }
  let recSpeed = null;
  if (purpose === "residential" && tableRow?.speed != null) {
    recSpeed = tableRow.speed;
  } else {
    for (const r of cfg.speedByFloors || []) {
      if (r.maxFloors === null || r.maxFloors === undefined || floors <= r.maxFloors) { recSpeed = r.mps; break; }
    }
  }

  const load = toNumber(inputs.loadCapacity, d.loadCapacity || 400);
  const speed = toNumber(inputs.speed, d.speed || 1);

  const warnings = [];
  if (adoptedRaw > 0 && adoptedRaw < min) {
    warnings.push(`Принятое количество (${adoptedRaw}) меньше минимального по таблице В.1 (${min}) — принято ${adopted}.`);
  }
  if (exceedsFloorArea) {
    warnings.push(`Поэтажная площадь квартир превышает предельную по таблице В.1 — требуется расчёт по ГОСТ Р 52941 (примечание 3).`);
  }
  if (deviations.length) {
    warnings.push(
      `Исходные данные отличаются от принятых при расчёте таблицы В.1: ${deviations.join("; ")}. ` +
      `Число, грузоподъёмность и скорость лифтов устанавливаются расчётом по ГОСТ Р 52941, при этом число лифтов принимается не менее ${min} (примечание 3).`
    );
  }
  if (aptCheck.some((x) => x.below)) {
    warnings.push(
      `Площадь квартир ниже минимальной по таблице 5.1 СП 54.13330.2022 (п. 5.2): ` +
      aptCheck.filter((x) => x.below).map((x) => `${x.rooms} комн. — ${x.actual} м² при норме ${x.min} м²`).join("; ") +
      `. Отклонение оформляется с обоснованием (ст. 50 ЖК РФ).`
    );
  } else if (aptDeviation) {
    warnings.push(
      `Площади квартир отличаются от минимальных по таблице 5.1 СП 54.13330.2022 (в сторону увеличения) — обоснование не требуется.`
    );
  }
  if (recLoad && load < recLoad) {
    warnings.push(`Грузоподъёмность ${load} кг меньше указанной по таблице В.1 (${recLoad} кг).`);
  }
  if (recSpeed && speed < recSpeed) {
    warnings.push(`Скорость ${speed} м/с меньше указанной по таблице В.1 (${recSpeed} м/с).`);
  }

  const items = [
    item("Этажность", "эт.", floors, "Проектные решения (ТЭП)"),
    item("Высота здания (справочно)", "м", heightM, "СП 54.13330.2022"),
    item("Пассажиропоток в час пик (справочно)", "чел/ч", flow, flowNote),
    item("Минимальное количество лифтов (табл. В.1)", "шт.", min, "СП 54.13330.2022, прил. В, табл. В.1"),
    item("Принятое количество лифтов", "шт.", adopted, "Не менее минимума по таблице В.1"),
    item("Грузоподъёмность (принято)", "кг", load, "СП 118.13330; ГОСТ 34758-2021"),
    item("Скорость (принята)", "м/с", speed, "ГОСТ 34758-2021; ТЗ на проектирование"),
    item("Предельная поэтажная площадь квартир по табл. В.1", "м²", toNumber(tableRow?.maxFloorArea, 0), "СП 54.13330.2022, прил. В, табл. В.1")
  ];
  if (recLoad) items.push(item("Грузоподъёмность по табл. В.1", "кг", recLoad, "СП 54.13330.2022, прил. В, табл. В.1"));
  if (recSpeed) items.push(item("Скорость по табл. В.1", "м/с", recSpeed, "СП 54.13330.2022, прил. В, табл. В.1"));

  // --- Обоснование (текст для пояснительной записки) ---
  const justParts = [];
  justParts.push(
    `Минимальное число лифтов определено по таблице В.1 приложения В СП 54.13330.2022 для здания этажностью ${floors} эт. (высота ~${heightM} м): ${ruleNote}`
  );
  if (gostRequired) {
    justParts.push(
      `Поскольку исходные данные отличаются от принятых при составлении таблицы В.1 ` +
      `(${deviations.length ? deviations.join("; ") : "указан режим расчёта по ГОСТ Р 52941"}), ` +
      `число, грузоподъёмность и скорость пассажирских лифтов приняты по расчёту ГОСТ Р 52941 ` +
      `при условии, что число лифтов не менее указанного в таблице В.1 (${min}).`
    );
  }
  justParts.push(
    `Принято лифтов: ${adopted} (целое, не менее минимума ${min}). ` +
    `Грузоподъёмность ${load} кг${recLoad ? ` (по таблице В.1 — ${recLoad} кг)` : ""}, скорость ${speed} м/с${recSpeed ? ` (по таблице В.1 — ${recSpeed} м/с)` : ""}. ` +
    `При этажности 2 и более предусматривается лифт для маломобильных групп населения (181-ФЗ, ст. 15; СП 59.13330.2020).`
  );
  if (aptCheck.length) {
    justParts.push(
      `Площади квартир по таблице 5.1 (п. 5.2 СП 54.13330.2022): ` +
      aptCheck.map((x) => `${x.rooms} комн. — ${x.actual} м² (норма ${x.min} м²${x.diff !== 0 ? `, отклонение ${x.diff > 0 ? "+" : "−"}${Math.abs(x.diff)} м²` : ""})`).join("; ") +
      `. Отклонения от минимальных площадей допускаются в соответствии со ст. 50 ЖК РФ с учётом демографических требований, ` +
      `уровня обеспеченности населения жильём и ресурсообеспеченности жилищного строительства; обоснование приводится в пояснительной записке.`
    );
  }
  justParts.push(
    `Результаты расчёта и обоснование приводятся в пояснительной записке к проектным решениям (в расчётах к планировочным решениям).`
  );
  const justification = justParts.join(" ");

  return {
    title: cfg.title,
    document: cfg.document,
    inputs: {
      floors, purpose, flow, load, speed, adopted, capacity, occupancy,
      mode, floorArea, floorHeight, peopleArea, apartmentAreas: aptInput
    },
    calc: {
      heightM,
      min,
      adopted,
      recLoad,
      recSpeed,
      flow,
      ruleNote,
      tableRow,
      tableRows,
      exceedsFloorArea,
      above25,
      gostRequired,
      deviations,
      apartmentCheck: aptCheck,
      apartmentDeviation: aptDeviation
    },
    warnings,
    justification,
    items,
    refs: cfg.refs || []
  };
}
