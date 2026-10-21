// blocks/parking.js — Машиноместа по ПП Москвы № 945-ПП
// Постоянные места — приложение 5 (в редакции от 05.08.2026): п. 2 (АГР/АСП) и п. 1 (градостроительное проектирование).
// Приобъектные места — приложение 6: Nв = X / X2 × К1 × К2 (X2 — приложение 1).
// Гостевая парковка — п. 6.2.3.2 (10 % от постоянных); отклонения — п. 6.2.4.1–6.2.4.3.

import { toNumber, ceilInt, round } from "../utils.js";
import { item } from "../engine.js";

// --- Регионы (центральный реестр в norms.regions) ---
export function getRegion(norms, regionId) {
  const list = norms?.regions || [];
  const id = regionId || norms?.parking?.defaultRegion || null;
  return list.find((r) => r.id === id) || list.find((r) => r.id === norms?.parking?.defaultRegion) || list[0] || null;
}

// --- Слияние норм региона: уровень (tier) -> явные значения региона ---
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

  const socialDefaults = norms?.social?.defaults || {};
  const housingTypes = { ...(socialDefaults.housingTypes || {}), ...(s.housingTypes || {}) };

  return {
    region,
    tierId,
    bktK,
    coefficients,
    // К1 — коэффициент пешей доступности рельсового каркаса (приложение 6)
    railZones: p.railZones || tier.railZones || [],
    // X2 — расчётный показатель на одно место по ВРИ (приложение 1)
    x2: p.x2 || {},
    object,
    federalApplied,
    federalSource: fed?.source || "",
    social: {
      zones: s.zones || stier.zones || [],
      defaultZone: s.defaultZone || stier.defaultZone || "zone1",
      sqmPerPerson: s.sqmPerPerson ?? stier.sqmPerPerson ?? socialDefaults.sqmPerPerson ?? 50,
      sqmPerPersonNote: s.sqmPerPersonNote || socialDefaults.sqmPerPersonNote || "",
      housingTypes,
      polyclinic: s.polyclinic || null,
      zonesSource: s.zonesSource || ""
    }
  };
}

// --- Допустимое отклонение от расчётного числа мест (п. 6.2.4.1–6.2.4.3) ---
// kind: "permanent" — постоянные/гостевые/места остановки (±10 %), "object" — приобъектная (±30 %).
export function resolveDeviation(cfg, selection, rn, kind = "permanent") {
  const region = rn?.region || null;
  const dev = cfg?.deviation || {};
  const options = kind === "object" ? dev.objectOptions || dev.options || [] : dev.options || [];
  const fallback = {
    optionId: "none",
    k: 1,
    label: "Отклонение не применяется (k = 1,0)",
    refPoint: dev.refPoint || "",
    source: region?.source || ""
  };
  if (!rn || !options.length) return fallback;
  const optionId = selection?.optionId || dev.defaultOption || "none";
  const opt = options.find((o) => o.id === optionId) || options[0];
  if (!opt || opt.id === "none") return fallback;
  return {
    optionId: opt.id,
    k: toNumber(opt.k, 1),
    label: opt.label || opt.id,
    refPoint: dev.refPoint || "",
    source: region?.source || ""
  };
}

// --- Коэффициент К1 (пешевая доступность рельсового каркаса, приложение 6) ---
export function resolveRailK(rn, selection) {
  const zones = rn?.railZones || [];
  if (!zones.length) {
    return { zoneId: null, k: 1, label: "К1 = 1,0 (региональным нормативом не установлен)", note: "" };
  }
  const zoneId = selection?.zoneId || zones[0].id;
  const zone = zones.find((z) => z.id === zoneId) || zones[0];
  return { zoneId: zone.id, k: toNumber(zone.k, 1), label: zone.label, note: "" };
}

