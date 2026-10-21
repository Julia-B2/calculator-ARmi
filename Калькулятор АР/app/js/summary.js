// summary.js — единая сводная таблица итогов (спецификация output.summary_table)
// колонки: Показатель · Значение · Единицы · Обоснование · Норматив
// Используется в UI (вкладка «Итог»), HTML- и XLSX-выгрузках.

import { fmtRu } from "./utils.js";

export const SUMMARY_HEADERS = ["Показатель", "Значение", "Единицы", "Обоснование", "Норматив"];

/**
 * @param {object} br — blockResults (последний расчёт)
 * @param {string} regionLabel — подпись региона (для РНГП/МНГП)
 * @returns {Array<[string,string,string,string,string]>}
 */
export function buildSummaryRows(br, regionLabel) {
  const rows = [];
  if (!br) return rows;
  const regionRef = `${regionLabel || "регион"} — РНГП/МНГП`;

  if (br.parking) {
    rows.push(["Машиноместа — итоговая потребность", fmtRu(br.parking.total, 0), "шт.",
      "Сумма постоянных и дополнительных, округление вверх", regionRef]);
    rows.push(["Машиноместа — постоянные", fmtRu(br.parking.permanent.Nn, 0), "шт.",
      br.parking.objectType === "жилой" ? "Квартирография × k × K_корр" : "Объектный расчёт (максимум по функциям)", regionRef]);
    if (br.parking.objectPlaces > 0) rows.push(["Машиноместа — в т.ч. приобъектные (БКТ)", fmtRu(br.parking.objectPlaces, 0), "шт.",
      "Максимум из сценариев (БКТ / функционал)", regionRef]);
    if (br.parking.mgn) {
      rows.push(["Машиноместа — квота для МГН (10 %)", fmtRu(br.parking.mgn.quota, 0), "шт.",
        "Не менее 10 % от общего числа мест", "181-ФЗ, ст. 15"]);
      rows.push(["Машиноместа — специализированные места", fmtRu(br.parking.mgn.special, 0), "шт.",
        "Габариты 6,0 × 3,6 м; справочно, в итог не входят", "СП 59.13330.2020, п. 5.2.1"]);
    }
  }
  if (br.elevators) {
    rows.push(["Лифты — принято", fmtRu(br.elevators.calc.adopted, 0), "шт.",
      `Не менее минимума по СП (${br.elevators.calc.min}); округление вверх`, "СП 54.13330.2022; СП 118.13330; ГОСТ 34758-2021"]);
    rows.push(["Лифты — минимальное количество по СП", fmtRu(br.elevators.calc.min, 0), "шт.",
      `Этажность ${br.elevators.inputs.floors} эт.; ${(br.elevators.calc.ruleNote || "").slice(0, 160)}`, "СП 54.13330.2022; СП 118.13330"]);
  }
  if (br.tko) {
    rows.push(["ТКО — требуемое количество контейнеров", fmtRu(br.tko.calc.Ncont, 0), "шт.",
      "Округление вверх; период вывоза и полезный объём контейнера", "СанПиН 2.1.3684-21, п. 3"]);
    rows.push(["ТКО — объём в год", fmtRu(br.tko.calc.VyearSeason, 1), "м³/год",
      `V_год = N × Q${br.tko.calc.Kseason !== 1 ? ` × K_сез (${br.tko.calc.Kseason})` : ""}`, "СанПиН 2.1.3684-21; СП 42.13330.2016, п. 7.1"]);
    rows.push(["ТКО — масса в год", fmtRu(br.tko.calc.Myear, 2), "т/год",
      `M_год = V_год × ρ (ρ = ${br.tko.calc.density} т/м³)`, "Региональные акты о нормативах накопления ТКО; ФЗ № 89-ФЗ"]);
  }
  if (br.social) {
    rows.push(["Соцобеспечение — расчётное население", fmtRu(br.social.calc.population, 0), "чел.",
      br.social.populationMethod === "types" ? "По типам квартир × коэффициент семейности" : "По площади квартир", "ПП № 2152-ПП / РНГП региона"]);
    rows.push(["Соцобеспечение — ДОУ", fmtRu(br.social.calc.dou, 0), "мест",
      `${br.social.zone?.douPer1000} мест/1000 чел.; округление вверх`, `${regionRef}; ПП № 2151-ПП в ред. № 921-ПП`]);
    rows.push(["Соцобеспечение — школы", fmtRu(br.social.calc.school, 0), "мест",
      `${br.social.zone?.schoolPer1000} мест/1000 чел.; округление вверх`, regionRef]);
    rows.push(["Соцобеспечение — дефицит/избыток", fmtRu(br.social.calc.deficitSurplus, 0), "мест",
      "Требуемые (ДОУ + школы) − существующие", `${regionRef}; РНГП/ГПЗУ`]);
    if (br.social.calc.areaTotal > 0) {
      rows.push(["Соцобеспечение — площадь поликлиники", fmtRu(br.social.calc.areaTotal, 0), "м²",
        "Посещения в смену × площадь на посещение", "СП 158.13330.2014"]);
    }
  }
  return rows;
}

