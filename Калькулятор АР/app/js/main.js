// main.js — инициализация, табы, связка UI ↔ движок

import { fieldValue, toNumber, fmtRu, ceilInt, setText, escapeHtml, todayISO } from "./utils.js";
import { createResult, aggregate } from "./engine.js";
import { calculateParking, resolveRegionNorms } from "./blocks/parking.js";
import { calculateTko } from "./blocks/tko.js";
import { calculateSocial } from "./blocks/social.js";
import { calculateElevators } from "./blocks/elevators.js";
import { downloadHtmlDocument } from "./export/htmlDoc.js";
import { exportXlsx } from "./export/xlsx.js";
import { downloadSummaryCsv } from "./export/csv.js";
import { downloadWordDocument } from "./export/word.js";
import { buildSummaryRows, SUMMARY_HEADERS } from "./summary.js";
import { runNormCheck, renderNormCheck, restoreJournal, getLastJournal, downloadJournalCsv } from "./normcheck.js";

let norms = null;
let lastResult = null;
// Принятое количество лифтов введено пользователем (например, результат расчёта по ГОСТ Р 52941)
let elAdoptedManual = false;

// Состояние блока Parking
const parkingState = {
  regionId: null,
  objectType: "жилой",
  // Выбранные функции объекта (чекбоксы в «Исходных данных»). Управляют показом
  // площадей по назначению и составом объектного расчёта.
  functions: ["residential"],
  // Площади по назначению, вместимость, население (вкладка «Исходные данные», единый источник правды)
  inputData: {
    totalArea: 0,
    areas: { residential: 0, trade: 0, school: 0, medical: 0, office: 0 },
    capacity: 0,
    occupancy: 1,
    population: 0
  },
  // Объектно-ориентированные параметры (вкладка «Исходные данные»)
  objParams: { unitsCount: 0, housingClass: "эконом", mallType: "районный", employees: 0 },
  objCoefficients: { otProximity: false, mfn: false, sharedUse: 0 },
  // Отклонение от расчётного числа мест (945-ПП, п. 6.2.4.1 — постоянные/гостевые/места остановки ±10 %)
  deviation: { optionId: "none" },
  // Отклонение для приобъектной парковки (п. 6.2.4.3 — ±30 %)
  objectDeviation: { optionId: "none" },
  // К1 — пешевая доступность рельсового каркаса (приложение 6)
  railZone: { zoneId: null },
  // К2 — коэффициент деловой активности (приложение 3)
  k2: 1,
  // Метод расчёта постоянных мест: "agr" — прил. 5 п. 2, "pz" — прил. 5 п. 1
  parkingMethod: "agr",
  // Квартиры для проживания инвалидов (п. 6.2.3.7)
  invalidApartments: 0,
  // Приобъектные ММ: сценарии. Каждый: { id, label, mode:'bkt'|'functions', f, area, K, functions:{funcId:{K,S}} }
  scenarios: []
};

// Какие площади по назначению требуются для каждого типа объекта (набор функций по умолчанию)
const AREA_PURPOSES_BY_TYPE = {
  "жилой": ["residential"],
  "торговый": ["trade"],
  "школа": ["school"],
  "поликлиника": ["medical"],
  "офисный": ["office"],
  "многофункциональный": ["residential", "trade", "school", "medical", "office"]
};

// Синхронизация чекбоксов функций с состоянием
function syncFunctionCheckboxes() {
  document.querySelectorAll("input[data-function]").forEach((el) => {
    el.checked = parkingState.functions.includes(el.dataset.function);
  });
}

// Текущий регион (из центрального реестра norms.regions)
function currentRegion() {
  const list = norms?.regions || [];
  const id = parkingState.regionId || norms?.parking?.defaultRegion;
  return list.find((r) => r.id === id) || list[0] || null;
}

// Слияние норм текущего региона с уровнем (tier)
function currentRegionNorms() {
  return resolveRegionNorms(norms, parkingState.regionId);
}

// Функция K_i по выбранному региону/уровню (или null)
function regionK(funcId) {
  const rn = currentRegionNorms();
  const v = rn?.coefficients?.[funcId];
  return v != null ? toNumber(v, 0) : null;
}

// Общий коэффициент K для режима «БКТ» (справочный, из региона/уровня)
function regionBktK() {
  const rn = currentRegionNorms();
  return toNumber(rn?.bktK ?? 0, 0);
}

function newFunctionsMap() {
  const cfg = norms.parking.objectFacilities;
  const map = {};
  cfg.functions.forEach((fn) => {
    const preset = regionK(fn.id);
    map[fn.id] = { K: preset != null ? preset : fn.K, S: 0 };
  });
  return map;
}

function initScenarios() {
  const cfg = norms?.parking?.objectFacilities;
  if (!cfg) return;
  parkingState.regionId = parkingState.regionId || norms.parking.defaultRegion || null;
  const defaults = (cfg.scenarios || [{ id: "s1", label: "Функция коммерческих помещений" }]).map((s, idx) => ({
    id: s.id || "s" + (idx + 1),
    label: s.label || "Функция коммерческих помещений",
    mode: s.mode === "functions" ? "functions" : "bkt",
    f: 1,
    area: 0,
    K: regionBktK(),
    functions: newFunctionsMap()
  }));
  parkingState.scenarios = defaults;
}

async function loadNorms() {
  // 1) При работе через локальный сервер — внешний файл data/norms.json
  //    (единый источник правды: правки подхватываются без перегенерации копии в index.html).
  if (typeof window !== "undefined" && window.location && window.location.protocol !== "file:") {
    try {
      const res = await fetch("data/norms.json", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        window.NORMS_SOURCE = "data/norms.json (внешний файл)";
        console.info("[Калькулятор АР] Нормативная база загружена из data/norms.json");
        return data;
      }
    } catch (_) {
      /* файл недоступен — используем встроенную копию */
    }
  }
  // 2) Встроенная копия (работает оффлайн, file://) — из index.html
  if (typeof window !== "undefined" && window.NORMS) {
    window.NORMS_SOURCE = "встроенная копия в index.html (офлайн-режим)";
    console.info("[Калькулятор АР] Нормативная база загружена из встроенной копии (офлайн)");
    return window.NORMS;
  }
  throw new Error("Нормативная база не найдена");
}

function switchTab(id) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === id));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + id));
}

// --- Выбор Региона (выпадающая вкладка) ---
function renderRegionSelect() {
  const sel = document.getElementById("regionSelect");
  if (!sel) return;
  const list = norms.regions || [];
  const effectiveId = parkingState.regionId || norms.parking.defaultRegion;
  sel.innerHTML = list
    .map((r) => `<option value="${r.id}">${r.label}</option>`)
    .join("");
  sel.value = effectiveId;
  if (!sel.dataset.bound) {
    sel.dataset.bound = "1";
    sel.addEventListener("change", () => selectRegion(sel.value));
  }
  updateRegionNote();
}

function updateRegionNote() {
  const note = document.getElementById("regionNote");
  const region = currentRegion();
  if (note && region) {
    const src = typeof window !== "undefined" && window.NORMS_SOURCE ? ` · База: ${window.NORMS_SOURCE}` : "";
    note.textContent = `Источник РНГП/МНГП: ${region.source}. ${region.note || ""}${src}`;
  }
}

function selectRegion(id) {
  parkingState.regionId = id;
  // перестроить сценарии под коэффициенты нового региона
  parkingState.scenarios.forEach((sc) => {
    sc.K = regionBktK();
    sc.functions = newFunctionsMap();
  });
  // сбросить зону К1 (пешевая доступность рельсового каркаса) на первую зону нового региона
  const zones = currentRegionNorms()?.railZones || [];
  parkingState.railZone.zoneId = zones.length ? zones[0].id : null;
  syncNormativeFields();
  updateRegionNote();
  reParking();
  reSocial();
}

