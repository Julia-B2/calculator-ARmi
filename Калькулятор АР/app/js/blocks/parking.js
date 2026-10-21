// blocks/parking.js — Машиноместа по 945-ПП (Приложение 5, п. 1.2)

import { toNumber, ceilInt, round } from "../utils.js";
import { item } from "../engine.js";

// --- Регионы (центральный реестр в norms.regions) ---
export function getRegion(norms, regionId) {
  const list = norms?.regions || [];
  const id = regionId || norms?.parking?.defaultRegion || null;
  return list.find((r) => r.id === id) || list.find((r) => r.id === norms?.parking?.defaultRegion) || list[0] || null;
}

// --- Слияние норм региона: уровень (tier) -> явные значения региона ---
// Позволяет держать компактный перечень (85 субъектов) с общими нормами уровня
// и детальными переопределениями только для ключевых регионов.
export function resolveRegionNorms(norms, regionId) {
  const region = getRegion(norms, regionId);
  const tiers = norms?.parking?.tiers || {};
  const tierId = region?.tier || "base";
  const tier = tiers[tierId] || tiers.base || {};
  const p = region?.parking || {};
  const socialTiers = norms?.social?.tiers || {};
  const stier = socialTiers[tierId] || socialTiers.base || {};
  const s = region?.social || {};
  const to = tier.object || {};
  const po = p.object || {};

  // Контроль федерального минимума (Приказ Минстроя РФ № 250/пр):
  // если региональный норматив ниже федерального — применяется федеральное значение.
  const fed = norms?.parking?.federalMinimum || null;
  const federalApplied = [];
  const raise = (cur, fmin, label) => {
    if (fmin == null) return cur;
    const c = cur == null ? null : toNumber(cur, null);
    const f = toNumber(fmin, null);
    if (f == null) return cur;
    if (c == null || c < f) {
      federalApplied.push(`${label}: ${c ?? "—"} → ${f}`);
      return f;
    }
    return cur;
  };

  const coefficients = { ...(tier.coefficients || {}), ...(p.coefficients || {}) };
  if (fed?.coefficients) {
    for (const key of Object.keys(fed.coefficients)) {
      coefficients[key] = raise(coefficients[key], fed.coefficients[key], `K_${key}`);
    }
  }
  const object = {
    housing: { ...(to.housing || {}), ...(po.housing || {}) },
    mall: { ...(to.mall || {}), ...(po.mall || {}) },
    office: { ...(to.office || {}), ...(po.office || {}) },
    education: { ...(to.education || {}), ...(po.education || {}) },
    medical: { ...(to.medical || {}), ...(po.medical || {}) },
    otReduction: po.otReduction ?? to.otReduction ?? 0.85
  };
  const fo = fed?.object || {};
  if (fo.mall) for (const key of Object.keys(fo.mall)) object.mall[key] = raise(object.mall[key], fo.mall[key], `K_ТЦ «${key}»`);
  for (const key of ["office", "education", "medical"]) {
    if (fo[key]?.per100m2 != null) object[key].per100m2 = raise(object[key].per100m2, fo[key].per100m2, `K_${key}/100 м²`);
  }
  const bktK = raise(p.bktK ?? tier.bktK ?? 1.5, fed?.bktK ?? null, "K_БКТ");

  return {
    region,
    tierId,
    bktK,
    coefficients,
    reductionKZones: p.reductionKZones || tier.reductionKZones || [],
    object,
    federalApplied,
    federalSource: fed?.source || "",
    social: {
      zones: s.zones || stier.zones || [],
      defaultZone: s.defaultZone || stier.defaultZone || "zone1",
      sqmPerPerson: s.sqmPerPerson ?? stier.sqmPerPerson ?? 33
    }
  };
}

