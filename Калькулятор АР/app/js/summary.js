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
      "Сумма постоянных, гостевых и приобъектных; округление вверх", regionRef]);
    rows.push(["Машиноместа — постоянные", fmtRu(br.parking.permanent.Nn, 0), "шт.",
      br.parking.objectType === "жилой"
        ? `${br.parking.permanent.formula || "Nп = A×N1 + B×N2 + C×N3"}; округление итога вверх`
        : "Объектный расчёт (максимум по функциям)", "ПП № 945-ПП, прил. 5"]);
    const guest = (br.parking.additional || []).find((a) => a.id === "guest");
    if (guest && guest.accepted > 0) rows.push(["Машиноместа — гостевые", fmtRu(guest.accepted, 0), "шт.",
      "10 % от числа постоянных мест", "ПП № 945-ПП, п. 6.2.3.2"]);
    if (br.parking.objectPlaces > 0) rows.push(["Машиноместа — в т.ч. приобъектные", fmtRu(br.parking.objectPlaces, 0), "шт.",
      `Nв = X / X2 × К1 × К2; максимум из сценариев`, "ПП № 945-ПП, прил. 6"]);
    if (br.parking.electricVehicles?.places > 0) rows.push(["Машиноместа — с зарядной инфраструктурой", fmtRu(br.parking.electricVehicles.places, 0), "шт.",
      `${Math.round(br.parking.electricVehicles.percent * 100)} % от постоянных (справочно, в итог не входят)`, br.parking.electricVehicles.refPoint || "НГП/РНГП региона"]);
    if (br.parking.mgn) {
      rows.push(["Машиноместа — квота для МГН (10 %)", fmtRu(br.parking.mgn.quota, 0), "шт.",
        "Не менее 10 % от общего числа мест", "181-ФЗ, ст. 15"]);
      rows.push(["Машиноместа — специализированные места", fmtRu(br.parking.mgn.special, 0), "шт.",
        "Габариты 6,0 × 3,6 м; справочно, в итог не входят", "СП 59.13330.2020, п. 5.2.1"]);
      if (br.parking.mgn.specOfGuest > 0) rows.push(["Машиноместа — спец. места из гостевой парковки", fmtRu(br.parking.mgn.specOfGuest, 0), "шт.",
        "10 % от числа гостевых мест (справочно)", "СП 59.13330.2020, п. 5.2.1"]);
      if (br.parking.mgn.specOfObject > 0) rows.push(["Машиноместа — спец. места из приобъектной парковки", fmtRu(br.parking.mgn.specOfObject, 0), "шт.",
        "10 % от числа приобъектных мест (справочно)", "СП 59.13330.2020, п. 5.2.1"]);
    }
    if (br.parking.permanent?.invalidPlaces > 0) rows.push(["Машиноместа — места постоянного размещения для инвалидов", fmtRu(br.parking.permanent.invalidPlaces, 0), "шт.",
      "Выделяются из числа постоянных мест: 1 место на квартиру для инвалидов", "ПП № 945-ПП, п. 6.2.3.7"]);
  }
  if (br.elevators) {
    rows.push(["Лифты — принято", fmtRu(br.elevators.calc.adopted, 0), "шт.",
      `Не менее минимума по таблице В.1 (${br.elevators.calc.min}); округление вверх`, "СП 54.13330.2022, прил. В, табл. В.1"]);
    rows.push(["Лифты — минимальное количество по табл. В.1", fmtRu(br.elevators.calc.min, 0), "шт.",
      `Этажность ${br.elevators.inputs.floors} эт.; ${(br.elevators.calc.ruleNote || "").slice(0, 160)}`, "СП 54.13330.2022, прил. В, табл. В.1"]);
    if (br.elevators.calc.gostRequired) rows.push(["Лифты — расчёт по ГОСТ Р 52941", "Требуется", "—",
      "Исходные данные отличаются от принятых в таблице В.1; число лифтов — не менее табл. В.1", "ГОСТ Р 52941; примечание 3 к табл. В.1"]);
  }
  if (br.tko) {
    rows.push(["ТКО — требуемое количество контейнеров", fmtRu(br.tko.calc.Ncont, 0), "шт.",
      "Округление вверх; период вывоза и полезный объём контейнера", "СанПиН 2.1.3684-21, п. 3"]);
    rows.push(["ТКО — объём в год", fmtRu(br.tko.calc.VyearSeason, 1), "м³/год",
      `V_год = N × Q${br.tko.calc.Kseason !== 1 ? ` × K_сез (${br.tko.calc.Kseason})` : ""}`, "СанПиН 2.1.3684-21; СП 42.13330.2026, прил. Ж"]);
    rows.push(["ТКО — масса в год", fmtRu(br.tko.calc.Myear, 2), "т/год",
      `M_год = V_год × ρ (ρ = ${br.tko.calc.density} т/м³)`, "Региональные акты о нормативах накопления ТКО; ФЗ № 89-ФЗ"]);
  }
  if (br.social) {
    rows.push(["Соцобеспечение — расчётное население", fmtRu(br.social.calc.population, 0), "чел.",
      br.social.populationMethod === "types" ? "По типам квартир × коэффициент семейности (справочно)"
        : br.social.populationMethod === "area" ? "По общей площади квартир (справочно)"
        : `СПП жилой части / ${br.social.inputs?.sqmPerPerson} м²/чел.`, "ПП № 2152-ПП, п. 1.4.2"]);
    rows.push(["Соцобеспечение — ДОУ", fmtRu(br.social.calc.dou, 0), "мест",
      `${br.social.zone?.douPer1000} мест/1000 чел.; округление вверх`, "ПП № 2151-ПП в ред. № 921-ПП, табл. 1.4.1"]);
    rows.push(["Соцобеспечение — школы", fmtRu(br.social.calc.school, 0), "мест",
      `${br.social.zone?.schoolPer1000} мест/1000 чел.; округление вверх`, "ПП № 2151-ПП в ред. № 921-ПП, табл. 1.4.2"]);
    rows.push(["Соцобеспечение — дефицит/избыток", fmtRu(br.social.calc.deficitSurplus, 0), "мест",
      "Требуемые (ДОУ + школы) − существующие", `${regionRef}; РНГП/ГПЗУ`]);
    if (br.social.calc.douBuilding > 0) rows.push(["Соцобеспечение — площадь здания ДОУ", fmtRu(br.social.calc.douBuilding, 0), "м²",
      "Норма площади по числу мест (ПП № 2151-ПП, табл. 1.4.1)", "ПП № 2151-ПП в ред. № 921-ПП"]);
    if (br.social.calc.douPlot > 0) rows.push(["Соцобеспечение — площадь участка ДОУ", fmtRu(br.social.calc.douPlot, 0), "м²",
      "Норма площади участка по числу мест (ПП № 2151-ПП, табл. 1.4.1)", "ПП № 2151-ПП в ред. № 921-ПП"]);
    if (br.social.calc.schoolBuilding > 0) rows.push(["Соцобеспечение — площадь здания школы", fmtRu(br.social.calc.schoolBuilding, 0), "м²",
      "Норма площади по числу мест (ПП № 2151-ПП, табл. 1.4.2)", "ПП № 2151-ПП в ред. № 921-ПП"]);
    if (br.social.calc.schoolPlot > 0) rows.push(["Соцобеспечение — площадь участка школы", fmtRu(br.social.calc.schoolPlot, 0), "м²",
      "Норма площади участка по числу мест (ПП № 2151-ПП, табл. 1.4.2)", "ПП № 2151-ПП в ред. № 921-ПП"]);
    if (br.social.calc.areaTotal > 0) {
      rows.push(["Соцобеспечение — площадь поликлиники", fmtRu(br.social.calc.areaTotal, 0), "м²",
        "Посещения в смену × площадь на посещение", br.social.polyclinic?.source || "РНГП/МНГП региона"]);
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
    if (p.deviation?.k != null && p.deviation.k !== 1) {
      a.push(`Допустимое отклонение от расчётного числа мест: ${p.deviation.label} (k = ${p.deviation.k}) — п. 6.2.4.1 ПП № 945-ПП; отклонение более 10 % — решение ГЗК Москвы (п. 6.2.4.2).`);
    }
    if (p.objectDeviation?.k != null && p.objectDeviation.k !== 1) {
      a.push(`Отклонение для приобъектной парковки: ${p.objectDeviation.label} (k = ${p.objectDeviation.k}) — п. 6.2.4.3 ПП № 945-ПП.`);
    }
    if (p.rail && p.rail.k != null) {
      a.push(`К1 (пешевая доступность рельсового каркаса) = ${p.rail.k} — ${p.rail.label}.`);
    }
    if (p.calcMeta?.correction != null && p.calcMeta.correction !== 1) {
      a.push(`Применён коэффициент корректировки K_корр = ${p.calcMeta.correction} (по заданию на проектирование).`);
    }
    (p.objectCalc?.coefficients || []).forEach((c) => {
      a.push(`Коэффициент «${c.name}» × ${c.k}: ${c.ref || "обоснование"}${c.effect ? ` (${c.effect})` : ""}.`);
    });
    const guest = (p.additional || []).find((x) => x.type === "percentOfPermanent");
    if (guest) a.push(`Гостевые машино-места приняты ${Math.round(guest.percent * 100)} % от постоянных (${guest.refPoint || "ПП № 945-ПП, п. 6.2.3.2"}).`);
    if (p.guestCheck && !p.guestCheck.ok) a.push(`Проверка гостевой парковки по СП 42.13330.2026 (п. 8.117): ${p.guestCheck.note}.`);
    if (p.electricVehicles) a.push(`Места с зарядной инфраструктурой — ${Math.round(p.electricVehicles.percent * 100)} % от постоянных (справочно, в итог не входят).`);
    if (p.mgn) a.push(`Квота мест для МГН — ${p.mgn.quota} шт. (не менее 10 %); специализированные места ${p.mgn.special} шт. учтены справочно.`);
    if (p.permanent?.invalidPlaces > 0) a.push(`Из числа постоянных мест выделено ${p.permanent.invalidPlaces} мест постоянного размещения для инвалидов (п. 6.2.3.7 ПП № 945-ПП).`);
    if ((p.federalApplied || []).length) a.push(`Контроль федерального минимума (Приказ № 250/пр): повышены — ${p.federalApplied.join("; ")}.`);
  }
  if (br.elevators) {
    const e = br.elevators;
    a.push(`Лифты: принято ${e.calc.adopted} шт. (минимум по таблице В.1 — ${e.calc.min}); грузоподъёмность ${e.inputs.loadCapacity} кг, скорость ${e.inputs.speed} м/с${e.calc.ruleNote ? `; правило: ${e.calc.ruleNote}` : ""}.`);
    if (e.calc.gostRequired) a.push(`Расчёт по ГОСТ Р 52941 требуется: исходные данные отличаются от принятых в таблице В.1 (${(e.calc.deviations || []).join("; ") || "режим расчёта выбран вручную"}); число лифтов — не менее ${e.calc.min}.`);
    if (e.calc.apartmentCheck?.length) a.push(`Площади квартир по табл. 5.1 СП 54.13330.2022: ${e.calc.apartmentCheck.map((x) => `${x.rooms} комн. — ${x.actual} м² (норма ${x.min})`).join("; ")}.`);
    if (e.calc.flow > 0) a.push(`Пассажиропоток в час пик принят ${e.calc.flow} чел/ч (по заданию либо оценочно по вместимости × коэффициенту загрузки) — справочный показатель.`);
  }
  if (br.tko) {
    const t = br.tko;
    if (t.calc.Kseason !== 1) a.push(`Учтён сезонный коэффициент накопления ТКО K_сез = ${t.calc.Kseason}.`);
    a.push(`Плотность ТКО принята ρ = ${t.calc.density} т/м³ (справочное значение; уточнить по данным регионального оператора).`);
    a.push(`Разбивка по фракциям — типовая, справочная; актуальный состав ТКО утверждается для региона.`);
  }
  if (br.social) {
    const s = br.social;
    a.push(`Население принято ${s.calc.population} чел. (${s.populationMethod === "types" ? "по типам квартир (справочно)" : s.populationMethod === "area" ? "по общей площади квартир (справочно)" : `по СПП жилой части / ${s.inputs?.sqmPerPerson} м²/чел.`}), зона «${s.zone?.label || "—"}».`);
    a.push(`Существующая обеспеченность принята ${s.calc.existing} мест (по данным заказчика/справочно).`);
    if (s.inputs?.douOvzPer1000) a.push(`Места для детей с ОВЗ: ДОУ — ${s.calc.douOvz}, школы — ${s.calc.schoolOvz} (${s.inputs.douOvzPer1000} и ${s.inputs.schoolOvzPer1000} мест/1000 жит.).`);
  }
  a.push(`Значения региональных нормативов (РНГП/МНГП) в базе калькулятора — рабочие, требуют сверки с действующими редакциями актов субъекта РФ.`);
  return a;
}