// Нормативные значения — подставляются из нормативной базы выбранного региона
function syncNormativeFields() {
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el && v != null && v !== "" && Number(el.value) !== Number(v)) el.value = v;
  };
  const setValOrEmpty = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v == null ? "" : v;
  };
  const td = norms?.tko?.defaults || {};
  setVal("tkoN", td.n);
  setVal("tkoSeason", td.seasonalCoeff);
  setVal("tkoDensity", td.density);
  setVal("tkoKn", td.Kn);
  setVal("tkoKz", td.Kz);
  setVal("tkoKpr", td.Kpr);

  const rn = currentRegionNorms();

  // Тип застройки (ПП № 2152-ПП, таблица 1.4.1): МКД — 50, ИЖД — 56, блокированная — 67, ВГК — 80 м²/чел.
  const housingTypes = rn?.social?.housingTypes || norms?.social?.defaults?.housingTypes || {};
  const htSel = document.getElementById("socialHousingType");
  if (htSel) {
    const keep = htSel.value;
    htSel.innerHTML = Object.values(housingTypes)
      .map((t) => `<option value="${t.id}">${t.label} — ${t.sqm} м²/чел.</option>`)
      .join("");
    htSel.value = keep && housingTypes[keep] ? keep : (Object.keys(housingTypes)[0] || "");
    if (!htSel.dataset.bound) {
      htSel.dataset.bound = "1";
      htSel.addEventListener("change", () => {
        syncNormativeFields();
        reSocial();
        reParking();
      });
    }
  }
  const ht = housingTypes[htSel?.value] || {};
  const sqm = ht.sqm ?? rn?.social?.sqmPerPerson ?? norms?.social?.defaults?.sqmPerPerson;
  if (sqm != null) {
    setVal("socialSqm", sqm);
    setVal("parkingSqmPerPerson", sqm);
  }

  // Поликлиники — региональные нормативы в области здравоохранения
  const pc = rn?.social?.polyclinic || {};
  setValOrEmpty("socialPcChild", pc.childPer1000);
  setValOrEmpty("socialPcAdult", pc.adultPer1000);
  setValOrEmpty("socialPcMixed", pc.mixedPer1000);
  setValOrEmpty("socialArea", pc.areaPerVisit);
  const pcSrc = document.getElementById("socialPcSource");
  if (pcSrc) {
    pcSrc.textContent = pc.source
      ? `Источник: ${pc.source}.${pc.note ? " " + pc.note : ""}`
      : "Источник: РНГП/МНГП региона в области здравоохранения — значения не заданы, введите их вручную по региональному нормативу.";
  }
}

// --- Рендер вкладки «Исходные данные» (тип объекта, класс, ТЦ, офис, коэффициенты) ---
function renderInputTab() {
  renderRegionSelect();

  const otSel = document.getElementById("objectTypeSelect");
  if (otSel) {
    otSel.innerHTML = (norms.parking.objectTypes || []).map((t) => `<option value="${t.id}">${t.label}</option>`).join("");
    otSel.value = parkingState.objectType;
    if (!otSel.dataset.bound) {
      otSel.dataset.bound = "1";
      otSel.addEventListener("change", () => {
        parkingState.objectType = otSel.value;
        // При смене типа возвращаем набор функций по умолчанию для этого типа;
        // дополнительные функции пользователь может включить вручную.
        parkingState.functions = [...(AREA_PURPOSES_BY_TYPE[otSel.value] || [])];
        syncFunctionCheckboxes();
        updateInputVisibility();
        reParking();
        validateInputTab();
        reElevators();
        reSocial();
      });
    }
  }

  // Функции объекта: чекбоксы управляют показом площадей по назначению
  document.querySelectorAll("input[data-function]").forEach((cb) => {
    if (cb.dataset.bound) return;
    cb.dataset.bound = "1";
    cb.addEventListener("change", () => {
      parkingState.functions = [...document.querySelectorAll("input[data-function]")]
        .filter((el) => el.checked)
        .map((el) => el.dataset.function);
      updateInputVisibility();
      validateInputTab();
      reParking();
      reSocial();
    });
  });
  syncFunctionCheckboxes();

  const hcSel = document.getElementById("housingClassSelect");
  if (hcSel) {
    hcSel.innerHTML = (norms.parking.housingClasses || []).map((c) => `<option value="${c.id}">${c.label}</option>`).join("");
    hcSel.value = parkingState.objParams.housingClass;
    if (!hcSel.dataset.bound) { hcSel.dataset.bound = "1"; hcSel.addEventListener("change", () => { parkingState.objParams.housingClass = hcSel.value; reParking(); }); }
  }

  const mtSel = document.getElementById("mallTypeSelect");
  if (mtSel) {
    mtSel.innerHTML = (norms.parking.mallTypes || []).map((c) => `<option value="${c.id}">${c.label}</option>`).join("");
    mtSel.value = parkingState.objParams.mallType;
    if (!mtSel.dataset.bound) { mtSel.dataset.bound = "1"; mtSel.addEventListener("change", () => { parkingState.objParams.mallType = mtSel.value; reParking(); }); }
  }

  const bindNum = (id, key) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.bound) { el.dataset.bound = "1"; el.addEventListener("input", () => { parkingState.objParams[key] = toNumber(el.value, 0); reParking(); }); }
  };
  bindNum("objUnits", "unitsCount");
  bindNum("objEmployees", "employees");

  // Общая площадь, площади по назначению, вместимость, загрузка, население
  const idm = parkingState.inputData;
  const bindInput = (id, fn) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.bound) {
      el.dataset.bound = "1";
      el.addEventListener("input", () => { fn(el); validateInputTab(); reParking(); });
      el.addEventListener("change", () => { fn(el); validateInputTab(); reParking(); });
    }
  };
  bindInput("totalArea", (el) => { idm.totalArea = toNumber(el.value, 0); });
  bindInput("areaResidential", (el) => { idm.areas.residential = toNumber(el.value, 0); });
  bindInput("areaTrade", (el) => { idm.areas.trade = toNumber(el.value, 0); });
  bindInput("areaSchool", (el) => { idm.areas.school = toNumber(el.value, 0); });
  bindInput("areaMedical", (el) => { idm.areas.medical = toNumber(el.value, 0); });
  bindInput("areaOffice", (el) => { idm.areas.office = toNumber(el.value, 0); });
  bindInput("capacity", (el) => { idm.capacity = toNumber(el.value, 0); });
  bindInput("occupancy", (el) => { idm.occupancy = toNumber(el.value, 1); });
  bindInput("population", (el) => { idm.population = toNumber(el.value, 0); });

  // Коэффициент корректировки K_корр (в блоке «Машиноместа», «Постоянные»)
  const pmCorr = document.getElementById("pmCorrection");
  if (pmCorr && !pmCorr.dataset.bound) {
    pmCorr.dataset.bound = "1";
    pmCorr.addEventListener("input", () => reParking());
  }

  const coefOt = document.getElementById("coefOt");
  if (coefOt && !coefOt.dataset.bound) { coefOt.dataset.bound = "1"; coefOt.addEventListener("change", () => { parkingState.objCoefficients.otProximity = coefOt.checked; reParking(); }); }
  const coefMfn = document.getElementById("coefMfn");
  if (coefMfn && !coefMfn.dataset.bound) { coefMfn.dataset.bound = "1"; coefMfn.addEventListener("change", () => { parkingState.objCoefficients.mfn = coefMfn.checked; reParking(); }); }
  const coefShared = document.getElementById("coefShared");
  if (coefShared && !coefShared.dataset.bound) { coefShared.dataset.bound = "1"; coefShared.addEventListener("change", () => { parkingState.objCoefficients.sharedUse = toNumber(coefShared.value, 0); reParking(); }); }

  updateInputVisibility();
}

