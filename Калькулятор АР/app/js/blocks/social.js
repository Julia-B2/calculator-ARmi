// blocks/social.js — Социальное обеспечение
// ПП Москвы № 2152-ПП (население), ПП Москвы № 2151-ПП в ред. № 921-ПП (образование), СП 158.13330.2014 (поликлиники)

import { toNumber, ceilInt, round } from "../utils.js";
import { item } from "../engine.js";
import { resolveRegionNorms } from "./parking.js";

export function calculateSocial(norms, inputs) {
  const cfg = norms.social;
  const d = cfg.defaults;

  // Регион: социальные нормы (зоны, население) — слияние уровня (tier) и региона
  const rn = resolveRegionNorms(norms, inputs.regionId);
  const region = rn.region;
  const regSocial = rn.social;

  // --- Население ---
  const method = inputs.populationMethod || cfg.populationMethod || "area";
  const sqmPerPerson = toNumber(inputs.sqmPerPerson, regSocial?.sqmPerPerson ?? d.sqmPerPerson);
  const sq = toNumber(inputs.socialSq, 0);

  // метод 1: по площади квартир
  const populationByArea = sqmPerPerson > 0 ? ceilInt(sq / sqmPerPerson) : 0;

  // метод 2: по типам квартир × коэффициент семейности
  const apartmentCounts = inputs.apartmentCounts || {};
  const types = (cfg.apartmentTypes || []).map((t) => {
    const count = toNumber(apartmentCounts[t.id], 0);
    const coef = toNumber(inputs.familyCoefficients?.[t.id] ?? t.familyCoefficient, t.familyCoefficient);
    return { id: t.id, label: t.label, count, coefficient: coef, people: round(count * coef, 2) };
  });
  const populationByTypes = round(types.reduce((s, t) => s + t.people, 0), 0);

  const population = method === "types" ? populationByTypes : populationByArea;

  // --- Зона обеспеченности образованием ---
  const zones = regSocial?.zones || cfg.zones || [];
  const zoneId = inputs.zone || regSocial?.defaultZone || cfg.defaultZone;
  const zone = zones.find((z) => z.id === zoneId) || zones[0] || {};
  const douPer1000 = toNumber(zone.douPer1000, 0);
  const schoolPer1000 = toNumber(zone.schoolPer1000, 0);

  // --- Образование ---
  const douRaw = (population / 1000) * douPer1000;
  const schoolRaw = (population / 1000) * schoolPer1000;
  const dou = ceilInt(douRaw);
  const school = ceilInt(schoolRaw);

  // Площадь участка по минимальным типоразмерам (2151-ПП)
  function plotArea(places, table) {
    const row = (table || []).find((r) => r.maxPlaces === null || places <= r.maxPlaces);
    return row ? round(places * row.sqmPerPlace, 0) : 0;
  }
  const douPlot = plotArea(dou, cfg.minSizes?.dou);
  const schoolPlot = plotArea(school, cfg.minSizes?.school);

  // --- Поликлиники ---
  const pcChild = toNumber(inputs.polyclinicChildPer1000, d.polyclinicChildPer1000);
  const pcAdult = toNumber(inputs.polyclinicAdultPer1000, d.polyclinicAdultPer1000);
  const pcMixed = toNumber(inputs.polyclinicMixedPer1000, d.polyclinicMixedPer1000);
  const areaPerVisit = toNumber(inputs.polyclinicAreaPerVisit, d.polyclinicAreaPerVisit);

  const visitsChildRaw = (population / 1000) * pcChild;
  const visitsAdultRaw = (population / 1000) * pcAdult;
  const visitsMixedRaw = (population / 1000) * pcMixed;

  const visitsChild = ceilInt(visitsChildRaw);
  const visitsAdult = ceilInt(visitsAdultRaw);
  const visitsMixed = ceilInt(visitsMixedRaw);

  const areaChild = round(visitsChild * areaPerVisit, 0);
  const areaAdult = round(visitsAdult * areaPerVisit, 0);
  const areaMixed = round(visitsMixed * areaPerVisit, 0);
  const areaTotal = areaChild + areaAdult + areaMixed;

  // --- Обеспеченность и дефицит (спецификация: existing_places → deficit_surplus → conclusion) ---
  const existing = Math.max(0, toNumber(inputs.existingPlaces, 0));
  const requiredPlaces = dou + school; // требуемое количество мест (ДОУ + школы)
  const deficitSurplus = requiredPlaces - existing; // >0 — дефицит, <0 — избыток

  const regionRef = region ? `${region.label} — РНГП/МНГП` : "РНГП/МНГП региона";
  const items = [
    item("Расчётная численность населения", "чел.", population, regionRef),
    item(`Норматив ДОУ (${zone.label || ""})`, "мест/1000 чел.", douPer1000, regionRef),
    item(`Норматив школ (${zone.label || ""})`, "мест/1000 чел.", schoolPer1000, regionRef),
    item("Требуемое количество мест (ДОУ + школы)", "мест", requiredPlaces, regionRef),
    item("Существующая обеспеченность", "мест", existing, "Существующая инфраструктура (справочно)"),
    item("Дефицит / избыток", "мест", deficitSurplus, "Требуемые − существующие"),
    item(`ДОУ (${zone.label || ""})`, "мест", dou, regionRef),
    item("Школы (" + (zone.label || "") + ")", "мест", school, regionRef),
    item("Площадь участка ДОУ", "м²", douPlot, regionRef),
    item("Площадь участка школы", "м²", schoolPlot, regionRef),
    item("Поликлиника детская — посещений в смену", "пос./см.", visitsChild, "СП 158.13330.2014"),
    item("Поликлиника взрослая — посещений в смену", "пос./см.", visitsAdult, "СП 158.13330.2014"),
    item("Поликлиника смешанная — посещений в смену", "пос./см.", visitsMixed, "СП 158.13330.2014"),
    item("Площадь поликлиники детской", "м²", areaChild, "СП 158.13330.2014"),
    item("Площадь поликлиники взрослой", "м²", areaAdult, "СП 158.13330.2014"),
    item("Площадь поликлиники смешанной", "м²", areaMixed, "СП 158.13330.2014"),
    item("Суммарная требуемая площадь помещений поликлиники", "м²", areaTotal, "СП 158.13330.2014")
  ];

  // --- Анализ типоразмеров и рекомендации ---
  const notes = [];
  notes.push(
    `Расчётная численность населения: ${population} чел. (метод: ${method === "types" ? "по типам квартир" : "по площади квартир (Sкв / " + sqmPerPerson + " м²/чел.)"}).`
  );
  notes.push(
    `Применена ${zone.label || "зона"}: ДОУ — ${douPer1000} мест/1000 жителей, школы — ${schoolPer1000} мест/1000 жителей (${regionRef}).`
  );

  const douLarge = dou >= 125; // 2151-ПП: малые ДОУ до 125 мест
  if (!douLarge) {
    notes.push(
      `ДОУ: расчётная потребность ${dou} мест ниже минимального типоразмера (125 мест). Рекомендуется выкуп мощностей в действующих учреждениях в радиусе доступности или целевой взнос по механизму КРТ.`
    );
  }
  if (school < 550) {
    notes.push(
      `Школы: расчётная потребность ${school} мест ниже минимального типоразмера (550 мест). Проектирование отдельного здания нецелесообразно — выкуп мощностей или взнос по КРТ.`
    );
  }
  notes.push(
    `Пешеходная доступность (${regionRef}): для ДОУ — не более 300 м (зона 2 — 15 мин. доступности), для школ — не более 500 м.`
  );
  notes.push(
    `Медицина: суммарная требуемая площадь помещений — ${areaTotal} м². В условиях плотной застройки целесообразен единый медицинский блок либо кабинеты ВОП/педиатра внутри ЖК.`
  );

  // --- Вывод по обеспеченности (type: text) ---
  let conclusion =
    `Расчётная потребность при населении ${population} чел. и зоне «${zone.label || "—"}»: `
    + `ДОУ — ${dou} мест, школы — ${school} мест (всего ${requiredPlaces} мест, ${douPer1000}/${schoolPer1000} мест на 1000 жителей; ${regionRef}). `
    + `Существующая обеспеченность — ${existing} мест. `;
  if (deficitSurplus > 0) {
    conclusion += `Дефицит — ${deficitSurplus} мест: требуется размещение недостающих мест в пределах участка либо компенсация на территории зоны обитания в рамках РНГП/ГПЗУ (выкуп мощностей, взнос по КРТ допускаются при обосновании).`;
  } else if (deficitSurplus < 0) {
    conclusion += `Избыток — ${Math.abs(deficitSurplus)} мест: существующая обеспеченность покрывает расчётную потребность, дополнительные объекты не требуются.`;
  } else {
    conclusion += `Дефицит отсутствует (0 мест) либо сведения о существующей обеспеченности не заполнены — укажите существующие места на вкладке «Социальное обеспечение».`;
  }
  if (areaTotal > 0) {
    conclusion += ` Требуемая площадь помещений поликлиники — ${areaTotal} м² (СП 158.13330.2014).`;
  }

  return {
    title: cfg.title,
    document: cfg.document,
    region: region ? { id: region.id, label: region.label, source: region.source } : null,
    zone: { id: zone.id, label: zone.label, douPer1000, schoolPer1000 },
    populationMethod: method,
    types,
    inputs: {
      sq, sqmPerPerson, douPer1000, schoolPer1000,
      pcChild, pcAdult, pcMixed, areaPerVisit, existingPlaces: existing
    },
    calc: {
      population, populationByArea, populationByTypes,
      dou, douRaw, school, schoolRaw, douPlot, schoolPlot,
      visitsChild, visitsAdult, visitsMixed,
      areaChild, areaAdult, areaMixed, areaTotal,
      requiredPlaces, existing, deficitSurplus
    },
    conclusion,
    notes,
    items,
    refs: cfg.refs || []
  };
}