// --- Понижающий коэффициент ---
// selection: { optionId, zoneId } из UI. Зоны и k берутся из региона/уровня (rn — resolveRegionNorms).
export function resolveReductionK(cfg, selection, rn) {
  const region = rn?.region || null;
  const fallback = { optionId: "none", zoneId: null, k: 1, label: "Нет (k = 1)", refPoint: cfg?.reductionK?.refPoint || "", source: region?.source || "" };
  if (!rn) return fallback;

  const zones = rn.reductionKZones || [];
  const optionId = selection?.optionId || cfg?.reductionK?.defaultOption || "none";
  if (optionId === "none" || zones.length === 0) return fallback;

  const zoneId = selection?.zoneId || zones[0].id;
  const zone = zones.find((z) => z.id === zoneId) || zones[0];
  return {
    optionId,
    zoneId: zone.id,
    k: toNumber(zone.k, 1),
    label: `К по транспортной доступности — ${zone.label}`,
    refPoint: cfg?.reductionK?.refPoint || "РНГП/МНГП региона",
    source: region?.source || ""
  };
}

// --- Приобъектные машино-места ---
// Два режима сценария:
//   mode = "bkt"      — БКТ (без технологии): одна общая площадь S, один коэффициент K.
//   mode = "functions"— Функции: разбивка по функциональным группам, у каждой S_i и K_i.
// Формула обоих режимов: N_баз = (Σ S_i / 100 × K_i) × f. При нескольких сценариях — max.
export function calculateObjectFacilities(norms, scenarios) {
  const cfg = norms.parking.objectFacilities;
  if (!cfg) return null;

  const regionId = scenarios?.__regionId || norms.parking.defaultRegion || null;
  const rn = resolveRegionNorms(norms, regionId);
  const region = rn.region;
  const regionK = (fnId) => {
    const v = rn.coefficients?.[fnId];
    return v != null ? toNumber(v, 0) : null;
  };

  const divisorOf = (unitId) => {
    const u = (cfg.unitOptions || []).find((x) => x.id === unitId);
    return u ? u.divisor : 100;
  };

  // scenarios: [{ id, label, mode, f, area, K, functions: { funcId: { K, S } } }]
  const results = (scenarios || []).map((sc) => {
    const f = toNumber(sc.f, 1);
    const mode = sc.mode === "functions" ? "functions" : "bkt";

    let rows = [];
    if (mode === "bkt") {
      // Один общий коэффициент K на всю площадь S (справочный — из региона)
      const S = toNumber(sc.area, 0);
      const bktPreset = rn.bktK ?? cfg.bktK ?? 0;
      const K = toNumber(sc.K ?? bktPreset, bktPreset);
      const raw = (S / 100) * K;
      rows = [{ id: "__bkt", label: "БКТ (общая площадь)", unit: "per100m2", K, S, raw: round(raw, 3) }];
    } else {
      rows = (cfg.functions || []).map((fn) => {
        const o = sc.functions?.[fn.id] || {};
        const preset = regionK(fn.id);
        const K = toNumber(o.K ?? (preset != null ? preset : fn.K), 0);
        const S = toNumber(o.S ?? o.E ?? fn.S ?? 0, 0);
        const raw = (S / divisorOf(fn.unit)) * K;
        return { id: fn.id, label: fn.label, unit: fn.unit, K, S, raw: round(raw, 3) };
      });
    }

    const sumRaw = round(rows.reduce((s, x) => s + x.raw, 0), 3);
    const afterF = round(sumRaw * f, 3);
    const places = afterF > 0 ? Math.max(1, ceilInt(afterF)) : 0;
    return { id: sc.id, label: sc.label, mode, f, functions: rows, sumRaw, afterF, places };
  });

  const maxScenario = results.reduce(
    (best, r) => (best === null || r.places > best.places ? r : best),
    null
  );
  const places = maxScenario ? maxScenario.places : 0;

  return {
    title: cfg.title,
    refPoint: cfg.refPoint,
    note: cfg.note,
    region,
    regionId,
    results,
    maxScenario,
    places,
    refs: [
      { point: region?.source || "РНГП/МНГП региона", requirement: "K_i — мест на 100 м² общей площади; f — корректирующий коэффициент (близость транспорта и т.п.)", applied: "N_баз = (S / 100) × K × f; при нескольких сценариях — max" },
      { point: "СП 42.13330.2016, приложение Ж", requirement: "Нормы расчёта стоянок автомобилей — базовая федеральная обеспеченность", applied: "Региональные коэффициенты K_i" },
      { point: "СП 113.13330.2023", requirement: "Стоянки автомобилей: габариты места 5,3 × 2,5 м (прил. А)", applied: "Габариты обычного места" }
    ]
  };
}