function updateInputVisibility() {
  const t = parkingState.objectType;
  const show = (el, types) => { if (el) el.style.display = types.includes(t) ? "" : "none"; };
  const OBJ_TYPES = ["торговый", "офисный", "многофункциональный"];

  show(document.getElementById("grpHousing"), ["жилой"]);
  show(document.getElementById("grpObj"), OBJ_TYPES);
  show(document.getElementById("grpCoef"), OBJ_TYPES);

  document.querySelectorAll("[data-obj]").forEach((el) => {
    const k = el.dataset.obj;
    if (k === "mfn") show(el, ["многофункциональный"]);
    else if (k === "mall") show(el, ["торговый", "многофункциональный"]);
    else if (k === "office") show(el, ["офисный", "многофункциональный"]);
    // k === "coef" — обработано выше (grpCoef)
  });

  // Площади показываются для выбранных функций объекта (чекбоксы «Функции объекта»)
  const activeFunctions = parkingState.functions || [];
  document.querySelectorAll("input[data-purpose]").forEach((inp) => {
    const label = inp.closest("label");
    if (label) label.style.display = activeFunctions.includes(inp.dataset.purpose) ? "" : "none";
  });
  document.querySelectorAll("[data-for]").forEach((el) => {
    const types = el.dataset.for.split(",").map((s) => s.trim());
    el.style.display = types.includes(t) ? "" : "none";
  });

  // Приобъектные ММ рассчитываются для всех типов (в т.ч. встроенная коммерция в жилье);
  // гостевые — для жилья/МФН
  show(document.getElementById("grpGuest"), ["жилой", "многофункциональный"]);

  // Социальное обеспечение рассчитывается только для жилья (включая жилую часть МФН)
  const socialRelevant = ["жилой", "многофункциональный"].includes(t);
  const socialTab = document.querySelector('.tab[data-tab="social"]');
  if (socialTab) socialTab.style.display = socialRelevant ? "" : "none";
  if (!socialRelevant && document.querySelector(".tab.active")?.dataset.tab === "social") switchTab("input");

  // Назначение лифтов следует за типом объекта (пока не изменено вручную)
  const elp = document.getElementById("elPurpose");
  if (elp && !elp.dataset.touched) elp.value = t === "жилой" ? "residential" : "public";
}

// --- Валидация вкладки «Исходные данные» (спецификация initial_data.validations) ---
function validateInputTab() {
  const box = document.getElementById("inputValidations");
  if (!box) return;
  const idm = parkingState.inputData;
  const msgs = [];

  const activeFunctions = parkingState.functions || [];
  const areaSum = Object.entries(idm.areas)
    .filter(([key]) => activeFunctions.includes(key))
    .reduce((s, [, v]) => s + Math.max(0, v), 0);
  if (activeFunctions.length === 0) {
    msgs.push({ cls: "warn", text: "Не выбрано ни одной функции объекта — площади по назначению не учитываются в расчёте." });
  }
  if (idm.totalArea > 0 && areaSum > idm.totalArea + 0.01) {
    msgs.push({ cls: "err", text: `Σ площадей по назначению = ${fmtRu(areaSum, 2)} м² превышает общую площадь ${fmtRu(idm.totalArea, 2)} м² (проверка: sum(area_by_purpose) ≤ total_area).` });
  } else if (idm.totalArea > 0 && areaSum > 0 && Math.abs(idm.totalArea - areaSum) < 0.01) {
    msgs.push({ cls: "warn", text: `Площади по назначению заполняются без остатка — сумма ${fmtRu(areaSum, 2)} м² = общей площади; сверьте с экспликацией.` });
  }

  const pop = idm.population;
  if (pop > 0 && idm.totalArea > 0) {
    const dens = idm.totalArea / pop; // м²/чел.
    if (parkingState.objectType === "жилой") {
      if (dens < 20 || dens > 60) {
        msgs.push({ cls: "warn", text: `Плотность ${fmtRu(dens, 1)} м²/чел. вне диапазона для МКД (20–60 м²/чел.) — проверьте население/общую площадь.` });
      }
    } else if (parkingState.objectType === "офисный" || parkingState.objectType === "многофункциональный") {
      if (dens < 6 || dens > 15) {
        msgs.push({ cls: "warn", text: `Плотность ${fmtRu(dens, 1)} м²/раб.место вне диапазона для офисов (6–15 м²/раб.место) — проверьте численность/площадь.` });
      }
    }
  }

  const occ = idm.occupancy;
  if (occ < 0.5 || occ > 1.2) {
    msgs.push({ cls: "err", text: `Коэффициент загрузки ${fmtRu(occ, 2)} вне допустимого диапазона 0,5–1,2.` });
  }

  // Валидация 3 (спецификация): региональный норматив не ниже федерального минимума (Приказ № 250/пр)
  if (norms) {
    try {
      const rn = resolveRegionNorms(norms, parkingState.regionId);
      if ((rn.federalApplied || []).length) {
        msgs.push({
          cls: "warn",
          text: `Региональный норматив ниже федерального минимума (Приказ Минстроя РФ № 250/пр): ${rn.federalApplied.join("; ")} — принято федеральное значение${rn.federalSource ? ` (${rn.federalSource})` : ""}.`
        });
      }
    } catch (_) { /* нормы ещё не загружены */ }
  }

  box.innerHTML = msgs.map((m) => `<span class="${m.cls}">${escapeHtml(m.text)}</span>`).join("");
}

function parkingInputs() {
  const idm = parkingState.inputData;
  const type = parkingState.objectType;
  const functions = [...(parkingState.functions || [])];

  // В расчёт попадают площади только выбранных функций объекта
  const areaPurpose = {};
  functions.forEach((key) => { areaPurpose[key] = idm.areas[key] || 0; });

  const objParams = { ...parkingState.objParams };
  if (type !== "многофункциональный") objParams.unitsCount = 0;       // квартиры по классу — только МФН
  if (!(functions.includes("office") || ["офисный", "многофункциональный"].includes(type))) objParams.employees = 0;
  if (!(functions.includes("trade") || ["торговый", "многофункциональный"].includes(type))) objParams.mallType = "районный";

  const objCoefficients = ["торговый", "офисный", "многофункциональный"].includes(type)
    ? { ...parkingState.objCoefficients }
    : { otProximity: false, mfn: false, sharedUse: 0 };

  const usesCapacity = (type === "школа" && functions.includes("school"))
    || (type === "поликлиника" && functions.includes("medical"));

  return {
    objectName: fieldValue("objectName"),
    objectType: type,
    functions,
    apartmentsTotal: toNumber(fieldValue("apartmentsTotal"), 0),
    f1: toNumber(fieldValue("f1"), 0),
    f2: toNumber(fieldValue("f2"), 0),
    f3: toNumber(fieldValue("f3"), 0),
    objParams,
    objCoefficients,
    // Единый источник правды: площади по назначению, вместимость, загрузка, население
    totalArea: idm.totalArea,
    areaPurpose,
    capacity: usesCapacity ? idm.capacity : 0,
    occupancy: usesCapacity ? idm.occupancy : 1,
    population: ["жилой", "офисный", "многофункциональный"].includes(type) ? idm.population : 0,
    correctionFactor: toNumber(fieldValue("pmCorrection"), 1),
    regionId: parkingState.regionId,
    // Метод расчёта постоянных мест (945-ПП, прил. 5): "agr" — п. 2, "pz" — п. 1
    parkingMethod: parkingState.parkingMethod,
    apartArea: toNumber(fieldValue("apartArea"), 0),
    sqmPerPerson: toNumber(fieldValue("parkingSqmPerPerson"), 0),
    // Отклонения от расчётного числа мест (п. 6.2.4) и коэффициенты приложения 6
    deviation: parkingState.deviation,
    objectDeviation: parkingState.objectDeviation,
    railZone: parkingState.railZone,
    k2: toNumber(fieldValue("objK2"), 1),
    invalidApartments: toNumber(fieldValue("invalidApartments"), 0),
    scenarios: parkingState.scenarios,
    summary: fieldValue("specialConditions")
  };
}