// --- Постоянные машиноместа: приложение 5 (п. 2 — АГР/АСП, п. 1 — градостроительное проектирование) ---
export function calculatePermanent(norms, inputs, rn) {
  const cfg = norms.parking;
  const pm = cfg.permanentMethod || {};
  const method = inputs.parkingMethod || pm.defaultMethod || "agr";
  const f1 = toNumber(inputs.f1, 0);
  const f2 = toNumber(inputs.f2, 0);
  const f3 = toNumber(inputs.f3, 0);
  const counts = [f1, f2, f3];

  let raw;
  let byGroups;
  let formula;
  let refPoint;

  if (method === "pz") {
    const S = toNumber(inputs.apartArea ?? inputs.apartmentsArea, 0);
    const S1 = toNumber(inputs.sqmPerPerson, rn.social.sqmPerPerson);
    const hh = toNumber(inputs.householdSize ?? pm.pz?.defaults?.householdSize, 2.1);
    const D = toNumber(inputs.perApartment ?? pm.pz?.defaults?.D, 0.8);
    raw = S1 > 0 && hh > 0 ? (S / (S1 * hh)) * D : 0;
    formula = "Nп = S / (S1 × 2,1) × D";
    refPoint = pm.pz?.refPoint || "";
    byGroups = [
      {
        id: "pz",
        label: `Расчёт по прил. 5, п. 1: S = ${round(S, 2)} м², S1 = ${S1} м²/чел., 2,1 чел., D = ${D}`,
        count: "",
        coefficient: formula,
        spacesRaw: round(raw, 3),
        spacesRawK: round(raw, 3),
        spaces: 0,
        refPoint
      }
    ];
  } else {
    byGroups = (cfg.groups || []).map((g, i) => {
      const count = counts[i];
      const spacesRaw = round(count * g.coefficient, 3);
      return {
        id: g.id,
        label: g.label,
        count,
        coefficient: g.coefficient,
        spacesRaw,
        spacesRawK: spacesRaw,
        spaces: 0,
        refPoint: pm.agr?.refPoint || ""
      };
    });
    raw = round(byGroups.reduce((s, g) => s + g.spacesRaw, 0), 3);
    formula = pm.agr?.formula || "Nп = A×N1 + B×N2 + C×N3";
    refPoint = pm.agr?.refPoint || "";
  }

  return {
    method,
    methodLabel: method === "pz" ? pm.pz?.label : pm.agr?.label,
    formula,
    refPoint,
    note: method === "pz" ? pm.pz?.note : pm.agr?.note,
    byGroups,
    raw,
    sumF: f1 + f2 + f3
  };
}