// --- Места для МГН: квота 181-ФЗ (10%) ---
export function calculateMgnQuota(norms, totalPlaces) {
  const cfg = norms.parking.mgn?.legalQuota;
  const pct = cfg ? cfg.percent : 0.10;
  const minVal = cfg ? cfg.min : 1;
  if (totalPlaces <= 0) return 0;
  return Math.max(minVal, ceilInt(pct * totalPlaces));
}

// --- Специализированные места по шкале СП 59.13330.2020, п. 5.2.1 ---
export function calculateMgnSpecial(norms, N) {
  const scale = norms.parking.mgn?.specialScale;
  if (!scale || N <= 0) return 0;
  const row = (scale.ranges || []).find((r) => r.maxN === null || N <= r.maxN);
  if (!row) return 0;
  if (row.maxN === 100) {
    return Math.max(1, ceilInt(row.percent * N));
  }
  return row.base + ceilInt(row.percent * (N - row.over));
}

// --- Объектно-ориентированный расчёт (жильё по классу / ТЦ / офис / МФН) ---
// База по функциям объекта, затем коэффициенты (ОТ, МФН-буфер, совместное использование).
// N = Σ(функция) → ×k(ОТ) → ×k(МФН) → ×k(совм.исп.) → ceil. Методические рекомендации Минстроя / СП 42, прил. Ж.
export function calculateObjectPermanent(norms, inputs, rn) {
  const p = inputs.objParams || {};
  const oc = norms.parking?.objectCoefficients || {};
  const housing = rn.object.housing || {};
  const mall = rn.object.mall || {};
  const office = rn.object.office || {};
  const comps = [];

  const units = toNumber(p.unitsCount, 0);
  if (units > 0) {
    const cls = p.housingClass || "эконом";
    const k = toNumber(housing[cls], housing["эконом"] ?? 0.6);
    comps.push({
      name: `Жильё (${cls})`,
      method: `${Math.round(units)} кв. × K=${k} мест/кв.`,
      raw: round(units * k, 3),
      ref: `${rn.region?.label || "РНГП региона"} / СП 42, прил. Ж`
    });
  }

  const gla = toNumber(p.gla, 0);
  if (gla > 0) {
    const mt = p.mallType || "районный";
    const k = toNumber(mall[mt], mall["районный"] ?? 1.0);
    comps.push({
      name: `Торговый центр (${mt})`,
      method: `GLA ${Math.round(gla)} м² / 100 × K=${k}`,
      raw: round((gla / 100) * k, 3),
      ref: `${rn.region?.label || "РНГП региона"} / СП 42, прил. Ж`
    });
  }

  const oa = toNumber(p.officeArea, 0);
  const emp = toNumber(p.employees, 0);
  if (oa > 0 || emp > 0) {
    const byArea = oa > 0 ? round((oa / 100) * toNumber(office.per100m2, 1), 3) : 0;
    const byEmp = emp > 0 ? round(emp * toNumber(office.perEmployee, 1), 3) : 0;
    const raw = Math.max(byArea, byEmp);
    const parts = [];
    if (byArea > 0) parts.push(`площадь ${byArea}`);
    if (byEmp > 0) parts.push(`численность ${byEmp}`);
    comps.push({
      name: "Офис",
      method: `максимум (${parts.join(" vs ")})`,
      raw,
      ref: `${rn.region?.label || "РНГП региона"} / СП 42, прил. Ж`
    });
  }

  // Школа / поликлиника: максимум(площадь × K, вместимость × загрузка × K_мест).
  // Функция учитывается, если она выбрана в «Исходных данных» (для смешанных объектов),
  // вместимость применяется только к основному типу объекта, чтобы не задваивать её.
  const occ = toNumber(p.occupancy, 1);
  const cap = toNumber(p.capacity, 0);
  const type = inputs.objectType || "жилой";
  const funcs = Array.isArray(inputs.functions) ? inputs.functions : [];
  const facilityComp = (label, area, norm, capValue) => {
    const byArea = area > 0 ? round((area / 100) * toNumber(norm.per100m2, 1), 3) : 0;
    const byCap = capValue > 0 ? round(capValue * occ * toNumber(norm.perPlace, 0.1), 3) : 0;
    if (byArea <= 0 && byCap <= 0) return;
    const parts = [];
    if (byArea > 0) parts.push(`площадь ${byArea}`);
    if (byCap > 0) parts.push(`вместимость×загрузка ${byCap}`);
    comps.push({
      name: label,
      method: `максимум (${parts.join(" vs ")})`,
      raw: Math.max(byArea, byCap),
      ref: `${rn.region?.label || "РНГП региона"} / РНГП (учреждения образования и здравоохранения)`
    });
  };
  if (type === "школа" || funcs.includes("school")) {
    facilityComp("Школа (образование)", toNumber(p.schoolArea, 0), rn.object.education || {}, type === "школа" ? cap : 0);
  }
  if (type === "поликлиника" || funcs.includes("medical")) {
    facilityComp("Поликлиника (здравоохранение)", toNumber(p.clinicArea, 0), rn.object.medical || {}, type === "поликлиника" ? cap : 0);
  }

  const rawBase = round(comps.reduce((s, c) => s + c.raw, 0), 3);

  // --- Коэффициенты ---
  const flags = inputs.objCoefficients || {};
  let v = rawBase;
  const log = [];
  if (flags.otProximity) {
    const k = toNumber(rn.object.otReduction, 0.85);
    v = round(v * k, 3);
    log.push({ name: "Близость к ОТ (метро / МЦД / крупные остановки)", k, effect: "снижение", after: v, ref: "РНГП региона / методрекомендации Минстроя" });
  }
  if (flags.mfn) {
    const k = toNumber(oc.mfnBuffer, 1.10);
    v = round(v * k, 3);
    log.push({ name: "Многофункциональность (буфер на пики функций)", k, effect: "повышение +10 %", after: v, ref: "Методические рекомендации по МФН" });
  }
  const su = flags.sharedUse != null ? toNumber(flags.sharedUse, 0) : 0;
  if (su > 0) {
    v = round(v * su, 3);
    log.push({ name: "Совместное использование (пиковые нагрузки не совпадают)", k: su, effect: "снижение (с обоснованием)", after: v, ref: "Методическое обоснование (пиковые нагрузки)" });
  }
  // Коэффициент корректировки K_корр (спецификация), по умолчанию 1,0
  const corr = Math.max(0.1, toNumber(inputs.correctionFactor, 1));
  if (corr !== 1) {
    v = round(v * corr, 3);
    log.push({ name: "Коэффициент корректировки (K_корр)", k: corr, effect: "корректировка по заданию", after: v, ref: "Задание на проектирование / ТЗ" });
  }

  const spaces = v > 0 ? Math.max(1, ceilInt(v)) : 0;
  return { components: comps, rawBase, coefficients: log, corrected: v, spaces };
}