// --- Приобъектные ММ и МГН: рендер ---
function renderObjectFacilities(b) {
  const of = b.objectFacilities;
  const container = document.getElementById("scenariosContainer");
  const cfg = norms.parking.objectFacilities;

  if (container) {
    container.innerHTML = parkingState.scenarios
      .map((sc, idx) => {
        const isMax = of && of.maxScenario && of.maxScenario.id === sc.id;
        const mode = sc.mode === "functions" ? "functions" : "bkt";
        const r = of && of.results[idx];

        let bodyHtml = "";
        if (mode === "bkt") {
          bodyHtml = `<table>
            <thead><tr><th>Показатель</th><th class="center">Площадь, м²</th><th class="num">K (мест/100 м²)</th><th class="center">Машино-мест</th></tr></thead>
            <tbody><tr>
              <td>БКТ (общая площадь объекта, без разбивки по функциям)</td>
              <td class="center"><input type="number" class="manual-input" data-sc="${idx}" data-area="1" value="${sc.area}" min="0" step="1"></td>
              <td class="num ref-value">${fmtRu(sc.K, 2)}</td>
              <td class="center">${r && r.functions[0] ? fmtRu(r.functions[0].raw, 3) : "—"}</td>
            </tr></tbody></table>`;
        } else {
          // Режим «Функционал»: X / X2 (прил. 1) либо S / 100 × K (СП 42.13330.2026, прил. И)
          const calcRows = r?.functions || [];
          const funcRows = cfg.functions
            .map((fn) => {
              const v = sc.functions[fn.id] || { K: fn.K, S: 0 };
              const cr = calcRows.find((x) => x.id === fn.id);
              const basis = cr ? `${cr.basis}${cr.x2 ? ` (X2 = ${cr.x2})` : ""}` : "—";
              return `<tr>
                <td>${fn.label}${fn.vri ? ` <span class="muted">(ВРИ ${fn.vri})</span>` : ""}</td>
                <td class="center"><input type="number" class="manual-input" data-sc="${idx}" data-fn="${fn.id}" data-s="1" value="${v.S}" min="0" step="1"></td>
                <td class="center muted">${basis}</td>
                <td class="center ref-value">${cr ? fmtRu(cr.raw, 3) : "—"}</td>
              </tr>`;
            })
            .join("");
          bodyHtml = `<table><thead><tr><th>Функция объекта</th><th class="center">Площадь, м²</th><th class="center">Расчётная база</th><th class="center">Машино-мест</th></tr></thead><tbody>${funcRows}</tbody></table>`;
        }

        return `<div class="scenario-title">Функция коммерческих помещений — режим
            <select class="mode-select" data-sc="${idx}" data-mode="1">
              <option value="bkt"${mode === "bkt" ? " selected" : ""}>БКТ</option>
              <option value="functions"${mode === "functions" ? " selected" : ""}>Функционал</option>
            </select>
          </div>
          <fieldset class="scenario">
          ${bodyHtml}
          <div class="muted">База ${r ? fmtRu(r.sumRaw, 3) : "—"} → с К1 и К2: ${r ? fmtRu(r.withK, 3) : "—"} → ${r ? r.places : 0} мест${isMax ? " (принят максимум)" : ""}</div>
        </fieldset>`;
      })
      .join("");

    container.querySelectorAll("input").forEach((inp) => {
      inp.addEventListener("change", () => {
        const idx = Number(inp.dataset.sc);
        const sc = parkingState.scenarios[idx];
        if (inp.dataset.area) sc.area = toNumber(inp.value, 0);
        if (inp.dataset.s) sc.functions[inp.dataset.fn].S = toNumber(inp.value, 0);
        reParking();
      });
    });
    container.querySelectorAll("select[data-mode]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const idx = Number(sel.dataset.sc);
        parkingState.scenarios[idx].mode = sel.value;
        // при переключении режима подтянем K_i из региона для функций
        if (sel.value === "functions") {
          parkingState.scenarios[idx].functions = parkingState.scenarios[idx].functions || newFunctionsMap();
        }
        reParking();
      });
    });
  }

  // Итоговая строка по сценариям
  const res = document.getElementById("objectFacilitiesResult");
  if (res && of) {
    res.innerHTML =
      (of.basis ? `<div>Основание расчёта: ${of.basis}.</div>` : "") +
      (of.k1Note ? `<div>${of.k1Note}</div>` : "") +
      (of.k2Note ? `<div>${of.k2Note}</div>` : "") +
      of.results
        .map((r) => `${r.mode === "bkt" ? "БКТ" : "Функционал"}: база ${fmtRu(r.sumRaw, 3)} → ${fmtRu(r.withK, 3)} → <strong>${r.places}</strong> мест`)
        .join(" &nbsp;|&nbsp; ") + (of.maxScenario ? ` &nbsp;→&nbsp; принято по максимуму: <strong>${of.places}</strong>` : "");
  }
}

// Показ полей метода «градостроительное проектирование» (прил. 5, п. 1)
function updateParkingMethodVisibility() {
  const wrap = document.getElementById("pzInputs");
  if (!wrap) return;
  wrap.style.display = parkingState.parkingMethod === "pz" ? "" : "none";
}