// --- Приобъектные машино-места (приложение 6: Nв = X / X2 × К1 × К2) ---
// Режимы сценария:
//   mode = "bkt"      — одна общая площадь S и коэффициент K (на 100 м²) — федеральный ориентир;
//   mode = "functions"— разбивка по функциям: при наличии X2 в регионе применяется X / X2,
//                       иначе S / 100 × K (СП 42.13330.2026, прил. И).
export function calculateObjectFacilities(norms, scenarios, options = {}) {
  const cfg = norms.parking.objectFacilities;
  if (!cfg) return null;

  const regionId = scenarios?.__regionId || norms.parking.defaultRegion || null;
  const rn = resolveRegionNorms(norms, regionId);
  const region = rn.region;
  const x2Map = rn.x2 || {};

  const K1 = toNumber(options.k1, 1);
  const K2 = toNumber(options.k2, 1);
  const deviation = options.deviation || { k: 1, label: "Отклонение не применяется (k = 1,0)", optionId: "none" };

  const divisorOf = (unitId) => {
    const u = (cfg.unitOptions || []).find((x) => x.id === unitId);
    return u ? u.divisor : 100;
  };

  // scenarios: [{ id, label, mode, f, area, K, functions: { funcId: { K, S } } }]
  const results = (scenarios || []).map((sc) => {
    const mode = sc.mode === "functions" ? "functions" : "bkt";
    let rows = [];

    if (mode === "bkt") {
      const S = toNumber(sc.area, 0);
      const bktPreset = rn.bktK ?? cfg.bktK ?? 0;
      const K = toNumber(sc.K ?? bktPreset, bktPreset);
      const raw = (S / 100) * K;
      rows = [
        {
          id: "__bkt",
          label: "БКТ (общая площадь)",
          unit: "per100m2",
          basis: "S / 100 × K",
          K,
          x2: null,
          S,
          raw: round(raw, 3)
        }
      ];
    } else {
      rows = (cfg.functions || [])
        .map((fn) => {
          const o = sc.functions?.[fn.id] || {};
          const S = toNumber(o.S ?? o.E ?? fn.S ?? 0, 0);
          if (S <= 0) return null;
          const x2 = x2Map[fn.id] ?? fn.x2 ?? null;
          const K = toNumber(o.K ?? rn.coefficients?.[fn.id] ?? fn.K, 0);
          const raw = x2 ? S / x2 : (S / divisorOf(fn.unit)) * K;
          return {
            id: fn.id,
            label: fn.label,
            unit: fn.unit,
            basis: x2 ? "X / X2" : "S / 100 × K",
            K,
            x2,
            S,
            raw: round(raw, 3)
          };
        })
        .filter(Boolean);
    }

    const sumRaw = round(rows.reduce((s, x) => s + x.raw, 0), 3);
    const withK = round(sumRaw * K1 * K2, 3);
    const afterDev = round(withK * deviation.k, 3);
    const places = afterDev > 0 ? Math.max(1, ceilInt(afterDev)) : 0;
    return { id: sc.id, label: sc.label, mode, functions: rows, sumRaw, withK, afterDev, places };
  });

  const maxScenario = results.reduce(
    (best, r) => (best === null || r.places > best.places ? r : best),
    null
  );
  const places = maxScenario ? maxScenario.places : 0;

  const hasX2 = Object.keys(x2Map).length > 0;

  return {
    title: cfg.title,
    refPoint: cfg.refPoint,
    note: cfg.note,
    k1: K1,
    k2: K2,
    k1Note: cfg.k1Note || "",
    k2Note: cfg.k2Note || "",
    deviation,
    basis: hasX2 ? "Приложение 6 (Nв = X / X2 × К1 × К2); X2 — приложение 1" : "СП 42.13330.2026, приложение И (S / 100 × K)",
    region,
    regionId,
    results,
    maxScenario,
    places,
    refs: [
      {
        point: "ПП Москвы № 945-ПП, приложение 6",
        requirement: "Nв = X / X2 × К1 × К2; округление в большую сторону (примечание 3)",
        applied: hasX2 ? "Приобъектные места рассчитаны по приложению 6" : "Региональные нормативы X2 отсутствуют — применён федеральный ориентир"
      },
      {
        point: "ПП Москвы № 945-ПП, приложение 1",
        requirement: "Расчётный показатель X2 на одно парковочное место по видам разрешённого использования",
        applied: hasX2 ? "X2 применён по функциям объекта" : "Справочно"
      },
      {
        point: "ПП Москвы № 945-ПП, п. 6.2.4.3",
        requirement: "Отклонение числа приобъектных мест — не более ±30 %",
        applied: deviation.label || "Отклонение не применяется"
      },
      {
        point: "СП 42.13330.2026, приложение И",
        requirement: "Нормы расчёта приобъектных стоянок (федеральный ориентир для регионов без РНГП)",
        applied: hasX2 ? "Справочно" : "Применён как основной расчёт"
      },
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
// Для нежилых типов объектов: база по функциям, затем коэффициенты (ОТ, МФН-буфер, совместное использование).
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
      ref: `${rn.region?.label || "РНГП региона"} / СП 42.13330.2026, прил. И`
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
      ref: `${rn.region?.label || "РНГП региона"} / СП 42.13330.2026, прил. И`
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
      ref: `${rn.region?.label || "РНГП региона"} / СП 42.13330.2026, прил. И`
    });
  }

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
  const dec = (n) => String(n).replace(/(\.\d+?)(0+)$/, "$1").replace(".", ",");

  // Абзац 1 — объект, регион, нормативы
  let p1 = `Расчёт количества машино-мест выполнен для объекта капитального строительства типа «${objectType}»`
    + (funcs.length ? ` (функции: ${funcs.join(", ")})` : "")
    + ` в регионе «${regionLabel}». Применены нормативы: ${rnghSource}. `
    + `Приоритет отдан региональным нормативам градостроительного проектирования (РНГП/МНГП субъекта РФ, ст. 29.2 ГрК РФ); `
    + `федеральный ориентир при недостаточности данных — СП 42.13330.2026 (приложение И). `
    + `Планировочные требования (габариты, уклоны, места для МГН) учтены по СП 113.13330.2023.`
    + ((b.federalApplied || []).length
      ? ` Контроль федерального минимума (Приказ Минстроя РФ № 250/пр): отдельные региональные нормативы оказались ниже федерального минимума и заменены федеральными значениями — ${b.federalApplied.join("; ")}.`
      : "");
  paras.push(p1);

  // Абзац 2 — базовый расчёт постоянных мест
  if (objectType === "жилой" && b.permanent?.byGroups) {
    if (b.permanent.method === "pz") {
      const g = b.permanent.byGroups[0];
      paras.push(`Базовый расчёт постоянных машино-мест выполнен по приложению 5 (в редакции от 05.08.2026), п. 1: ${g.label}. `
        + `Расчётное значение — ${dec(round(b.permanent.NnRaw, 2))} мест; округление итога — в большую сторону.`);
    } else {
      const g = b.permanent.byGroups.map((x) => `${x.label} — ${x.count} × ${x.coefficient}`).join("; ");
      paras.push(`Базовый расчёт постоянных машино-мест выполнен по приложению 5 (в редакции от 05.08.2026), п. 2: ${g}. `
        + `Расчётное значение — ${dec(round(b.permanent.NnRaw, 2))} мест; округление итога — в большую сторону.`);
    }
  } else if (b.objectCalc) {
    const desc = b.objectCalc.components.map((c) => `${c.name} — ${c.method}`).join("; ");
    paras.push(`Базовый расчёт выполнен по функциям объекта: ${desc}. `
      + `Суммарная база (без корректирующих коэффициентов) — ${dec(b.objectCalc.rawBase)} мест.`);
  }

  // Абзац 3 — отклонения и коэффициенты
  if (b.objectCalc?.coefficients?.length) {
    const cd = b.objectCalc.coefficients.map((c) => `${c.name} — коэффициент ${dec(c.k)} (${c.effect})`).join("; ");
    paras.push(`Применены корректирующие коэффициенты: ${cd}. `
      + `После применения — ${dec(b.objectCalc.corrected)} мест, что с округлением вверх даёт ${b.permanent.Nn} постоянных машино-мест.`);
    if (b.objectCalc.coefficients.some((c) => c.name.startsWith("Совместное"))) {
      paras.push(`Совместное использование мест обосновано: пиковые нагрузки функций не совпадают, применён понижающий коэффициент в диапазоне ${oc.sharedUse ? dec(oc.sharedUse.min) + "–" + dec(oc.sharedUse.max) : "0,8–0,9"}.`);
    }
  } else if (b.permanent?.k && b.permanent.k !== 1) {
    paras.push(`Применено допустимое отклонение от расчётного числа мест: ${b.deviation?.label || ""} (k = ${dec(b.permanent.k)}) `
      + `в пределах п. 6.2.4.1 ПП № 945-ПП; постоянные машиноместа — ${b.permanent.Nn} (округление вверх). `
      + `При отклонении более 10 % требуется решение ГЗК Москвы (п. 6.2.4.2).`);
  } else {
    paras.push(`Отклонения от расчётного числа мест не применялись (п. 6.2.4.1 ПП № 945-ПП). Постоянные машиноместа — ${b.permanent.Nn} (округление вверх).`);
  }

  // Абзац 4 — приобъектные места
  if (b.objectPlaces > 0 && b.objectFacilities) {
    const of = b.objectFacilities;
    const rows = (of.maxScenario?.functions || []).map((x) => `${x.label} — ${x.basis} = ${x.raw}`).join("; ");
    paras.push(`Приобъектные машиноместа рассчитаны по приложению 6 ПП № 945-ПП: ${rows}; `
      + `К1 (пешевая доступность рельсового каркаса) = ${dec(of.k1)}, К2 (коэффициент деловой активности) = ${dec(of.k2)}; `
      + `итого — ${of.places} мест (округление вверх).`);
  }

  // Абзац 5 — гостевые и МГН
  const guest = b.additional?.find((a) => a.id === "guest");
  const guestTxt = guest && guest.accepted > 0
    ? `Гостевые машиноместа приняты в количестве ${guest.accepted} (10 % от числа постоянных мест по п. 6.2.3.2 ПП № 945-ПП). `
    : "Гостевые машиноместа не предусмотрены. ";
  paras.push(guestTxt
    + `Итого постоянных и гостевых мест — ${b.mgn.totalBeforeMgn - (b.objectPlaces || 0)}. `
    + `Места для МГН определены по ФЗ № 181-ФЗ (ст. 15): не менее 10 % от общего числа мест и не менее одного — принято ${b.mgn.quota} мест `
    + `(специализированных по шкале СП 59.13330.2020 — ${b.mgn.special}). `
    + `Габариты специализированных мест 6,0 × 3,6 м (СП 113.13330.2023, СП 59.13330.2020); округление — вверх. `
    + `Места для МГН входят в общее количество и подлежат выделению в планировке.`
    + (b.permanent?.invalidPlaces > 0
      ? ` Из числа постоянных мест выделено ${b.permanent.invalidPlaces} мест постоянного размещения для инвалидов (п. 6.2.3.7).`
      : ""));

  // Абзац 6 — особые условия
  const special = (b.summary || "").trim();
  paras.push(special
    ? `Особые условия (ГПЗУ/ППТ): ${special}. Данные условия имеют приоритет над общими нормативами и учтены в расчёте.`
    : `Особые условия ГПЗУ/ППТ, ограничивающие количество или тип парковок, не предъявлены. При наличии они имеют приоритет над расчётными нормативами и требуют повторного пересчёта.`);

  // Итог
  paras.push(`Итоговое количество машино-мест (с округлением вверх): ${b.total}. Расчёт выполнен по ПП Москвы № 945-ПП (приложения 5, 6, 1), СП 42.13330.2026, СП 113.13330.2023, СП 59.13330.2020 и региональным нормативам (${regionLabel}).`);

  return paras.filter(Boolean).join("\n\n");
}