// --- Текстовое обоснование для экспертизы (3–6 абзацев) ---
export function generateJustification(b, norms) {
  const regionLabel = b.region?.label || "регион не указан";
  const rnghSource = b.region?.source || "РНГП/МНГП региона";
  const objectType = b.objectType || "жилой";
  const funcs = (b.objectCalc?.components || []).map((c) => c.name);
  const oc = norms?.parking?.objectCoefficients || {};
  const paras = [];
  // Русский формат чисел: 0.85 → 0,85
  const dec = (n) => String(n).replace(/(\.\d+?)(0+)$/, "$1").replace(".", ",");

  // Абзац 1 — объект, регион, нормативы
  let p1 = `Расчёт количества машино-мест выполнен для объекта капитального строительства типа «${objectType}»`
    + (funcs.length ? ` (функции: ${funcs.join(", ")})` : "")
    + ` в регионе «${regionLabel}»`
    + `${b.inputs?.designStage ? ` на стадии ${b.inputs.designStage}` : ""}. Применены нормативы: ${rnghSource}. `
    + `Приоритет отдан региональным нормативам градостроительного проектирования (РНГП/МНГП субъекта РФ, ст. 29.2 ГрК РФ); `
    + `федеральный ориентир при недостаточности данных — СП 42.13330.2016 (приложение Ж). `
    + `Планировочные требования (габариты, уклоны, места для МГН) учтены по СП 113.13330.2023.`
    + ((b.federalApplied || []).length
      ? ` Контроль федерального минимума (Приказ Минстроя РФ № 250/пр): отдельные региональные нормативы оказались ниже федерального минимума и заменены федеральными значениями — ${b.federalApplied.join("; ")}.`
      : "");
  paras.push(p1);

  // Абзац 2 — базовый расчёт
  if (objectType === "жилой" && b.permanent?.byGroups) {
    const g = b.permanent.byGroups.map((x) => `${x.label} — ${x.count} × ${x.coefficient}`).join("; ");
    paras.push(`Базовый расчёт постоянных машино-мест выполнен по квартирографии: ${g}. `
      + `Итого база (без понижающего коэффициента) — ${dec(round(b.permanent.NnRaw, 1))} мест.`);
  } else if (b.objectCalc) {
    const desc = b.objectCalc.components.map((c) => `${c.name} — ${c.method}`).join("; ");
    paras.push(`Базовый расчёт выполнен по функциям объекта: ${desc}. `
      + `Суммарная база (без корректирующих коэффициентов) — ${dec(b.objectCalc.rawBase)} мест.`);
  }

  // Абзац 3 — коэффициенты
  if (b.objectCalc?.coefficients?.length) {
    const cd = b.objectCalc.coefficients.map((c) => `${c.name} — коэффициент ${dec(c.k)} (${c.effect})`).join("; ");
    paras.push(`Применены корректирующие коэффициенты: ${cd}. `
      + `После применения — ${dec(b.objectCalc.corrected)} мест, что с округлением вверх даёт ${b.permanent.Nn} постоянных машино-мест.`);
    if (b.objectCalc.coefficients.some((c) => c.name.startsWith("Совместное"))) {
      paras.push(`Совместное использование мест обосновано: пиковые нагрузки функций не совпадают, применён понижающий коэффициент в диапазоне ${oc.sharedUse ? dec(oc.sharedUse.min) + "–" + dec(oc.sharedUse.max) : "0,8–0,9"}.`);
    }
  } else if (b.permanent?.k && b.permanent.k !== 1) {
    paras.push(`Применён понижающий коэффициент ${b.reduction?.label || ""} (k = ${dec(b.permanent.k)}); `
      + `постоянные машино-места — ${b.permanent.Nn} (округление вверх).`);
  } else {
    paras.push(`Корректирующие коэффициенты не применялись. Постоянные машино-места — ${b.permanent.Nn} (округление вверх).`);
  }

  // Абзац 4 — гостевые и МГН
  const guest = b.additional?.find((a) => a.id === "guest");
  const guestTxt = guest && guest.accepted > 0
    ? `Гостевые машино-места приняты в количестве ${guest.accepted} (${Math.round((guest.accepted / Math.max(1, b.permanent.Nn)) * 100)} % от постоянных). `
    : "Гостевые машино-места не предусмотрены. ";
  paras.push(guestTxt
    + `Итого постоянных и гостевых мест — ${b.mgn.totalBeforeMgn - (b.objectPlaces || 0)}. `
    + `Места для МГН определены по ФЗ № 181-ФЗ (ст. 15): не менее 10 % от общего числа мест и не менее одного — принято ${b.mgn.quota} мест `
    + `(специализированных по шкале СП 59.13330.2020 — ${b.mgn.special}). `
    + `Габариты специализированных мест 6,0 × 3,6 м (СП 113.13330.2023, СП 59.13330.2020); округление — вверх. `
    + `Места для МГН входят в общее количество и подлежат выделению в планировке.`);

  // Абзац 5 — особые условия
  const special = (b.summary || "").trim();
  paras.push(special
    ? `Особые условия (ГПЗУ/ППТ): ${special}. Данные условия имеют приоритет над общими нормативами и учтены в расчёте.`
    : `Особые условия ГПЗУ/ППТ, ограничивающие количество или тип парковок, не предъявлены. При наличии они имеют приоритет над расчётными нормативами и требуют повторного пересчёта.`);

  // Итог
  paras.push(`Итоговое количество машино-мест (с округлением вверх): ${b.total}. Расчёт выполнен по методике СП 42.13330.2016 (приложение Ж), СП 113.13330.2023, СП 59.13330.2020 и региональным нормативам (${regionLabel}).`);

  return paras.filter(Boolean).join("\n\n");
}