function renderParking(b) {
  const pmCfg = norms.parking.permanentMethod || {};
  const devCfg = norms.parking.deviation || {};
  const isResidential = (b.objectType || "жилой") === "жилой";

  // Инструмент коэффициентов — только для жилого (для ТЦ/офиса/МФН коэффициент ОТ задаётся в «Исходных данных»)
  const coefToolbar = document.getElementById("permCoefToolbar");
  if (coefToolbar) coefToolbar.style.display = isResidential ? "" : "none";

  // --- Метод расчёта постоянных мест (приложение 5) ---
  const methodSel = document.getElementById("parkingMethodSelect");
  if (methodSel) {
    methodSel.innerHTML = [pmCfg.agr, pmCfg.pz]
      .filter(Boolean)
      .map((m) => `<option value="${m.id}">${m.label}</option>`)
      .join("");
    methodSel.value = parkingState.parkingMethod || pmCfg.defaultMethod || "agr";
    if (!methodSel.dataset.bound) {
      methodSel.dataset.bound = "1";
      methodSel.addEventListener("change", () => {
        parkingState.parkingMethod = methodSel.value;
        updateParkingMethodVisibility();
        reParking();
      });
    }
  }

  // --- Отклонение от расчётного числа мест (п. 6.2.4.1, ±10 %) ---
  const devSel = document.getElementById("deviationSelect");
  if (devSel && devCfg.options) {
    devSel.innerHTML = devCfg.options
      .map((o) => `<option value="${o.id}">${o.label}</option>`)
      .join("");
    devSel.value = parkingState.deviation.optionId || devCfg.defaultOption || "none";
    if (!devSel.dataset.bound) {
      devSel.dataset.bound = "1";
      devSel.addEventListener("change", () => {
        parkingState.deviation.optionId = devSel.value;
        reParking();
      });
    }
  }

  // --- Отклонение для приобъектной парковки (п. 6.2.4.3, ±30 %) ---
  const objDevSel = document.getElementById("objectDeviationSelect");
  if (objDevSel && devCfg.objectOptions) {
    objDevSel.innerHTML = devCfg.objectOptions
      .map((o) => `<option value="${o.id}">${o.label}</option>`)
      .join("");
    objDevSel.value = parkingState.objectDeviation.optionId || "none";
    if (!objDevSel.dataset.bound) {
      objDevSel.dataset.bound = "1";
      objDevSel.addEventListener("change", () => {
        parkingState.objectDeviation.optionId = objDevSel.value;
        reParking();
      });
    }
  }

  // --- К1: пешевая доступность рельсового каркаса (приложение 6) ---
  const zoneWrap = document.getElementById("railZoneWrap");
  const zoneSel = document.getElementById("railZoneSelect");
  const zoneList = currentRegionNorms()?.railZones || [];
  if (zoneWrap && zoneSel) {
    zoneWrap.style.display = zoneList.length ? "" : "none";
    zoneSel.innerHTML = zoneList
      .map((z) => `<option value="${z.id}">${z.label} — К1 = ${z.k}</option>`)
      .join("");
    zoneSel.value = parkingState.railZone.zoneId || zoneList[0]?.id || "";
    if (!zoneSel.dataset.bound) {
      zoneSel.dataset.bound = "1";
      zoneSel.addEventListener("change", () => {
        parkingState.railZone.zoneId = zoneSel.value;
        reParking();
      });
    }
  }

  // --- К2 и квартиры для инвалидов ---
  const k2El = document.getElementById("objK2");
  if (k2El && !k2El.dataset.bound) {
    k2El.dataset.bound = "1";
    k2El.addEventListener("change", () => {
      parkingState.k2 = toNumber(k2El.value, 1);
      reParking();
    });
  }
  const invEl = document.getElementById("invalidApartments");
  if (invEl && !invEl.dataset.bound) {
    invEl.dataset.bound = "1";
    invEl.addEventListener("change", () => {
      parkingState.invalidApartments = toNumber(invEl.value, 0);
      reParking();
    });
  }

  updateParkingMethodVisibility();

  // --- Постоянные (заголовок таблицы зависит от типа объекта) ---
  const permHead = document.querySelector("#parkingPermanent thead tr");
  if (permHead) {
    permHead.innerHTML = isResidential
      ? `<th>Группа квартир</th><th class="num">Кол-во квартир, шт.</th><th class="num">Коэффициент</th><th class="num">Машино-места</th><th>Пункт НД</th>`
      : `<th>Функция объекта</th><th class="num">Метод расчёта</th><th class="num">База, мест</th><th>Пункт НД</th>`;
  }
  const tbody = document.querySelector("#parkingPermanent tbody");
  if (isResidential) {
    tbody.innerHTML = b.permanent.byGroups
      .map(
        (g) =>
          `<tr><td>${g.label}</td><td class="num">${g.count === "" ? "—" : fmtRu(g.count, 0)}</td><td class="num">${g.coefficient}</td><td class="num">${fmtRu(g.spacesRawK, 3)}</td><td>${g.refPoint || b.permanent.refPoint || ""}</td></tr>`
      )
      .join("");
    const invalidRow = b.permanent.invalidPlaces > 0
      ? `<tr><td>В том числе места постоянного размещения для инвалидов</td><td class="num">—</td><td class="num">1 место / квартиру</td><td class="num">${fmtRu(b.permanent.invalidPlaces, 0)}</td><td>ПП № 945-ПП, п. 6.2.3.7</td></tr>`
      : "";
    tbody.innerHTML += `${invalidRow}<tr class="total"><td>Итого постоянных ММ (округление итога вверх)</td><td class="num">${fmtRu(b.permanent.sumF, 0)}</td><td></td><td class="num">${fmtRu(b.permanent.Nn, 0)}</td><td>ПП № 945-ПП, прил. 5</td></tr>`;
  } else {
    tbody.innerHTML = b.permanent.byGroups
      .map(
        (g) =>
          `<tr><td>${g.label}</td><td class="num">${g.coefficient}</td><td class="num">${fmtRu(g.spaces, 1)}</td><td>${g.refPoint}</td></tr>`
      )
      .join("");
    // Коэффициенты
    (b.objectCalc?.coefficients || []).forEach((c) => {
      tbody.innerHTML += `<tr><td>${c.name}</td><td class="num">× ${c.k}</td><td class="num">${fmtRu(c.after, 2)}</td><td>${c.ref}</td></tr>`;
    });
    tbody.innerHTML += `<tr class="total"><td>Итого постоянных ММ (после коэффициентов, ceil)</td><td></td><td class="num">${fmtRu(b.permanent.Nn, 0)}</td><td>РНГП/МНГП региона</td></tr>`;
  }
  setText("permTotal", `Итог м/м: ${fmtRu(b.permanent.Nn, 0)}`);

  // --- Расчётные показатели (спецификация: N_мм = N_норм × Q × K_корр) ---
  const cm = b.calcMeta;
  if (cm) {
    const setV = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; };
    setV("pmNorm", cm.norm || "—");
    setV("pmUnit", cm.unit || "—");
    setV("pmCalculated", `${fmtRu(cm.calculated, 2)} м/м`);
    setV("pmAdopted", `${fmtRu(cm.adopted, 0)} м/м`);
  }

  const k = b.permanent.k != null ? b.permanent.k : 1;
  const rkNote = document.getElementById("parkingReductionNote");
  if (rkNote) {
    let note = !isResidential
      ? "Коэффициенты объекта (ОТ / МФН / совместное использование) задаются в разделе «Исходные данные»."
      : k !== 1
        ? `Допустимое отклонение от расчётного числа мест применено: ${b.deviation?.label || ""} (k = ${k}). N = ⌈N_расч × k⌉. Отклонение более 10 % — решение ГЗК Москвы (п. 6.2.4.2).`
        : "Справочно: отклонение от расчётного числа мест не применяется (k = 1,0) — п. 6.2.4.1 ПП № 945-ПП.";
    if (isResidential && b.permanent.method) {
      note += ` Метод: ${b.permanent.methodLabel || b.permanent.method} — ${b.permanent.formula || ""}.`;
    }
    if (b.guestCheck && !b.guestCheck.ok) {
      note += ` ${b.guestCheck.note}.`;
    }
    if ((b.federalApplied || []).length) {
      note += ` Фед. минимум (Приказ № 250/пр): ${b.federalApplied.join("; ")} — приняты федеральные значения.`;
    }
    rkNote.textContent = note;
  }

  // --- Предельно допустимая удалённость машиномест (п. 6.1.2.5) ---
  const accEl = document.getElementById("parkingAccessibility");
  if (accEl && b.accessibility) {
    accEl.textContent =
      `${b.accessibility.refPoint}: ` +
      b.accessibility.rows.map((r) => `${r.type} — ${r.limit}`).join("; ") +
      `. ${b.accessibility.note}`;
  }

  // --- Дополнительно (Гостевые ММ) ---
  const extraBody = document.querySelector("#parkingExtra tbody");
  const extraRows = b.additional.map((a) => ({
    name: a.name,
    value: fmtRu(a.accepted, 0),
    note: a.note || (a.rounding === "ceil" ? "Округление вверх" : "—"),
    refPoint: a.refPoint || "—"
  }));
  if (extraBody) {
    extraBody.innerHTML = extraRows
      .map(
        (r) =>
          `<tr><td>${r.name}</td><td class="num">${r.value}</td><td>${r.note}</td><td>${r.refPoint}</td></tr>`
      )
      .join("");
  }
  const extraSum = b.additional
    .filter((a) => a.include)
    .reduce((s, a) => s + a.accepted, 0);
  setText("extraTotal", `Итог м/м: ${fmtRu(extraSum, 0)}`);

  // --- Электромобили ---
  const ev = b.electricVehicles;
  const evBody = document.querySelector("#parkingEv tbody");
  if (evBody && ev) {
    evBody.innerHTML = `<tr>
      <td>Места с зарядной инфраструктурой</td>
      <td class="num">${fmtRu(ev.places, 0)}</td>
      <td>${Math.round(ev.percent * 100)} % от постоянных машино-мест; округление вверх</td>
      <td>${ev.refPoint}</td>
    </tr>`;
  }
  if (ev) setText("evTotal", `Итог м/м: ${fmtRu(ev.places, 0)}`);
  const evNote = document.getElementById("evInfraNote");
  if (evNote && ev)
    evNote.textContent = `Справочно, инженерная инфраструктура: ${ev.infrastructureNote}`;

  // --- МГН (справочно) ---
  const atbody = document.querySelector("#parkingAdditional tbody");
  const rows = [];
  if (b.mgn) {
    rows.push({
      name: "Квота мест для МГН (10 %)",
      value: fmtRu(b.mgn.quota, 0),
      note: "Включительно или по ТЗ",
      refPoint: "181-ФЗ, ст. 15"
    });
    rows.push({
      name: "Специализированные места для МГН (6,0 × 3,6 м)",
      value: fmtRu(b.mgn.special, 0),
      note: "Справочно, по шкале СП 59.13330.2020; в итог не входят",
      refPoint: "СП 59.13330.2020, п. 5.2.1"
    });
  }
  atbody.innerHTML = rows
    .map(
      (r) =>
        `<tr><td>${r.name}</td><td class="num">${r.value}</td><td>${r.note}</td><td>${r.refPoint}</td></tr>`
    )
    .join("");
  setText("mgnTotal", `Итог м/м: ${fmtRu(b.mgn ? b.mgn.special : 0, 0)}`);

  // --- Итоговая потребность ---
  setText("parkingTotal", fmtRu(b.total, 0));
  setText("parkingFormula", b.totalFormula);

  // «Количество квартир, всего» — считается автоматически: F1 + F2 + F3
  const aptTotalInput = document.getElementById("apartmentsTotal");
  if (aptTotalInput) aptTotalInput.value = b.permanent.sumF;

  // Приобъектные ММ (БКТ) и МГН
  renderObjectFacilities(b);
  setText("objectTotal", `Итог м/м: ${fmtRu(b.objectPlaces, 0)}`);

  // Сводная таблица всех показателей
  renderParkingSummary(b);

  // Нормативное обоснование
  const region = currentRegion();
  const refsRegion = document.getElementById("parkingRefsRegion");
  if (refsRegion && region) {
    refsRegion.innerHTML = `РНГП/МНГП региона: <strong>${escapeHtml(region.label)}</strong> — ${escapeHtml(region.source)}`;
  }
  const justEl = document.getElementById("parkingJustification");
  if (justEl) justEl.textContent = b.justification || "";
  const rbody = document.querySelector("#parkingRefs tbody");
  rbody.innerHTML = (b.refs || [])
    .map((r) => `<tr><td>${r.point}</td><td>${r.requirement}</td><td>${r.applied}</td></tr>`)
    .join("");
}

