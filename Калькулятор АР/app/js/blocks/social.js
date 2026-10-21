// blocks/social.js — Социальное обеспечение
// ПП Москвы № 2152-ПП, п. 1.4.2 (расчётное население), ПП № 2151-ПП в ред. № 921-ПП (образование),
// ПП № 2150-ПП (здравоохранение), РНГП/МНГП региона (ст. 29.2 ГрК РФ).

import { toNumber, ceilInt, round } from "../utils.js";
import { item } from "../engine.js";
import { resolveRegionNorms } from "./parking.js";

// Площадь квартир на 1 жителя по типу застройки (ПП № 2152-ПП, таблица 1.4.1)
function resolveHousingType(regSocial, housingTypeId) {
  const types = regSocial?.housingTypes || {};
  const keys = Object.keys(types);
  const id = housingTypeId && types[housingTypeId] ? housingTypeId : keys[0];
  const t = types[id] || { id: id || "mkd", label: "МКД", sqm: 50 };
  return { id: t.id, label: t.label, sqm: toNumber(t.sqm, 50) };
}

// Норма площади по числу мест (таблицы 2151-ПП)
function pickRow(table, places) {
  const rows = table || [];
  for (const r of rows) {
    if (r.maxPlaces === null || r.maxPlaces === undefined) return r;
    if (places <= r.maxPlaces) return r;
  }
  return rows[rows.length - 1] || null;
}