// Ручные значения доп. составляющих хранятся в UI (state), передаются сюда.
export function calculateParking(norms, inputs, manual = {}) {
  const cfg = norms.parking;

  const f1 = toNumber(inputs.f1, 0);
  const f2 = toNumber(inputs.f2, 0);
  const f3 = toNumber(inputs.f3, 0);
  // «Количество квартир, всего» считается автоматически: F1 + F2 + F3
  const apartmentsTotal = f1 + f2 + f3;

  const objectType = inputs.objectType || "жилой";
  const rn = resolveRegionNorms(norms, inputs.regionId);

  // Коэффициент корректировки K_корр (спецификация: N_мм = N_норм × Q × K_корр), по умолчанию 1,0
  const corr = Math.max(0.1, toNumber(inputs.correctionFactor, 1));

  // Площади по назначению (вкладка «Исходные данные») → параметры объектного расчёта
  const ap = inputs.areaPurpose || {};
  inputs.objParams = {
    ...(inputs.objParams || {}),
    gla: toNumber(ap.trade, 0),
    officeArea: toNumber(ap.office, 0),
    schoolArea: toNumber(ap.school, 0),
    clinicArea: toNumber(ap.medical, 0),
    capacity: toNumber(inputs.capacity, 0),
    occupancy: toNumber(inputs.occupancy, 1)
  };

  // Постоянные машино-места зависят от типа объекта:
  //   жилой — метод квартирографии Nп = F1×0.8 + F2×1.2 + F3×1.6 (945-ПП, Прил. 5);
  //   ТЦ / офис / школа / поликлиника / МФН — объектно-ориентированный расчёт (СП 42, прил. Ж + коэффициенты).
  let byGroups;
  let permanent;
  let permanentRaw;
  let sumF;
  let objectCalc = null;
  let reduction = { optionId: "none", zoneId: null, k: 1, label: "Нет (k = 1)", refPoint: "", source: "" };

  if (objectType === "жилой") {
    // Понижающий коэффициент k (945-ПП, п. 6.2.4) применяется к числу мест; зоны — из региона/уровня.
    reduction = resolveReductionK(cfg, inputs.reductionK, rn);
    const k = reduction.k;
    byGroups = cfg.groups.map((g, i) => {
      const count = [f1, f2, f3][i];
      const spacesRaw = round(count * g.coefficient, 3);
      const spacesRawK = round(count * g.coefficient * k * corr, 3);
      const spaces = count > 0 ? ceilInt(spacesRawK) : 0;
      return {
        id: g.id, label: g.label, count, coefficient: g.coefficient,
        spaces, spacesRaw, spacesRawK,
        refPoint: rn.region ? `${rn.region.label} — РНГП/МНГП` : "РНГП/МНГП региона"
      };
    });
    permanentRaw = byGroups.reduce((s, g) => s + g.spacesRaw, 0);
    permanent = byGroups.reduce((s, g) => s + g.spaces, 0);
    sumF = f1 + f2 + f3;
  } else {
    objectCalc = calculateObjectPermanent(norms, inputs, rn);
    permanent = objectCalc.spaces;
    permanentRaw = objectCalc.corrected;
    sumF = objectCalc.rawBase;
    byGroups = objectCalc.components.map((c, i) => ({
      id: "obj" + i, label: c.name, count: "", coefficient: c.method,
      spaces: round(c.raw, 1), spacesRaw: c.raw, spacesRawK: c.raw, refPoint: c.ref
    }));
  }

  // Дополнительные составляющие
  const additional = (cfg.additional || []).map((a) => {
    let calculated = 0;
    let accepted = 0;

    if (a.type === "percentOfPermanent") {
      calculated = round(permanentRaw * a.percent, 3);
      accepted = a.rounding === "ceil" ? ceilInt(calculated) : round(calculated, 0);
    } else {
      calculated = toNumber(manual[a.id] ?? a.value ?? 0, 0);
      accepted = a.rounding === "ceil" ? ceilInt(calculated) : round(calculated, 0);
    }

    return {
      id: a.id,
      name: a.name,
      type: a.type,
      calculated,
      accepted,
      rounding: a.rounding || "none",
      include: manual.__include ? !!manual.__include[a.id] : !!a.includeByDefault,
      note: a.note || "",
      refPoint: a.refPoint || ""
    };
  });

  // Гостевые ММ — только для жилых/МФН; для ТЦ/офиса не применяются
  if (objectType !== "жилой" && objectType !== "многофункциональный") {
    additional.forEach((a) => { if (a.id === "guest") a.include = false; });
  }
  const included = additional.filter((a) => a.include);
  const guestAccepted = additional.find((a) => a.id === "guest")?.accepted || 0;

  // --- Электромобили ---
  // Места с зарядной инфраструктурой = 10 % от постоянных (округление вверх, не менее 1).
  const evCfg = norms.parking.electricVehicles || {};
  const evPct = toNumber(evCfg.percent ?? 0.10, 0.10);
  const evRaw = round(permanent * evPct, 3);
  const evPlaces = permanent > 0 ? Math.max(1, ceilInt(evRaw)) : 0;
  const electricVehicles = {
    percent: evPct,
    raw: evRaw,
    places: evPlaces,
    infrastructureNote: evCfg.infrastructureNote || "Инженерная инфраструктура: кабель-каналы или шинопроводы учесть на 100 % машино-мест.",
    refPoint: evCfg.refPoint || "СП 42.13330.2016; ПП РФ № 1225-р (зарядная инфраструктура)",
    note: evCfg.note || `${Math.round(evPct * 100)} % от постоянных машино-мест`
  };

  // --- Приобъектные ММ ---
  const scenarios = inputs.scenarios || [];
  if (inputs.regionId) scenarios.__regionId = inputs.regionId;
  const objectFacilities = calculateObjectFacilities(norms, scenarios);
  const objectPlaces = objectFacilities ? objectFacilities.places : 0;

  // --- МГН (справочные строки; в итог НЕ добавляются) ---
  // Квота по 181-ФЗ — от общего числа машино-мест (постоянные + гостевые + приобъектные)
  const baseTotal = permanent + included.reduce((s, a) => s + a.accepted, 0);
  const totalBeforeMgn = round(baseTotal + objectPlaces, 0);
  const mgnQuota = calculateMgnQuota(norms, totalBeforeMgn);
  const mgnSpecial = calculateMgnSpecial(norms, totalBeforeMgn);

  // Спец. места от гостевых (10%) и от приобъектных (10%) — по СП 59.13330.2020 / 181-ФЗ
  const guestPct = norms.parking.constants?.mgnSpecialOfGuestPct ?? 0.10;
  const objectPct = norms.parking.constants?.mgnSpecialOfObjectPct ?? 0.10;
  const specOfGuest = guestAccepted > 0 ? Math.max(1, ceilInt(guestPct * guestAccepted)) : 0;
  const specOfObject = objectPlaces > 0 ? Math.max(1, ceilInt(objectPct * objectPlaces)) : 0;

  // --- Итоговая потребность ---
  // Гостевые и приобъектные добавляются автоматически; МГН — справочно.
  const total = totalBeforeMgn;

  const objectModeLabel = objectFacilities?.maxScenario?.mode === "functions" ? "Функционал" : "БКТ";

  const totalFormula = [
    `${permanent}`,
    ...included.map((a) => `+ ${a.accepted} (${a.name})`),
    ...(objectPlaces > 0 ? [`+ ${objectPlaces} (Приобъектные машиноместа (Итого))`] : [])
  ].join(" ");

  const k = reduction.k;
  const region = rn.region;

  // --- Расчётные показатели (спецификация: N_мм = N_норм × Q × K_корр) ---
  const regionLabel2 = region?.label || "регион";
  let normLabel;
  let unitLabel;
  if (objectType === "жилой") {
    normLabel = `N = F1×${cfg.groups[0]?.coefficient} + F2×${cfg.groups[1]?.coefficient} + F3×${cfg.groups[2]?.coefficient} (мест/квартира)`;
    unitLabel = "квартира";
  } else if (objectType === "торговый") {
    normLabel = `K = ${rn.object.mall?.[inputs.objParams.mallType || "районный"]} мест/100 м² (${regionLabel2})`;
    unitLabel = "100 м² GLA";
  } else if (objectType === "офисный") {
    normLabel = `максимум: K×S/100 = ${rn.object.office?.per100m2}, K×чел = ${rn.object.office?.perEmployee} (${regionLabel2})`;
    unitLabel = "100 м² / чел.";
  } else if (objectType === "школа") {
    normLabel = `K = ${rn.object.education?.per100m2} м/100 м² и ${rn.object.education?.perPlace} м/место (${regionLabel2})`;
    unitLabel = "100 м² / место";
  } else if (objectType === "поликлиника") {
    normLabel = `K = ${rn.object.medical?.per100m2} м/100 м² и ${rn.object.medical?.perPlace} м/место (${regionLabel2})`;
    unitLabel = "100 м² / место";
  } else {
    normLabel = "сумма по функциям объекта × K региона × коэффициенты";
    unitLabel = "смешанный";
  }
  const calcMeta = {
    norm: normLabel,
    unit: unitLabel,
    correction: corr,
    calculated: objectType === "жилой" ? round(permanentRaw * k * corr, 2) : round(objectCalc.corrected, 2),
    adopted: permanent
  };

  const result = {
    title: cfg.title,
    document: {
      code: region ? region.label : cfg.document?.code,
      fullTitle: region ? `РНГП/МНГП региона: ${region.label} — ${region.source}` : cfg.document?.fullTitle,
      source: region?.source || ""
    },
    region: region ? { id: region.id, label: region.label, source: region.source } : null,
    summary: inputs.summary || "",
    inputs: {
      f1, f2, f3, apartmentsTotal, sumF, scenarios: inputs.scenarios || [], reductionK: inputs.reductionK || null,
      designStage: inputs.designStage || "", totalArea: toNumber(inputs.totalArea, 0),
      capacity: toNumber(inputs.capacity, 0), occupancy: toNumber(inputs.occupancy, 1),
      population: toNumber(inputs.population, 0), areaPurpose: inputs.areaPurpose || {}
    },
    calcMeta,
    federalApplied: rn.federalApplied || [],
    federalSource: rn.federalSource || "",
    permanent: { byGroups, sumF, Nn: permanent, NnRaw: permanentRaw, k, reduction },
    reduction,
    additional,
    objectFacilities,
    objectPlaces,
    electricVehicles,
    mgn: {
      quota: mgnQuota,
      special: mgnSpecial,
      specOfGuest,
      specOfObject,
      totalBeforeMgn,
      refs: {
        legalQuota: norms.parking.mgn?.legalQuota?.refPoint,
        specialScale: norms.parking.mgn?.specialScale?.refPoint,
        dimensions: norms.parking.mgn?.dimensions
      }
    },
    total,
    totalFormula,
    objectType,
    objectCalc,
    included,
    items: [
      item("Постоянные машино-места", "шт.", permanent, objectType === "жилой" ? (region ? `${region.label} — РНГП/МНГП` : "РНГП/МНГП региона") : "РНГП/СП 42, прил. Ж"),
      ...included.map((a) => item(a.name, "шт.", a.accepted, a.refPoint)),
      ...(objectPlaces > 0 ? [item(`Приобъектные ММ (${objectModeLabel})`, "шт.", objectPlaces, "РНГП/МНГП региона")] : []),
      item("Места с зарядной инфраструктурой (электромобили)", "шт.", evPlaces, electricVehicles.refPoint),
      item("Итоговая потребность", "шт.", total, "РНГП/МНГП; СП 42; СП 113")
    ],
    refs: cfg.refs || []
  };
  result.justification = generateJustification(result, norms);
  return result;
}