// Сводная таблица всех посчитанных значений (колонки: Показатель, Значение, Единицы, Обоснование, Норматив)
function renderParkingSummary(b) {
  const body = document.querySelector("#parkingSummary tbody");
  if (!body) return;
  const regionRef = b.region ? `${b.region.label} — РНГП/МНГП` : "РНГП/МНГП региона";
  const rows = [];

  rows.push([
    "Постоянные машино-места", fmtRu(b.permanent.Nn, 0), "шт.",
    "N_расч × k × K_корр, округление вверх",
    regionRef
  ]);
  (b.additional || [])
    .filter((a) => a.include)
    .forEach((a) => rows.push([a.name, fmtRu(a.accepted, 0), "шт.", a.note || (a.rounding === "ceil" ? "Округление вверх" : "—"), a.refPoint || regionRef]));
  if (b.objectPlaces > 0) {
    rows.push(["Приобъектные машино-места", fmtRu(b.objectPlaces, 0), "шт.", "Максимум из сценариев (БКТ / функционал)", regionRef]);
  }
  if (b.electricVehicles) {
    rows.push([
      "Места с зарядной инфраструктурой",
      fmtRu(b.electricVehicles.places, 0),
      "шт.",
      `${Math.round((b.electricVehicles.percent || 0.1) * 100)} % от постоянных, округление вверх; справочно, в итог не входят`,
      b.electricVehicles.refPoint
    ]);
  }
  if (b.mgn) {
    rows.push(["Квота мест для МГН", fmtRu(b.mgn.quota, 0), "шт.", "Не менее 10 % от общего числа мест", "181-ФЗ, ст. 15"]);
    rows.push([
      "Специализированные места для МГН (справочно)",
      fmtRu(b.mgn.special, 0),
      "шт.",
      "Габариты 6,0 × 3,6 м; в итог не входят",
      "СП 59.13330.2020, п. 5.2.1"
    ]);
  }

  body.innerHTML = rows
    .map(
      (r) =>
        `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td class="num">${r[2]}</td><td>${escapeHtml(r[3])}</td><td>${escapeHtml(r[4])}</td></tr>`
    )
    .join("");
  body.innerHTML += `<tr class="total"><td>Всего машино-мест</td><td class="num">${fmtRu(b.total, 0)}</td><td class="num">шт.</td><td>Округление вверх по всем составляющим</td><td>${escapeHtml(regionRef)}</td></tr>`;
}

function reParking() {
  const inputs = parkingInputs();
  const b = calculateParking(norms, inputs);
  renderParking(b);
  if (!lastResult) lastResult = createResult({});
  lastResult.blockResults.parking = b;
  lastResult.inputs.objectName = inputs.objectName;
  refreshSummary();
}

function buildTkoFractionInputs() {
  const box = document.getElementById("tkoFractionsInput");
  if (!box || box.dataset.built) return;
  const fr = norms.tko.defaults.fractions || [];
  box.innerHTML = fr
    .map((f) => `<label class="field">${escapeHtml(f.label)} (%)
      <input type="number" data-fract="${f.id}" value="${f.percent}" min="0" max="100" step="1" readonly title="Доли фракций — из нормативной базы, только для чтения">
    </label>`)
    .join("");
  box.dataset.built = "1";
  box.querySelectorAll("input[data-fract]").forEach((el) => el.addEventListener("input", reTko));
}

function reTko() {
  buildTkoFractionInputs();
  const fractions = {};
  document.querySelectorAll("input[data-fract]").forEach((el) => {
    fractions[el.dataset.fract] = toNumber(el.value, norms.tko.defaults.fractions.find((f) => f.id === el.dataset.fract)?.percent ?? 0);
  });
  const inputs = {
    sq: toNumber(fieldValue("tkoSq"), 0),
    n: toNumber(fieldValue("tkoN"), norms.tko.defaults.n),
    T: toNumber(fieldValue("tkoT"), norms.tko.defaults.T),
    containerVolume: toNumber(fieldValue("tkoVolume"), norms.tko.defaults.containerVolume),
    containerLengthMm: toNumber(fieldValue("tkoLen"), norms.tko.defaults.containerLengthMm),
    containerWidthMm: toNumber(fieldValue("tkoWid"), norms.tko.defaults.containerWidthMm),
    Kn: toNumber(fieldValue("tkoKn"), norms.tko.defaults.Kn),
    Kz: toNumber(fieldValue("tkoKz"), norms.tko.defaults.Kz),
    nPremises: toNumber(fieldValue("tkoPrem"), norms.tko.defaults.nPremises),
    gapM: toNumber(fieldValue("tkoGap"), norms.tko.defaults.gapM),
    Kpr: toNumber(fieldValue("tkoKpr"), norms.tko.defaults.Kpr),
    // Спецификация: сезонный коэффициент, плотность, разбивка по фракциям
    seasonalCoeff: toNumber(fieldValue("tkoSeason"), norms.tko.defaults.seasonalCoeff ?? 1),
    density: toNumber(fieldValue("tkoDensity"), norms.tko.defaults.density ?? 0.35),
    fractions
  };
  const b = calculateTko(norms, inputs);
  document.querySelector("#tkoResults tbody").innerHTML = b.items
    .map((i) => `<tr><td>${i.name}</td><td>${i.unit}</td><td class="num">${fmtRu(i.value, 3)}</td><td>${i.refPoint || "—"}</td></tr>`)
    .join("");
  const frBody = document.querySelector("#tkoFractions tbody");
  if (frBody) {
    frBody.innerHTML = (b.fractions || [])
      .map((f) => `<tr><td>${escapeHtml(f.label)}</td><td class="num">${fmtRu(f.percent, 0)}</td><td class="num">${fmtRu(f.volume, 1)}</td><td class="num">${fmtRu(f.mass, 2)}</td></tr>`)
      .join("");
    const pctSum = (b.fractions || []).reduce((s, f) => s + Number(f.percent || 0), 0);
    frBody.innerHTML += `<tr class="total"><td>Итого</td><td class="num">${fmtRu(pctSum, 0)}</td><td class="num">${fmtRu(b.calc.VyearSeason, 1)}</td><td class="num">${fmtRu(b.calc.Myear, 2)}</td></tr>`;
    const fnote = document.getElementById("tkoFractionsNote");
    if (fnote) fnote.textContent = (b.fractionsNote || "") + (pctSum !== 100 ? ` Внимание: сумма долей ${pctSum} % ≠ 100 %.` : "");
  }
  document.querySelector("#tkoRefs tbody").innerHTML = (b.refs || [])
    .map((r) => `<tr><td>${r.point}</td><td>${r.requirement}</td><td>${r.applied}</td></tr>`)
    .join("");
  if (!lastResult) lastResult = createResult({});
  lastResult.blockResults.tko = b;
  refreshSummary();
}