// Ручные значения доп. составляющих хранятся в UI (state), передаются сюда.
export function calculateParking(norms, inputs, manual = {}) {
  const cfg = norms.parking;

  const f1 = toNumber(inputs.f1, 0);
  const f2 = toNumber(inputs.f2, 0);
  const f3 = toNumber(inputs.f3, 0);
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

  // Отклонения от расчётного числа мест (п. 6.2.4) и К1 (приложение 6)
  const deviation = resolveDeviation(cfg, inputs.deviation, rn, "permanent");
  const objectDeviation = resolveDeviation(cfg, inputs.objectDeviation, rn, "object");
  const rail = resolveRailK(rn, inputs.railZone);

  // Постоянные машиноместа зависят от типа объекта:
  //   жилой — приложение 5 (п. 2 — АГР/АСП; п. 1 — градостроительное проектирование);
  //   ТЦ / офис / школа / поликлиника / МФН — объектно-ориентированный расчёт.
  let byGroups;
  let permanent;
  let permanentRaw;
  let sumF;
  let objectCalc = null;
  let permanentMethod = null;

  if (objectType === "жилой") {
    permanentMethod = calculatePermanent(norms, inputs, rn);
    byGroups = permanentMethod.byGroups;
    permanentRaw = permanentMethod.raw;
    const withDev = round(permanentRaw * deviation.k * corr, 3);
    permanent = withDev > 0 ? Math.max(1, ceilInt(withDev)) : 0;
    // Округление по итогу (не по группам) — срок 6.2.4 и примечание 3 к приложению 6
    byGroups = byGroups.map((g) => ({ ...g, spacesRawK: round(g.spacesRaw * deviation.k * corr, 3) }));
    sumF = permanentMethod.sumF;
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

  // Места постоянного размещения для инвалидов (п. 6.2.3.7) — выделяются из числа постоянных
  const invalidApartments = toNumber(inputs.invalidApartments, 0);
  const invalidPlaces = permanent > 0 ? Math.min(invalidApartments, permanent) : 0;

  // Дополнительные составляющие
  const additional = (cfg.additional || []).map((a) => {
    let calculated = 0;
    let accepted = 0;

    if (a.type === "percentOfPermanent") {
      calculated = round(permanent * a.percent, 3);
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

  // Проверка минимума по СП 42.13330.2026, п. 8.117 (гостевые места — не менее 30 на 1000 жителей)
  const population = toNumber(inputs.population, 0);
  const guestMinPer1000 = toNumber(cfg.constants?.guestPer1000, 30);
  const guestMinimum = population > 0 ? ceilInt((population / 1000) * guestMinPer1000) : 0;
  const guestCheck = {
    minimum: guestMinimum,
    per1000: guestMinPer1000,
    refPoint: "СП 42.13330.2026, п. 8.117 (или в соответствии с НГП/РНГП/МНГП)",
    ok: guestMinimum === 0 || guestAccepted >= guestMinimum,
    note: guestMinimum === 0
      ? "Население не задано — проверка минимума по п. 8.117 не выполняется"
      : guestAccepted >= guestMinimum
        ? `Гостевых мест ${guestAccepted} — минимум по п. 8.117 (${guestMinimum}) соблюдён`
        : `Гостевых мест ${guestAccepted} — меньше минимума по п. 8.117 СП 42.13330.2026 (${guestMinimum}); применяется НГП/РНГП/МНГП либо увеличивается число гостевых мест`
  };

  // --- Электромобили ---
  const evCfg = norms.parking.electricVehicles || {};
  const evPct = toNumber(evCfg.percent ?? 0.10, 0.10);
  const evRaw = round(permanent * evPct, 3);
  const evPlaces = permanent > 0 ? Math.max(1, ceilInt(evRaw)) : 0;
  const electricVehicles = {
    percent: evPct,
    raw: evRaw,
    places: evPlaces,
    infrastructureNote: evCfg.infrastructureNote || "Инженерная инфраструктура: кабель-каналы или шинопроводы учесть на 100 % машино-мест.",
    refPoint: evCfg.refPoint || "НГП/РНГП региона (зарядная инфраструктура)",
    note: evCfg.note || `${Math.round(evPct * 100)} % от постоянных машино-мест`
  };

  // --- Приобъектные ММ (приложение 6) ---
  const scenarios = inputs.scenarios || [];
  if (inputs.regionId) scenarios.__regionId = inputs.regionId;
  const objectFacilities = calculateObjectFacilities(norms, scenarios, {
    k1: rail.k,
    k2: toNumber(inputs.k2, 1),
    deviation: objectDeviation
  });
  const objectPlaces = objectFacilities ? objectFacilities.places : 0;

  // --- МГН (справочные строки; в итог НЕ добавляются) ---
  const baseTotal = permanent + included.reduce((s, a) => s + a.accepted, 0);
  const totalBeforeMgn = round(baseTotal + objectPlaces, 0);
  const mgnQuota = calculateMgnQuota(norms, totalBeforeMgn);
  const mgnSpecial = calculateMgnSpecial(norms, totalBeforeMgn);

  const guestPct = norms.parking.constants?.mgnSpecialOfGuestPct ?? 0.10;
  const objectPct = norms.parking.constants?.mgnSpecialOfObjectPct ?? 0.10;
  const specOfGuest = guestAccepted > 0 ? Math.max(1, ceilInt(guestPct * guestAccepted)) : 0;
  const specOfObject = objectPlaces > 0 ? Math.max(1, ceilInt(objectPct * objectPlaces)) : 0;

  // --- Итоговая потребность ---
  const total = totalBeforeMgn;

  const objectModeLabel = objectFacilities?.maxScenario?.mode === "functions" ? "Функционал" : "БКТ";

  const totalFormula = [
    `${permanent}`,
    ...included.map((a) => `+ ${a.accepted} (${a.name})`),
    ...(objectPlaces > 0 ? [`+ ${objectPlaces} (Приобъектные машиноместа (Итого))`] : [])
  ].join(" ");

  const k = deviation.k;
  const region = rn.region;

  // --- Нормативная удалённость машиномест (п. 6.1.2.5) ---
  const accessibility = {
    refPoint: "ПП Москвы № 945-ПП, п. 6.1.2.5",
    rows: [
      { type: "Постоянные места", limit: "не далее 1200 м" },
      { type: "Гостевая парковка", limit: "не далее 200 м" },
      { type: "Приобъектная парковка", limit: "не далее 200 м" }
    ],
    note: "Проверьте расстояния по генплану: расчётные значения нормативом не задаются."
  };

  // --- Расчётные показатели (спецификация: N_мм = N_норм × Q × K_корр) ---
  const regionLabel2 = region?.label || "регион";
  let normLabel;
  let unitLabel;
  if (objectType === "жилой") {
    if (permanentMethod?.method === "pz") {
      normLabel = `${permanentMethod.formula} (S — площадь квартир, S1 — м²/чел., D = 0,8)`;
    } else {
      normLabel = `N = F1×${cfg.groups[0]?.coefficient} + F2×${cfg.groups[1]?.coefficient} + F3×${cfg.groups[2]?.coefficient} (мест/квартира)`;
    }
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
      f1, f2, f3, apartmentsTotal, sumF, scenarios: inputs.scenarios || [],
      deviation: inputs.deviation || null, objectDeviation: inputs.objectDeviation || null,
      railZone: inputs.railZone || null, k2: toNumber(inputs.k2, 1),
      parkingMethod: permanentMethod?.method || "", apartArea: toNumber(inputs.apartArea ?? inputs.apartmentsArea, 0),
      invalidApartments,
      totalArea: toNumber(inputs.totalArea, 0),
      capacity: toNumber(inputs.capacity, 0), occupancy: toNumber(inputs.occupancy, 1),
      population: toNumber(inputs.population, 0), areaPurpose: inputs.areaPurpose || {}
    },
    calcMeta,
    federalApplied: rn.federalApplied || [],
    federalSource: rn.federalSource || "",
    permanent: {
      byGroups,
      sumF,
      Nn: permanent,
      NnRaw: permanentRaw,
      k,
      deviation,
      method: permanentMethod?.method || "",
      methodLabel: permanentMethod?.methodLabel || "",
      formula: permanentMethod?.formula || "",
      refPoint: permanentMethod?.refPoint || "",
      methodNote: permanentMethod?.note || "",
      invalidPlaces
    },
    deviation,
    objectDeviation,
    rail,
    accessibility,
    additional,
    guestCheck,
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
        dimensions: norms.parking.mgn?.dimensions,
        invalid: norms.parking.mgn?.invalid?.refPoint
      }
    },
    total,
    totalFormula,
    objectType,
    objectCalc,
    included,
    items: [
      item("Постоянные машино-места", "шт.", permanent, objectType === "жилой" ? (region ? `${region.label} — ПП № 945-ПП, прил. 5` : "ПП № 945-ПП, прил. 5") : "РНГП/СП 42.13330.2026, прил. И"),
      ...included.map((a) => item(a.name, "шт.", a.accepted, a.refPoint)),
      ...(objectPlaces > 0 ? [item(`Приобъектные ММ (${objectModeLabel})`, "шт.", objectPlaces, "ПП № 945-ПП, прил. 6")] : []),
      item("Места с зарядной инфраструктурой (электромобили)", "шт.", evPlaces, electricVehicles.refPoint),
      item("Итоговая потребность", "шт.", total, "ПП № 945-ПП; СП 42.13330.2026; СП 113.13330.2023")
    ],
    refs: cfg.refs || []
  };
  result.justification = generateJustification(result, norms);
  return result;
}