export function calculateSocial(norms, inputs) {
  const cfg = norms.social;
  const d = cfg.defaults;

  // Регион: социальные нормы (зоны, население) — слияние уровня (tier) и региона
  const rn = resolveRegionNorms(norms, inputs.regionId);
  const region = rn.region;
  const regSocial = rn.social;

  // --- Население ---
  const method = inputs.populationMethod || cfg.populationMethod || "spp";
  const housing = resolveHousingType(regSocial, inputs.housingType);
  const sqmPerPerson = toNumber(inputs.sqmPerPerson, housing.sqm);
  const sq = toNumber(inputs.socialSq, 0);
  const spp = toNumber(inputs.socialSpp, 0); // СПП жилой части (жилых этажей), м²

  // метод 1 (основной, ПП № 2152-ПП, п. 1.4.2): СПП жилой части / площадь на 1 жителя
  const populationBySpp = sqmPerPerson > 0 ? ceilInt(spp / sqmPerPerson) : 0;
  // метод 2 (справочно): по общей площади квартир
  const populationByArea = sqmPerPerson > 0 ? ceilInt(sq / sqmPerPerson) : 0;
  // метод 3 (справочно): по типам квартир × коэффициент семейности
  const apartmentCounts = inputs.apartmentCounts || {};
  const types = (cfg.apartmentTypes || []).map((t) => {
    const count = toNumber(apartmentCounts[t.id], 0);
    const coef = toNumber(inputs.familyCoefficients?.[t.id] ?? t.familyCoefficient, t.familyCoefficient);
    return { id: t.id, label: t.label, count, coefficient: coef, people: round(count * coef, 2) };
  });
  const populationByTypes = round(types.reduce((s, t) => s + t.people, 0), 0);

  const population =
    method === "types" ? populationByTypes : method === "area" ? populationByArea : populationBySpp;

  // --- Зона обеспеченности образованием (2151-ПП) ---
  const zones = regSocial?.zones || cfg.zones || [];
  const zoneId = inputs.zone || regSocial?.defaultZone || cfg.defaultZone;
  const zone = zones.find((z) => z.id === zoneId) || zones[0] || {};
  const douPer1000 = toNumber(zone.douPer1000, 0);
  const schoolPer1000 = toNumber(zone.schoolPer1000, 0);
  const douOvzPer1000 = toNumber(zone.douOvzPer1000, 0);
  const schoolOvzPer1000 = toNumber(zone.schoolOvzPer1000, 0);

  // --- Образование ---
  const douRaw = (population / 1000) * douPer1000;
  const schoolRaw = (population / 1000) * schoolPer1000;
  const dou = ceilInt(douRaw);
  const school = ceilInt(schoolRaw);
  const douOvz = ceilInt((population / 1000) * douOvzPer1000);
  const schoolOvz = ceilInt((population / 1000) * schoolOvzPer1000);

  // --- Площади здания и участка (2151-ПП, таблицы 1.4.1 и 1.4.2) ---
  const tables = cfg.areaTables || {};
  const areaOf = (places, table) => {
    const row = pickRow(table, places);
    return row ? { area: round(places * row.sqmPerPlace, 0), row } : { area: 0, row: null };
  };
  const douBuilding = areaOf(dou, tables.dou?.building);
  const douPlot = areaOf(dou, tables.dou?.plot);
  const schoolBuilding = areaOf(school, tables.school?.building);
  const schoolPlot = areaOf(school, tables.school?.plot);

  // --- Поликлиники (региональные нормативы) ---
  const pc = regSocial?.polyclinic || {};
  const pcChild = toNumber(inputs.polyclinicChildPer1000, pc.childPer1000);
  const pcAdult = toNumber(inputs.polyclinicAdultPer1000, pc.adultPer1000);
  const pcMixed = toNumber(inputs.polyclinicMixedPer1000, pc.mixedPer1000);
  const areaPerVisit = toNumber(inputs.polyclinicAreaPerVisit, pc.areaPerVisit);
  const pcSource = pc.source || "РНГП/МНГП региона в области здравоохранения (введите значения в «Исходные данные»)";
  const pcDefined = pcChild > 0 || pcAdult > 0 || pcMixed > 0;

  const visitsChildRaw = (population / 1000) * pcChild;
  const visitsAdultRaw = (population / 1000) * pcAdult;
  const visitsMixedRaw = (population / 1000) * pcMixed;

  const visitsChild = pcChild > 0 ? ceilInt(visitsChildRaw) : 0;
  const visitsAdult = pcAdult > 0 ? ceilInt(visitsAdultRaw) : 0;
  const visitsMixed = pcMixed > 0 ? ceilInt(visitsMixedRaw) : 0;

  const areaChild = areaPerVisit > 0 ? round(visitsChild * areaPerVisit, 0) : 0;
  const areaAdult = areaPerVisit > 0 ? round(visitsAdult * areaPerVisit, 0) : 0;
  const areaMixed = areaPerVisit > 0 ? round(visitsMixed * areaPerVisit, 0) : 0;
  const areaTotal = areaChild + areaAdult + areaMixed;

  // --- Обеспеченность и дефицит ---
  const existing = Math.max(0, toNumber(inputs.existingPlaces, 0));
  const requiredPlaces = dou + school;
  const deficitSurplus = requiredPlaces - existing;

  // --- Предельно допустимая удалённость (2151-ПП, п. 1.3.3) ---
  const accessibility = {
    title: cfg.accessibility?.title || "Предельно допустимая удалённость объектов образования",
    refPoint: cfg.accessibility?.refPoint || "",
    rows: cfg.accessibility?.rows || [],
    note: cfg.accessibility?.note || ""
  };

  const regionRef = region ? `${region.label} — РНГП/МНГП` : "РНГП/МНГП региона";
  const eduRef = "ПП № 2151-ПП (в ред. № 921-ПП)";
  const items = [
    item("Расчётная численность населения", "чел.", population, "ПП № 2152-ПП, п. 1.4.2"),
    item(`Норматив ДОУ (${zone.label || ""})`, "мест/1000 чел.", douPer1000, eduRef),
    item(`Норматив школ (${zone.label || ""})`, "мест/1000 чел.", schoolPer1000, eduRef),
    item(`ДОУ — места для детей с ОВЗ (${zone.label || ""})`, "мест/1000 чел.", douOvzPer1000, eduRef),
    item(`Школы — места для детей с ОВЗ (${zone.label || ""})`, "мест/1000 чел.", schoolOvzPer1000, eduRef),
    item("Требуемое количество мест (ДОУ + школы)", "мест", requiredPlaces, eduRef),
    item("Существующая обеспеченность", "мест", existing, "Существующая инфраструктура (справочно)"),
    item("Дефицит / избыток", "мест", deficitSurplus, "Требуемые − существующие"),
    item(`ДОУ (${zone.label || ""})`, "мест", dou, eduRef),
    item("Школы (" + (zone.label || "") + ")", "мест", school, eduRef),
    item("ДОУ — места для детей с ОВЗ", "мест", douOvz, eduRef),
    item("Школы — места для детей с ОВЗ", "мест", schoolOvz, eduRef),
    item("Площадь здания ДОУ", "м²", douBuilding.area, eduRef),
    item("Площадь участка ДОУ", "м²", douPlot.area, eduRef),
    item("Площадь здания школы", "м²", schoolBuilding.area, eduRef),
    item("Площадь участка школы", "м²", schoolPlot.area, eduRef),
    item("Поликлиника детская — посещений в смену", "пос./см.", visitsChild, pcSource),
    item("Поликлиника взрослая — посещений в смену", "пос./см.", visitsAdult, pcSource),
    item("Поликлиника смешанная — посещений в смену", "пос./см.", visitsMixed, pcSource),
    item("Площадь поликлиники детской", "м²", areaChild, pcSource),
    item("Площадь поликлиники взрослой", "м²", areaAdult, pcSource),
    item("Площадь поликлиники смешанной", "м²", areaMixed, pcSource),
    item("Суммарная требуемая площадь помещений поликлиники", "м²", areaTotal, pcSource)
  ];

  // --- Примечания ---
  const notes = [];
  const methodLabel =
    method === "types"
      ? "по типам квартир (кол-во × коэффициент семейности) — справочно"
      : method === "area"
        ? `по общей площади квартир (Sкв / ${sqmPerPerson} м²/чел.) — справочно`
        : `по СПП жилой части (жилых этажей) / ${sqmPerPerson} м²/чел. (${housing.label})`;
  notes.push(
    `Расчётная численность населения: ${population} чел. (метод: ${methodLabel}). ` +
    `Площадь квартир на 1 жителя — ${sqmPerPerson} м² (${regSocial?.sqmPerPersonNote || "ПП № 2152-ПП, таблица 1.4.1"}).`
  );
  notes.push(
    `Применена ${zone.label || "зона"}: ДОУ — ${douPer1000} мест/1000 жителей, школы — ${schoolPer1000} мест/1000 жителей ` +
    `(ОВЗ: ДОУ — ${douOvzPer1000}, школы — ${schoolOvzPer1000} мест/1000 жителей; ${eduRef}).`
  );
  notes.push(
    `Расчётная обеспеченность принимается с учётом дефицита или профицита по согласованию с Департаментом образования ` +
    `(примечание 1 к таблицам 1.4.1 и 1.4.2 ПП № 2151-ПП).`
  );
  if (douBuilding.row) {
    notes.push(`Площадь здания ДОУ — ${douBuilding.area} м² (${douBuilding.row.sqmPerPlace} м²/место, ${douBuilding.row.label}).`);
  }
  if (douPlot.row) {
    notes.push(`Площадь участка ДОУ — ${douPlot.area} м² (${douPlot.row.sqmPerPlace} м²/место, ${douPlot.row.label}).`);
  }
  if (schoolBuilding.row) {
    notes.push(`Площадь здания школы — ${schoolBuilding.area} м² (${schoolBuilding.row.sqmPerPlace} м²/место, ${schoolBuilding.row.label}).`);
  }
  if (schoolPlot.row) {
    notes.push(`Площадь участка школы — ${schoolPlot.area} м² (${schoolPlot.row.sqmPerPlace} м²/место, ${schoolPlot.row.label}).`);
  }
  if (accessibility.rows.length) {
    notes.push(
      `Предельно допустимая удалённость (${accessibility.refPoint}): ` +
      accessibility.rows.map((r) => `${r.label} — ДОУ ${r.dou}, школы ${r.school}`).join("; ") + "."
    );
  }
  if (pcDefined) {
    notes.push(
      `Здравоохранение: посещения в смену рассчитаны по региональным нормативам (${pcSource}); ` +
      `площадь — ${areaPerVisit > 0 ? `${areaPerVisit} кв. м на 1 посещение` : "не задана"}. ` +
      (pc.note || "")
    );
  } else {
    notes.push(
      `Здравоохранение: нормативы обеспеченности поликлиниками для выбранного региона не заданы. ` +
      `Введите посещения на 1000 жителей и площадь на посещение в «Исходные данные» — значения берутся из РНГП/МНГП региона в области здравоохранения.`
    );
  }
  if (pc.accessibility) {
    notes.push(`Территориальная доступность объектов здравоохранения: ${pc.accessibility}.`);
  }

  // --- Вывод по обеспеченности ---
  let conclusion =
    `Расчётная потребность при населении ${population} чел. и зоне «${zone.label || "—"}»: `
    + `ДОУ — ${dou} мест (ОВЗ — ${douOvz}), школы — ${school} мест (ОВЗ — ${schoolOvz}) `
    + `(всего ${requiredPlaces} мест; ${douPer1000}/${schoolPer1000} мест на 1000 жителей; ${eduRef}). `
    + `Существующая обеспеченность — ${existing} мест. `;
  if (deficitSurplus > 0) {
    conclusion += `Дефицит — ${deficitSurplus} мест: требуется размещение недостающих мест в пределах участка либо компенсация на территории зоны обитания в рамках РНГП/ГПЗУ (выкуп мощностей, взнос по КРТ допускаются при обосновании).`;
  } else if (deficitSurplus < 0) {
    conclusion += `Избыток — ${Math.abs(deficitSurplus)} мест: существующая обеспеченность покрывает расчётную потребность, дополнительные объекты не требуются.`;
  } else {
    conclusion += `Дефицит отсутствует (0 мест) либо сведения о существующей обеспеченности не заполнены — укажите существующие места на вкладке «Социальное обеспечение».`;
  }
  if (areaTotal > 0) {
    conclusion += ` Требуемая площадь помещений поликлиники — ${areaTotal} м² (${pcSource}).`;
  }

  return {
    title: cfg.title,
    document: cfg.document,
    region: region ? { id: region.id, label: region.label, source: region.source } : null,
    zone: {
      id: zone.id,
      label: zone.label,
      douPer1000,
      schoolPer1000,
      douOvzPer1000,
      schoolOvzPer1000,
      source: regSocial?.zonesSource || ""
    },
    housingType: housing,
    populationMethod: method,
    types,
    accessibility,
    polyclinic: {
      childPer1000: pcChild,
      adultPer1000: pcAdult,
      mixedPer1000: pcMixed,
      areaPerVisit,
      source: pcSource,
      defined: pcDefined
    },
    inputs: {
      sq, spp, sqmPerPerson, douPer1000, schoolPer1000, douOvzPer1000, schoolOvzPer1000,
      pcChild, pcAdult, pcMixed, areaPerVisit, existingPlaces: existing
    },
    calc: {
      population, populationBySpp, populationByArea, populationByTypes,
      dou, douRaw, school, schoolRaw, douOvz, schoolOvz,
      douBuilding: douBuilding.area, douPlot: douPlot.area,
      schoolBuilding: schoolBuilding.area, schoolPlot: schoolPlot.area,
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