function reSocial() {
  const method = document.getElementById("socialMethod").value;

  // Социальное обеспечение рассчитывается только для жилья (включая жилую часть МФН)
  if (!["жилой", "многофункциональный"].includes(parkingState.objectType)) {
    if (lastResult) {
      lastResult.blockResults.social = null;
      refreshSummary();
    }
    return;
  }

  // Нормативная площадь на человека — из РНГП/МНГП региона и типа застройки (ПП № 2152-ПП, табл. 1.4.1)
  const rnSocial = currentRegionNorms()?.social;
  const sqmEl = document.getElementById("socialSqm");
  const housingTypes = rnSocial?.housingTypes || norms.social.defaults.housingTypes || {};
  const htId = document.getElementById("socialHousingType")?.value || Object.keys(housingTypes)[0];
  const ht = housingTypes[htId] || {};
  if (sqmEl && (ht.sqm ?? rnSocial?.sqmPerPerson) != null) sqmEl.value = ht.sqm ?? rnSocial.sqmPerPerson;

  // зоны обеспеченности — из выбранного региона
  const regSocial = currentRegion()?.social || null;
  const zoneSel = document.getElementById("socialZone");
  const zoneList = regSocial?.zones || norms.social.zones || [];
  if (zoneSel) {
    const keep = zoneSel.value;
    zoneSel.innerHTML = zoneList
      .map((z) => `<option value="${z.id}">${z.label} — ДОУ ${z.douPer1000}, школы ${z.schoolPer1000} мест/1000</option>`)
      .join("");
    zoneSel.value = keep && zoneList.some((z) => z.id === keep) ? keep : (regSocial?.defaultZone || zoneList[0]?.id);
  }

  // квартирография
  const apartmentCounts = {};
  document.querySelectorAll("input[data-apt]").forEach((el) => {
    apartmentCounts[el.dataset.apt] = toNumber(el.value, 0);
  });

  // коэффициенты семейности (редактируемые)
  const familyCoefficients = {};
  document.querySelectorAll("input[data-fam]").forEach((el) => {
    familyCoefficients[el.dataset.fam] = toNumber(el.value, 0);
  });

  const regPc = currentRegionNorms()?.social?.polyclinic || {};
  const inputs = {
    populationMethod: method,
    regionId: parkingState.regionId,
    socialSpp: toNumber(fieldValue("socialSpp"), 0),
    socialSq: toNumber(fieldValue("socialSq"), 0),
    sqmPerPerson: toNumber(fieldValue("socialSqm"), norms.social.defaults.sqmPerPerson),
    housingType: htId,
    zone: document.getElementById("socialZone").value,
    apartmentCounts,
    familyCoefficients,
    polyclinicChildPer1000: toNumber(fieldValue("socialPcChild"), regPc.childPer1000),
    polyclinicAdultPer1000: toNumber(fieldValue("socialPcAdult"), regPc.adultPer1000),
    polyclinicMixedPer1000: toNumber(fieldValue("socialPcMixed"), regPc.mixedPer1000),
    polyclinicAreaPerVisit: toNumber(fieldValue("socialArea"), regPc.areaPerVisit),
    existingPlaces: toNumber(fieldValue("socialExisting"), 0)
  };
  const b = calculateSocial(norms, inputs);

  document.querySelector("#socialResults tbody").innerHTML = b.items
    .map((i) => `<tr><td>${i.name}</td><td>${i.unit}</td><td class="num">${fmtRu(i.value, 3)}</td><td>${i.refPoint || "—"}</td></tr>`)
    .join("");

  // Дефицит / избыток и вывод (спецификация social)
  const defEl = document.getElementById("socialDeficit");
  if (defEl && document.activeElement !== defEl) {
    const d = b.calc.deficitSurplus;
    defEl.value = d > 0 ? `−${fmtRu(d, 0)} (дефицит)` : d < 0 ? `+${fmtRu(-d, 0)} (избыток)` : "0 (нет дефицита)";
  }
  const conclEl = document.getElementById("socialConclusion");
  if (conclEl && !conclEl.dataset.dirty) conclEl.value = b.conclusion || "";

  // квартирография — расчёт людей по типам
  const aptBody = document.querySelector("#socialAptCalc tbody");
  if (aptBody) {
    aptBody.innerHTML = b.types
      .map((t) => `<tr><td>${t.label}</td><td class="num">${fmtRu(t.count, 0)}</td><td class="num">${t.coefficient}</td><td class="num">${fmtRu(t.people, 2)}</td></tr>`)
      .join("") +
      `<tr class="total"><td>Итого</td><td class="num">${fmtRu(b.types.reduce((s, t) => s + t.count, 0), 0)}</td><td></td><td class="num">${fmtRu(b.calc.populationByTypes, 0)}</td></tr>`;
  }

  document.getElementById("socialNotes").innerHTML = `<ul>${(b.notes || []).map((n) => `<li>${n}</li>`).join("")}</ul>`;
  document.querySelector("#socialRefs tbody").innerHTML = (b.refs || [])
    .map((r) => `<tr><td>${r.point}</td><td>${r.requirement}</td><td>${r.applied}</td></tr>`)
    .join("");

  // показать/скрыть поля метода
  document.querySelectorAll(".method-area").forEach((el) => (el.style.display = method === "types" ? "none" : ""));
  document.querySelectorAll(".method-types").forEach((el) => (el.style.display = method === "types" ? "" : "none"));

  if (!lastResult) lastResult = createResult({});
  lastResult.blockResults.social = b;
  refreshSummary();
}

function reElevators() {
  const idm = parkingState.inputData;
  const apartmentAreas = {};
  for (let i = 1; i <= 6; i++) {
    const v = toNumber(fieldValue(`elApt${i}`), 0);
    if (v > 0) apartmentAreas[String(i)] = v;
  }
  const inputs = {
    floors: toNumber(fieldValue("elFloors"), norms.elevators?.defaults?.floors || 10),
    purpose: document.getElementById("elPurpose")?.value || "residential",
    mode: document.getElementById("elMode")?.value || "table",
    passengerFlow: toNumber(fieldValue("elFlow"), 0),
    loadCapacity: toNumber(fieldValue("elLoad"), norms.elevators?.defaults?.loadCapacity || 400),
    speed: toNumber(fieldValue("elSpeed"), norms.elevators?.defaults?.speed || 1),
    adopted: toNumber(fieldValue("elAdopted"), 0),
    floorArea: toNumber(fieldValue("elFloorArea"), 0),
    floorHeight: toNumber(fieldValue("elFloorHeight"), 0),
    peopleArea: toNumber(fieldValue("elPeopleArea"), 0),
    apartmentAreas,
    capacity: idm.capacity,
    occupancy: idm.occupancy
  };
  let b = calculateElevators(norms, inputs);

  // Нормативные параметры лифтов по таблице В.1 СП 54.13330.2022 — только для чтения.
  // Принятое количество: заполняется автоматически, пока пользователь не ввёл своё
  // (например, результат расчёта по ГОСТ Р 52941).
  const fLoad = document.getElementById("elLoad");
  const fSpeed = document.getElementById("elSpeed");
  const fAdopted = document.getElementById("elAdopted");
  let synced = false;
  if (fLoad && b.calc.recLoad != null && Number(fLoad.value) !== Number(b.calc.recLoad)) {
    fLoad.value = b.calc.recLoad;
    synced = true;
  }
  if (fSpeed && b.calc.recSpeed != null && Number(fSpeed.value) !== Number(b.calc.recSpeed)) {
    fSpeed.value = b.calc.recSpeed;
    synced = true;
  }
  if (fAdopted && !elAdoptedManual && Number(fAdopted.value) !== Number(b.calc.adopted)) {
    fAdopted.value = b.calc.adopted;
    synced = true;
  }
  if (synced) {
    b = calculateElevators(norms, {
      ...inputs,
      loadCapacity: toNumber(fieldValue("elLoad"), inputs.loadCapacity),
      speed: toNumber(fieldValue("elSpeed"), inputs.speed),
      adopted: toNumber(fieldValue("elAdopted"), 0)
    });
  }

  const tbody = document.querySelector("#elResults tbody");
  if (tbody) {
    tbody.innerHTML = b.items
      .map((i) => `<tr><td>${escapeHtml(i.name)}</td><td>${i.unit}</td><td class="num">${fmtRu(i.value, 3)}</td><td>${escapeHtml(i.refPoint || "—")}</td></tr>`)
      .join("");
  }
  setText("elTotal", `Итог: принято ${b.calc.adopted} лифт(ов) (минимум по таблице В.1 СП 54.13330.2022 — ${b.calc.min})`);
  const note = document.getElementById("elNote");
  if (note) note.textContent = b.calc.ruleNote || "";
  const val = document.getElementById("elValidation");
  if (val) val.innerHTML = (b.warnings || []).map((w) => `<span class="warn">${escapeHtml(w)}</span>`).join("");
  const refsBody = document.querySelector("#elRefs tbody");
  if (refsBody) {
    refsBody.innerHTML = (b.refs || [])
      .map((r) => `<tr><td>${escapeHtml(r.point)}</td><td>${escapeHtml(r.requirement)}</td><td>${escapeHtml(r.applied)}</td></tr>`)
      .join("");
  }
  if (!lastResult) lastResult = createResult({});
  lastResult.blockResults.elevators = b;
  refreshSummary();
}