// --- Допущения и ограничения (спецификация: отдельный блок с описанием применённых коэффициентов) ---
export function buildAssumptions(br) {
  const a = [];
  if (!br) return a;
  if (br.parking) {
    const p = br.parking;
    if (p.reduction?.k != null && p.reduction.k !== 1) {
      a.push(`Понижающий коэффициент по транспортной доступности: ${p.reduction.label} (k = ${p.reduction.k}).`);
    }
    if (p.calcMeta?.correction != null && p.calcMeta.correction !== 1) {
      a.push(`Применён коэффициент корректировки K_корр = ${p.calcMeta.correction} (по заданию на проектирование).`);
    }
    (p.objectCalc?.coefficients || []).forEach((c) => {
      a.push(`Коэффициент «${c.name}» × ${c.k}: ${c.ref || "обоснование"}${c.effect ? ` (${c.effect})` : ""}.`);
    });
    const guest = (p.additional || []).find((x) => x.type === "percentOfPermanent");
    if (guest) a.push(`Гостевые машино-места приняты ${Math.round(guest.percent * 100)} % от постоянных (${guest.refPoint || "РНГП/МНГП"}).`);
    if (p.electricVehicles) a.push(`Места с зарядной инфраструктурой — ${Math.round(p.electricVehicles.percent * 100)} % от постоянных (справочно, в итог не входят).`);
    if (p.mgn) a.push(`Квота мест для МГН — ${p.mgn.quota} шт. (не менее 10 %); специализированные места ${p.mgn.special} шт. учтены справочно.`);
    if ((p.federalApplied || []).length) a.push(`Контроль федерального минимума (Приказ № 250/пр): повышены — ${p.federalApplied.join("; ")}.`);
  }
  if (br.elevators) {
    const e = br.elevators;
    a.push(`Лифты: принято ${e.calc.adopted} шт. (минимум по СП — ${e.calc.min}); грузоподъёмность ${e.inputs.loadCapacity} кг, скорость ${e.inputs.speed} м/с${e.calc.ruleNote ? `; правило: ${e.calc.ruleNote}` : ""}.`);
    if (e.calc.flow > 0) a.push(`Пассажиропоток в час пик принят ${e.calc.flow} чел/ч (по заданию либо оценочно по вместимости × коэффициенту загрузки).`);
  }
  if (br.tko) {
    const t = br.tko;
    if (t.calc.Kseason !== 1) a.push(`Учтён сезонный коэффициент накопления ТКО K_сез = ${t.calc.Kseason}.`);
    a.push(`Плотность ТКО принята ρ = ${t.calc.density} т/м³ (справочное значение; уточнить по данным регионального оператора).`);
    a.push(`Разбивка по фракциям — типовая, справочная; актуальный состав ТКО утверждается для региона.`);
  }
  if (br.social) {
    const s = br.social;
    a.push(`Население принято ${s.calc.population} чел. (${s.populationMethod === "types" ? "по типам квартир" : "по площади квартир"}), зона «${s.zone?.label || "—"}».`);
    a.push(`Существующая обеспеченность принята ${s.calc.existing} мест (по данным заказчика/справочно).`);
  }
  a.push(`Значения региональных нормативов (РНГП/МНГП) в базе калькулятора — рабочие, требуют сверки с действующими редакциями актов субъекта РФ.`);
  return a;
}
