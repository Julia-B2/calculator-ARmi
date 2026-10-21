// blocks/elevators.js — Лифты: минимальное количество и параметры по СП/ГОСТ
// СП 54.13330.2022 (жилые здания), СП 118.13330 (общественные), ГОСТ 34758-2021,
// 181-ФЗ ст. 15 и СП 59.13330.2020 (лифт для МГН).
// N_лим = N_норм(этажность) или по пассажиропотоку Q; принятое — целое ≥ минимума.

import { toNumber, ceilInt, round } from "../utils.js";
import { item } from "../engine.js";

export function calculateElevators(norms, inputs) {
  const cfg = norms.elevators || {};
  const d = cfg.defaults || {};
  const floors = Math.max(1, Math.round(toNumber(inputs.floors, d.floors || 1)));
  const purpose = inputs.purpose === "public" ? "public" : "residential";
  const heightM = round(floors * (cfg.floorsHeightM || 3), 1);

  // Пассажиропоток в час пик: заданный или оценка = вместимость × коэффициент загрузки
  const capacity = toNumber(inputs.capacity, 0);
  const occupancy = toNumber(inputs.occupancy, 1);
  let flow = toNumber(inputs.passengerFlow, 0);
  let flowNote = "принят по заданию";
  if (flow <= 0 && capacity > 0) {
    flow = round(capacity * occupancy, 0);
    flowNote = "оценочно: вместимость × коэффициент загрузки (справочно, уточнить расчётом)";
  }

  // Минимальное количество по правилам этажности
  const rules = (cfg.rules && cfg.rules[purpose]) || [];
  let min = 0;
  let ruleNote = "";
  for (const r of rules) {
    if (r.maxFloors === null || r.maxFloors === undefined || floors <= r.maxFloors) {
      if (r.min === "flow") {
        min = Math.max(1, ceilInt(flow / (cfg.flowPerElevator || 500)));
      } else {
        min = toNumber(r.min, 0);
      }
      ruleNote = r.note || "";
      break;
    }
  }
  // Всегда: при этажности 2 и более — лифт для МГН (181-ФЗ, ст. 15)
  const mgnRequired = floors >= 2;
  if (mgnRequired && min === 0 && purpose === "public" && floors >= 2) min = 1;

  // Принятое количество: целое, не менее минимума, округление вверх
  const adoptedRaw = toNumber(inputs.adopted, 0);
  const adopted = Math.max(min, Math.ceil(adoptedRaw > 0 ? adoptedRaw : min));

  // Рекомендуемые параметры (типовые значения, сверяются с ТЗ/ГОСТ)
  const capRules = purpose === "residential" ? (cfg.capacityByFloors || []) : null;
  let recLoad = null;
  if (capRules) {
    for (const r of capRules) {
      if (r.maxFloors === null || r.maxFloors === undefined || floors <= r.maxFloors) { recLoad = r.kg; break; }
    }
  } else {
    recLoad = (cfg.capacityPublic && cfg.capacityPublic.kg) || null;
  }
  let recSpeed = null;
  for (const r of cfg.speedByFloors || []) {
    if (r.maxFloors === null || r.maxFloors === undefined || floors <= r.maxFloors) { recSpeed = r.mps; break; }
  }

  const load = toNumber(inputs.loadCapacity, d.loadCapacity || 400);
  const speed = toNumber(inputs.speed, d.speed || 1);

  const warnings = [];
  if (toNumber(inputs.adopted, 0) > 0 && toNumber(inputs.adopted, 0) < min) {
    warnings.push(`Принятое количество (${adoptedRaw}) меньше минимального по СП (${min}) — принято ${adopted}.`);
  }
  if (recLoad && load < recLoad) {
    warnings.push(`Грузоподъёмность ${load} кг меньше рекомендуемой ${recLoad} кг (${purpose === "residential" ? "СП 54.13330.2022" : "СП 118.13330; СП 59.13330.2020 (МГН)"}).`);
  }
  if (recSpeed && speed < recSpeed) {
    warnings.push(`Скорость ${speed} м/с меньше типовой ${recSpeed} м/с для ${floors} этажей.`);
  }
  if (flow <= 0 && purpose === "public" && floors >= 4) {
    warnings.push("Пассажиропоток не задан и не оценён (нет вместимости) — принято минимум 1 лифт; уточните расчётом.");
  }

  const items = [
    item("Этажность", "эт.", floors, "Проектные решения (ТЭП)"),
    item("Высота здания (справочно, ~3 м/эт.)", "м", heightM, "СП 54.13330.2022"),
    item("Пассажиропоток в час пик", "чел/ч", flow, flowNote),
    item("Минимальное количество лифтов (по СП)", "шт.", min, purpose === "residential" ? "СП 54.13330.2022" : "СП 118.13330; 181-ФЗ"),
    item("Принятое количество лифтов", "шт.", adopted, "Не менее минимума по СП; округление вверх"),
    item("Грузоподъёмность (принято)", "кг", load, "СП 118.13330; ГОСТ 34758-2021"),
    item("Скорость (принята)", "м/с", speed, "ГОСТ 34758-2021; ТЗ на проектирование")
  ];
  if (recLoad) items.push(item("Рекомендуемая грузоподъёмность", "кг", recLoad, purpose === "residential" ? "СП 54.13330.2022" : "СП 118.13330; СП 59.13330.2020"));
  if (recSpeed) items.push(item("Рекомендуемая скорость", "м/с", recSpeed, "Типовое значение по этажности"));

  const justification =
    `Минимальное количество лифтов определено по этажности ${floors} эт. (высота ~${heightM} м) для объекта «${purpose === "residential" ? "жилой (МКД)" : "общественный"}»: ${ruleNote || "—"} ` +
    (flow > 0 ? `Пассажиропоток в час пик принят ${flow} чел/ч (${flowNote}), расчёт — ${cfg.flowPerElevator || 500} чел/ч на лифт. ` : "") +
    `Принято лифтов: ${adopted} (целое, не менее минимума ${min}, округление вверх). ` +
    `Грузоподъёмность ${load} кг${recLoad ? ` (рекомендуется ≥ ${recLoad} кг)` : ""}, скорость ${speed} м/с${recSpeed ? ` (типовая ${recSpeed} м/с)` : ""}. ` +
    `При этажности 2 и более предусматривается лифт для маломобильных групп населения (181-ФЗ, ст. 15; СП 59.13330.2020). ` +
    `Требования к безопасности — ГОСТ 34758-2021. ${cfg.note || ""}`;

  return {
    title: cfg.title,
    document: cfg.document,
    inputs: { floors, purpose, flow, load, speed, adopted, capacity, occupancy },
    calc: { heightM, min, adopted, recLoad, recSpeed, flow, ruleNote },
    warnings,
    justification,
    items,
    refs: cfg.refs || []
  };
}