function refreshSummary() {
  if (!lastResult) return;
  const br = lastResult.blockResults;
  const rows = buildSummaryRows(br, currentRegion()?.label);
  const thead = document.querySelector("#summaryTable thead tr");
  if (thead && thead.dataset.synced !== "1") {
    thead.dataset.synced = "1";
    thead.innerHTML = SUMMARY_HEADERS.map((h) => `<th${h === "Значение" ? ' class="num"' : ""}>${escapeHtml(h)}</th>`).join("");
  }
  const tbody = document.querySelector("#summaryTable tbody");
  if (tbody) {
    tbody.innerHTML = rows
      .map((r) => `<tr><td>${escapeHtml(r[0])}</td><td class="num">${r[1]}</td><td>${escapeHtml(r[2])}</td><td>${escapeHtml(r[3])}</td><td>${escapeHtml(r[4])}</td></tr>`)
      .join("");
  }
}

function calculateAll() {
  reParking();
  reElevators();
  reTko();
  reSocial();
}

function init() {
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => switchTab(t.dataset.tab))
  );
  document.getElementById("btnCalc").addEventListener("click", calculateAll);
  document.getElementById("btnDoc").addEventListener("click", () => exportHtml());
  document.getElementById("btnXlsx").addEventListener("click", () => {
    if (!lastResult) {
      alert("Сначала выполните расчёт (кнопка «Рассчитать») — выгружать нечего.");
      return;
    }
    lastResult.normJournal = getLastJournal();
    lastResult.meta = exportMeta();
    exportXlsx(lastResult);
  });

  // --- Реквизиты расчёта (спецификация: дата, исполнитель, ГИП) ---
  const cd = document.getElementById("calcDate");
  if (cd) cd.value = todayISO();

  // --- Проверка актуальности норм + журнал ---
  const btnCheck = document.getElementById("btnCheckNorms");
  if (btnCheck) btnCheck.addEventListener("click", () => runNormCheck(norms, fieldValue("execName") || "—"));
  const btnJ = document.getElementById("btnJournalCsv");
  if (btnJ) btnJ.addEventListener("click", downloadJournalCsv);

  // --- Выгрузки вкладки «Итог»: Excel (CSV) и Word ---
  const btnCsv = document.getElementById("btnExportCsv");
  if (btnCsv) btnCsv.addEventListener("click", () => withResult((r) => downloadSummaryCsv(r, exportMeta())));
  const btnWord = document.getElementById("btnExportWord");
  if (btnWord) btnWord.addEventListener("click", () => withResult((r) => downloadWordDocument(r, exportMeta())));

  // Квартиры F1/F2/F3 и площади для метода ПЗ: «Количество квартир, всего» и постоянные ММ пересчитываются автоматически
  ["f1", "f2", "f3", "apartArea"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", reParking);
  });

  // Пересчёт social при изменении метода/зоны/исходных данных
  const sm = document.getElementById("socialMethod");
  const sz = document.getElementById("socialZone");
  if (sm) sm.addEventListener("change", reSocial);
  if (sz) sz.addEventListener("change", reSocial);
  ["socialSpp", "socialSq"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", reSocial);
  });
  ["socialPcChild", "socialPcAdult", "socialPcMixed", "socialArea"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", reSocial);
  });

  // Соцобеспечение: существующая обеспеченность, вывод (dirty — ручная правка сохраняется)
  const se = document.getElementById("socialExisting");
  if (se) se.addEventListener("input", reSocial);
  const scEl = document.getElementById("socialConclusion");
  if (scEl) scEl.addEventListener("input", () => { scEl.dataset.dirty = "1"; });

  // Лифты: этажность, назначение, режим расчёта, исходные данные, параметры
  ["elFloors", "elFlow", "elLoad", "elSpeed", "elFloorArea", "elFloorHeight", "elPeopleArea",
    "elApt1", "elApt2", "elApt3", "elApt4", "elApt5", "elApt6"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", reElevators);
  });
  const elAdoptedEl = document.getElementById("elAdopted");
  if (elAdoptedEl) {
    elAdoptedEl.addEventListener("input", () => { elAdoptedManual = true; reElevators(); });
  }
  const elp = document.getElementById("elPurpose");
  if (elp) elp.addEventListener("change", () => { elp.dataset.touched = "1"; reElevators(); });
  const elm = document.getElementById("elMode");
  if (elm) elm.addEventListener("change", reElevators);

  // ТКО: сезонный коэффициент и плотность
  ["tkoSeason", "tkoDensity"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", reTko);
  });

  // Приобъектные ММ: добавить сценарий
  const addSc = document.getElementById("btnAddScenario");
  if (addSc) {
    addSc.addEventListener("click", () => {
      const idx = parkingState.scenarios.length + 1;
      parkingState.scenarios.push({
        id: "s" + idx + "_" + Date.now(),
        label: "Функция коммерческих помещений",
        mode: "bkt",
        f: 1,
        area: 0,
        K: regionBktK(),
        functions: newFunctionsMap()
      });
      reParking();
    });
  }

  // Приобъектные ММ: удалить сценарий (последний; минимум один остаётся)
  const remSc = document.getElementById("btnRemoveScenario");
  if (remSc) {
    remSc.addEventListener("click", () => {
      if (parkingState.scenarios.length <= 1) {
        alert("Должен остаться хотя бы один сценарий.");
        return;
      }
      parkingState.scenarios.pop();
      reParking();
    });
  }

  // МГН — справочно, отдельного включения в расчёт не требуется

  renderInputTab();
  initScenarios();
  syncNormativeFields();
  validateInputTab();
  restoreJournal();
  renderNormCheck(norms);
  calculateAll();
}

// Метаданные выгрузок (спецификация: дата расчёта, исполнитель, ГИП)
function exportMeta() {
  return {
    date: todayISO(),
    executor: fieldValue("execName") || "—",
    gip: fieldValue("gipName") || "—"
  };
}

// Общий рантайм для кнопок выгрузки: проверка расчёта + подстановка журнала и реквизитов
function withResult(fn) {
  if (!lastResult || !lastResult.blockResults.parking) {
    alert("Сначала выполните расчёт.");
    return;
  }
  lastResult.normJournal = getLastJournal();
  lastResult.meta = exportMeta();
  fn(lastResult);
}

function exportHtml() {
  withResult((r) => downloadHtmlDocument(r));
}

loadNorms().then((data) => {
  norms = data;
  init();
}).catch(() => {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="background:#fee;color:#900;padding:10px;margin:10px;border:1px solid #900">
      Не удалось загрузить нормативную базу. Проверьте data/norms.json или встроенный объект NORMS.
    </div>`
  );
});
