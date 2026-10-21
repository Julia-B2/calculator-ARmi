#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parking_calc.py — расчёт количества машино-мест (ММ) по ПП Москвы № 945-ПП.

Логика синхронизирована с веб-калькулятором (app/js/blocks/parking.js);
источник нормативов — единая база app/data/norms.json.

Нормативная база (актуальные редакции):
  * ПП Москвы № 945-ПП (в редакции от 05.08.2026 № 2118-ПП):
      - приложение 5, п. 2 (АГР/АСП): Nп = A×N1 + B×N2 + C×N3, где A = 0,8, B = 1,2, C = 1,6;
        N3 — квартиры свыше 100 кв.м, индивидуальные жилые дома и блокированная застройка;
      - приложение 5, п. 1 (градостроительное проектирование): Nп = S / (S1 × 2,1) × D,
        где S1 — площадь квартир на жителя (ПП № 2152-ПП, таблица 1.4.1), 2,1 — средний
        размер домовладения, D = 0,8;
      - п. 6.2.3.2 — гостевая парковка 10 % от постоянных мест;
      - п. 6.2.3.7 — 1 место постоянного размещения на каждую квартиру для инвалидов;
      - п. 6.2.4.1–6.2.4.3 — отклонения: ±10 % (постоянные/гостевые/места остановки),
        ±30 % (приобъектная парковка), более 10 % — решение ГЗК Москвы;
      - приложение 6 — приобъектная парковка: Nв = X / X2 × К1 × К2 (X2 — приложение 1);
      - приложение 1 — расчётный показатель X2 по видам разрешённого использования.
  * ФЗ № 181-ФЗ (ст. 15) — квота мест для МГН (10 %), СП 59.13330.2020 (п. 5.2.1) — шкала
    специализированных мест.
  * СП 42.13330.2026 (прил. И) — федеральный ориентир для регионов без региональных X2.

Округление: итоговое количество мест округляется в большую сторону (приложение 6,
примечание 3). Округление выполняется по ИТОГУ, а не по каждой группе квартир.

Запуск:
    python parking_calc.py                 — типовой пример
    python parking_calc.py input.json      — расчёт по входному JSON
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

__all__ = [
    "InputData",
    "load_norms",
    "resolve_region_norms",
    "calculate",
    "build_table",
    "table_to_markdown",
    "generate_justification",
    "to_json",
    "example_calculation",
]

# Путь к общей нормативной базе: <корень проекта>/app/data/norms.json
NORMS_REL_PATH = os.path.join("app", "data", "norms.json")


# =====================================================================================
# 1. ЗАГРУЗКА НОРМАТИВНОЙ БАЗЫ
# =====================================================================================

def load_norms(path: Optional[str] = None) -> Dict[str, Any]:
    """Загрузка единой нормативной базы (app/data/norms.json)."""
    if path is None:
        here = os.path.dirname(os.path.abspath(__file__))
        path = os.path.normpath(os.path.join(here, os.pardir, NORMS_REL_PATH))
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _num(v: Any, default: float = 0.0) -> float:
    """Безопасное приведение к числу (None/пусто -> default)."""
    if v is None or v == "":
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _ceil(v: float) -> int:
    """Округление в большую сторону."""
    return int(math.ceil(round(float(v), 9)))


def _get(d: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    """Безопасное чтение вложенного ключа."""
    cur: Any = d
    for key in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(key)
    if cur is None:
        return default
    return cur


# =====================================================================================
# 2. МОДЕЛИ ДАННЫХ
# =====================================================================================

@dataclass
class InputData:
    """Входные данные расчёта (приходят из словаря/JSON)."""
    object_type: str
    region: str
    parameters: Dict[str, Any] = field(default_factory=dict)
    special_conditions: str = ""

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "InputData":
        params = d.get("parameters") or {}
        return InputData(
            object_type=d.get("object_type", "") or params.get("object_type", ""),
            region=d.get("region", "") or params.get("region", ""),
            parameters=params,
            special_conditions=d.get("special_conditions", "")
            or params.get("special_conditions", ""),
        )


@dataclass
class Component:
    """Одна слагаемая базового расчёта."""
    name: str
    method: str
    raw: float
    ref: str
    comment: str = ""


# =====================================================================================
# 3. НОРМАТИВЫ РЕГИОНА
# =====================================================================================

def resolve_region_norms(norms: Dict[str, Any], region_id: str) -> Dict[str, Any]:
    """
    Слияние норм региона: уровень (tier) -> явные значения региона.
    Возвращает применённые значения: группы, коэффициенты, К1 (зоны рельсового каркаса),
    X2 (приложение 1), социальные нормы.
    """
    regions = norms.get("regions") or []
    region = None
    for r in regions:
        if r.get("id") == region_id:
            region = r
            break
    if region is None:
        default_id = _get(norms, "parking", "defaultRegion", default="")
        for r in regions:
            if r.get("id") == default_id:
                region = r
                break
    if region is None and regions:
        region = regions[0]

    tier_id = (region or {}).get("tier") or "base"
    tier = _get(norms, "parking", "tiers", tier_id, default={}) or {}
    rp = _get(region or {}, "parking", default={}) or {}

    coefficients = dict(tier.get("coefficients") or {})
    coefficients.update(rp.get("coefficients") or {})

    social_tier = _get(norms, "social", "tiers", tier_id, default={}) or {}
    rs = _get(region or {}, "social", default={}) or {}
    social_defaults = _get(norms, "social", "defaults", default={}) or {}

    zones = rs.get("zones") or social_tier.get("zones") or _get(norms, "social", "zones", default=[]) or []
    housing_types = dict(social_defaults.get("housingTypes") or {})
    housing_types.update(rs.get("housingTypes") or {})

    return {
        "region": region,
        "regionId": (region or {}).get("id"),
        "tierId": tier_id,
        "coefficients": coefficients,
        "bktK": rp.get("bktK", tier.get("bktK", 1.5)),
        "railZones": rp.get("railZones") or tier.get("railZones") or [],
        "x2": rp.get("x2") or {},
        "social": {
            "zones": zones,
            "defaultZone": rs.get("defaultZone") or social_tier.get("defaultZone") or "zone1",
            "sqmPerPerson": rs.get(
                "sqmPerPerson",
                social_tier.get("sqmPerPerson", social_defaults.get("sqmPerPerson", 50)),
            ),
            "housingTypes": housing_types,
        },
    }


def resolve_deviation(norms: Dict[str, Any], option_id: str, kind: str = "permanent") -> Dict[str, Any]:
    """
    Допустимое отклонение от расчётного числа мест (п. 6.2.4.1–6.2.4.3 ПП № 945-ПП).
    kind: "permanent" — ±10 %, "object" — ±30 %.
    """
    dev = _get(norms, "parking", "deviation", default={}) or {}
    options = dev.get("objectOptions") if kind == "object" else dev.get("options")
    options = options or dev.get("options") or []
    fallback = {
        "optionId": "none",
        "k": 1.0,
        "label": "Отклонение не применяется (k = 1,0)",
        "refPoint": dev.get("refPoint", ""),
    }
    if not options:
        return fallback
    chosen = None
    for o in options:
        if o.get("id") == option_id:
            chosen = o
            break
    if chosen is None:
        chosen = options[0]
    if chosen.get("id") == "none":
        return fallback
    return {
        "optionId": chosen.get("id"),
        "k": _num(chosen.get("k"), 1.0),
        "label": chosen.get("label", chosen.get("id", "")),
        "refPoint": dev.get("refPoint", ""),
    }


def resolve_rail_k(rn: Dict[str, Any], zone_id: str) -> Dict[str, Any]:
    """К1 — коэффициент пешей доступности рельсового каркаса (приложение 6)."""
    zones = rn.get("railZones") or []
    if not zones:
        return {"zoneId": None, "k": 1.0, "label": "К1 = 1,0 (региональным нормативом не установлен)"}
    zone = None
    for z in zones:
        if z.get("id") == zone_id:
            zone = z
            break
    if zone is None:
        zone = zones[0]
    return {"zoneId": zone.get("id"), "k": _num(zone.get("k"), 1.0), "label": zone.get("label", "")}


# =====================================================================================
# 4. ПОСТОЯННЫЕ МАШИНО-МЕСТА (приложение 5)
# =====================================================================================

def calculate_permanent(norms: Dict[str, Any], params: Dict[str, Any], rn: Dict[str, Any]) -> Dict[str, Any]:
    """
    Постоянные машиноместа:
      * метод "agr" — приложение 5, п. 2: Nп = A×N1 + B×N2 + C×N3;
      * метод "pz"  — приложение 5, п. 1: Nп = S / (S1 × 2,1) × D.
    """
    cfg = _get(norms, "parking", default={}) or {}
    pm = cfg.get("permanentMethod") or {}
    method = params.get("parking_method") or pm.get("defaultMethod") or "agr"

    f1 = _num(params.get("f1"))
    f2 = _num(params.get("f2"))
    f3 = _num(params.get("f3"))
    counts = [f1, f2, f3]
    groups = cfg.get("groups") or []

    if method == "pz":
        s_area = _num(params.get("apart_area"))
        s1 = _num(params.get("sqm_per_person"), _num(rn["social"].get("sqmPerPerson"), 50))
        hh = _num(params.get("household_size"), _num(_get(pm, "pz", "defaults", "householdSize"), 2.1))
        d_per = _num(params.get("per_apartment"), _num(_get(pm, "pz", "defaults", "D"), 0.8))
        raw = (s_area / (s1 * hh) * d_per) if (s1 > 0 and hh > 0) else 0.0
        formula = "Nп = S / (S1 × 2,1) × D"
        ref_point = _get(pm, "pz", "refPoint", default="") or ""
        label = "Расчёт по прил. 5, п. 1: S = {0} м², S1 = {1} м²/чел., 2,1 чел., D = {2}".format(
            round(s_area, 2), s1, d_per
        )
        rows = [{"id": "pz", "label": label, "count": "", "coefficient": formula, "raw": raw}]
    else:
        rows = []
        raw = 0.0
        for i, g in enumerate(groups):
            count = counts[i] if i < len(counts) else 0.0
            value = count * _num(g.get("coefficient"))
            raw += value
            rows.append({
                "id": g.get("id"),
                "label": g.get("label"),
                "count": count,
                "coefficient": _num(g.get("coefficient")),
                "raw": value,
            })
        formula = _get(pm, "agr", "formula", default="Nп = A×N1 + B×N2 + C×N3")
        ref_point = _get(pm, "agr", "refPoint", default="") or ""

    return {
        "method": method,
        "methodLabel": _get(pm, "agr" if method != "pz" else "pz", "label", default="") or "",
        "formula": formula,
        "refPoint": ref_point,
        "byGroups": rows,
        "raw": raw,
        "sumF": f1 + f2 + f3,
    }


# =====================================================================================
# 5. ПРИОБЪЕКТНЫЕ МАШИНО-МЕСТА (приложение 6)
# =====================================================================================

def calculate_object_facilities(
    norms: Dict[str, Any],
    scenarios: List[Dict[str, Any]],
    rn: Dict[str, Any],
    k1: float,
    k2: float,
    deviation_k: float,
) -> Optional[Dict[str, Any]]:
    """Приобъектная парковка: Nв = X / X2 × К1 × К2 (округление вверх)."""
    cfg = _get(norms, "parking", "objectFacilities", default={}) or {}
    functions = cfg.get("functions") or []
    x2_map = rn.get("x2") or {}

    results = []
    for sc in scenarios or []:
        mode = "functions" if sc.get("mode") == "functions" else "bkt"
        rows = []
        if mode == "bkt":
            s_area = _num(sc.get("area"))
            k = _num(sc.get("K"), _num(rn.get("bktK"), 0))
            rows.append({
                "id": "__bkt",
                "label": "БКТ (общая площадь)",
                "unit": "per100m2",
                "basis": "S / 100 × K",
                "K": k,
                "x2": None,
                "S": s_area,
                "raw": s_area / 100.0 * k,
            })
        else:
            sc_funcs = sc.get("functions") or {}
            for fn in functions:
                o = sc_funcs.get(fn.get("id")) or {}
                s_area = _num(o.get("S", o.get("E", fn.get("S", 0))))
                if s_area <= 0:
                    continue
                x2 = x2_map.get(fn.get("id"))
                if x2 is None:
                    x2 = fn.get("x2")
                k = _num(o.get("K"), _num(rn.get("coefficients", {}).get(fn.get("id")), _num(fn.get("K"))))
                raw = s_area / float(x2) if x2 else (s_area / 100.0 * k)
                rows.append({
                    "id": fn.get("id"),
                    "label": fn.get("label"),
                    "unit": fn.get("unit"),
                    "basis": "X / X2" if x2 else "S / 100 × K",
                    "K": k,
                    "x2": x2,
                    "S": s_area,
                    "raw": raw,
                })

        sum_raw = sum(r["raw"] for r in rows)
        with_k = sum_raw * k1 * k2
        after_dev = with_k * deviation_k
        places = max(1, _ceil(after_dev)) if after_dev > 0 else 0
        results.append({
            "id": sc.get("id"),
            "label": sc.get("label", ""),
            "mode": mode,
            "functions": rows,
            "sumRaw": sum_raw,
            "withK": with_k,
            "afterDev": after_dev,
            "places": places,
        })

    max_scenario = None
    for r in results:
        if max_scenario is None or r["places"] > max_scenario["places"]:
            max_scenario = r

    return {
        "title": cfg.get("title", ""),
        "refPoint": cfg.get("refPoint", ""),
        "note": cfg.get("note", ""),
        "k1": k1,
        "k2": k2,
        "basis": (
            "Приложение 6 (Nв = X / X2 × К1 × К2); X2 — приложение 1"
            if x2_map
            else "СП 42.13330.2026, приложение И (S / 100 × K)"
        ),
        "results": results,
        "maxScenario": max_scenario,
        "places": max_scenario["places"] if max_scenario else 0,
    }


# =====================================================================================
# 6. МЕСТА ДЛЯ МГН
# =====================================================================================

def calculate_mgn(norms: Dict[str, Any], total_places: float) -> Dict[str, Any]:
    """Квота мест для МГН (181-ФЗ) и специализированные места (СП 59.13330.2020, п. 5.2.1)."""
    quota_cfg = _get(norms, "parking", "mgn", "legalQuota", default={}) or {}
    pct = _num(quota_cfg.get("percent"), 0.10)
    min_val = _num(quota_cfg.get("min"), 1)
    quota = max(int(min_val), _ceil(pct * total_places)) if total_places > 0 else 0

    scale = _get(norms, "parking", "mgn", "specialScale", default={}) or {}
    special = 0
    for row in scale.get("ranges") or []:
        max_n = row.get("maxN")
        if max_n is None or total_places <= max_n:
            if max_n == 100:
                special = max(1, _ceil(_num(row.get("percent")) * total_places))
            else:
                special = int(_num(row.get("base"))) + _ceil(_num(row.get("percent")) * (total_places - _num(row.get("over"))))
            break

    return {"quota": quota, "special": special}


# =====================================================================================
# 7. ОСНОВНОЙ РАСЧЁТ
# =====================================================================================

def calculate(data: InputData, include_guest: Optional[bool] = None) -> Dict[str, Any]:
    """
    Полный расчёт количества машино-мест.

    Параметры (data.parameters):
        f1, f2, f3              — квартиры по группам площади (прил. 5, п. 2);
        parking_method         — "agr" (п. 2) или "pz" (п. 1);
        apart_area, sqm_per_person — S и S1 для метода "pz";
        deviation              — "none" | "minus10" | "plus10" (п. 6.2.4.1);
        object_deviation       — "none" | "minus30" | "plus30" (п. 6.2.4.3);
        rail_zone              — id зоны К1 (приложение 6);
        k2                     — коэффициент деловой активности (приложение 3);
        invalid_apartments     — квартиры для проживания инвалидов (п. 6.2.3.7);
        scenarios              — приобъектная парковка (приложение 6);
        population             — население (проверка минимума по СП 42.13330.2026, п. 8.117);
        correction_factor      — K_корр.
    """
    norms = load_norms()
    params = data.parameters or {}
    cfg = _get(norms, "parking", default={}) or {}
    rn = resolve_region_norms(norms, data.region)
    region = rn.get("region") or {}

    corr = max(0.1, _num(params.get("correction_factor"), 1.0))

    deviation = resolve_deviation(norms, params.get("deviation") or "none", "permanent")
    object_deviation = resolve_deviation(norms, params.get("object_deviation") or "none", "object")
    rail = resolve_rail_k(rn, params.get("rail_zone") or "")
    k2 = _num(params.get("k2"), 1.0)

    # --- постоянные места ---
    perm = calculate_permanent(norms, params, rn)
    with_dev = perm["raw"] * deviation["k"] * corr
    permanent = max(1, _ceil(with_dev)) if with_dev > 0 else 0
    for row in perm["byGroups"]:
        row["rawK"] = row["raw"] * deviation["k"] * corr

    invalid_apartments = _num(params.get("invalid_apartments"))
    invalid_places = min(int(invalid_apartments), permanent) if permanent > 0 else 0

    # --- гостевые места (п. 6.2.3.2): 10 % от числа постоянных мест ---
    guest_pct = _num(_get(cfg, "additional", "0", "percent"), 0.1)
    guest_raw = permanent * guest_pct
    guest_places = _ceil(guest_raw) if guest_raw > 0 else 0
    if include_guest is False:
        guest_places = 0

    # --- приобъектные места (приложение 6) ---
    object_facilities = calculate_object_facilities(
        norms,
        params.get("scenarios") or [],
        rn,
        rail["k"],
        k2,
        object_deviation["k"],
    )
    object_places = object_facilities["places"] if object_facilities else 0

    # --- МГН ---
    total_before_mgn = permanent + guest_places + object_places
    mgn = calculate_mgn(norms, total_before_mgn)
    guest_pct_mgn = _num(_get(norms, "parking", "constants", "mgnSpecialOfGuestPct"), 0.1)
    object_pct_mgn = _num(_get(norms, "parking", "constants", "mgnSpecialOfObjectPct"), 0.1)
    mgn["specOfGuest"] = max(1, _ceil(guest_pct_mgn * guest_places)) if guest_places > 0 else 0
    mgn["specOfObject"] = max(1, _ceil(object_pct_mgn * object_places)) if object_places > 0 else 0

    # --- проверка минимума по СП 42.13330.2026, п. 8.117 ---
    population = _num(params.get("population"))
    guest_per_1000 = _num(_get(norms, "parking", "constants", "guestPer1000"), 30)
    guest_minimum = _ceil(population / 1000.0 * guest_per_1000) if population > 0 else 0

    total = total_before_mgn

    items = [
        {
            "name": "Постоянные машино-места",
            "unit": "шт.",
            "value": permanent,
            "refPoint": "ПП № 945-ПП, прил. 5",
        },
        {
            "name": "Гостевые машиноместа",
            "unit": "шт.",
            "value": guest_places,
            "refPoint": "ПП № 945-ПП, п. 6.2.3.2",
        },
    ]
    if object_places > 0:
        items.append({
            "name": "Приобъектные машиноместа",
            "unit": "шт.",
            "value": object_places,
            "refPoint": "ПП № 945-ПП, прил. 6",
        })
    items.append({
        "name": "Итоговая потребность",
        "unit": "шт.",
        "value": total,
        "refPoint": "ПП № 945-ПП; СП 42.13330.2026; СП 113.13330.2023",
    })

    result: Dict[str, Any] = {
        "region": {
            "id": region.get("id"),
            "label": region.get("label"),
            "source": region.get("source"),
        },
        "objectType": data.object_type or "жилой",
        "specialConditions": data.special_conditions,
        "permanent": {
            "method": perm["method"],
            "methodLabel": perm["methodLabel"],
            "formula": perm["formula"],
            "refPoint": perm["refPoint"],
            "byGroups": perm["byGroups"],
            "sumF": perm["sumF"],
            "Nn": permanent,
            "NnRaw": perm["raw"],
            "k": deviation["k"],
            "invalidPlaces": invalid_places,
        },
        "deviation": deviation,
        "objectDeviation": object_deviation,
        "rail": rail,
        "additional": [
            {
                "id": "guest",
                "name": "Гостевые машиноместа",
                "percent": guest_pct,
                "calculated": guest_raw,
                "accepted": guest_places,
                "refPoint": "ПП № 945-ПП, п. 6.2.3.2",
                "include": guest_places > 0,
            }
        ],
        "objectFacilities": object_facilities,
        "objectPlaces": object_places,
        "mgn": mgn,
        "guestCheck": {
            "minimum": guest_minimum,
            "per1000": guest_per_1000,
            "ok": guest_minimum == 0 or guest_places >= guest_minimum,
            "refPoint": "СП 42.13330.2026, п. 8.117",
        },
        "total": total,
        "totalFormula": "{0} + {1} (гостевые){2}".format(
            permanent,
            guest_places,
            " + {0} (приобъектные)".format(object_places) if object_places > 0 else "",
        ),
        "items": items,
        "refs": cfg.get("refs") or [],
    }
    result["justification"] = generate_justification(result)
    return result


# =====================================================================================
# 8. ТАБЛИЦА И ОБОСНОВАНИЕ
# =====================================================================================

def build_table(result: Dict[str, Any]) -> List[Dict[str, str]]:
    """Таблица расчёта для печати/выгрузки."""
    rows: List[Dict[str, str]] = []
    p = result.get("permanent") or {}
    rows.append({"Показатель": "Метод расчёта", "Ед. изм.": "—",
                 "Значение": p.get("formula", ""), "Пункт НД": "ПП № 945-ПП, прил. 5"})
    for g in p.get("byGroups") or []:
        rows.append({
            "Показатель": g.get("label", ""),
            "Ед. изм.": "мест",
            "Значение": "{0}".format(round(_num(g.get("rawK", g.get("raw"))), 3)),
            "Пункт НД": p.get("refPoint", ""),
        })
    if p.get("invalidPlaces"):
        rows.append({
            "Показатель": "В том числе места постоянного размещения для инвалидов",
            "Ед. изм.": "мест",
            "Значение": "{0}".format(p.get("invalidPlaces")),
            "Пункт НД": "ПП № 945-ПП, п. 6.2.3.7",
        })
    rows.append({"Показатель": "Итого постоянных ММ (округление вверх)", "Ед. изм.": "мест",
                 "Значение": "{0}".format(p.get("Nn", 0)), "Пункт НД": "ПП № 945-ПП, прил. 5"})
    for a in result.get("additional") or []:
        rows.append({"Показатель": a.get("name", ""), "Ед. изм.": "мест",
                     "Значение": "{0}".format(a.get("accepted", 0)), "Пункт НД": a.get("refPoint", "")})
    if result.get("objectPlaces"):
        of = result.get("objectFacilities") or {}
        rows.append({"Показатель": "Приобъектные ММ (Nв = X / X2 × К1 × К2)", "Ед. изм.": "мест",
                     "Значение": "{0}".format(result.get("objectPlaces")),
                     "Пункт НД": "ПП № 945-ПП, прил. 6"})
        if of.get("maxScenario"):
            for f in of["maxScenario"].get("functions") or []:
                rows.append({
                    "Показатель": "  " + str(f.get("label", "")),
                    "Ед. изм.": "мест",
                    "Значение": "{0}".format(round(_num(f.get("raw")), 3)),
                    "Пункт НД": "{0}{1}".format(
                        f.get("basis", ""),
                        " (X2 = {0})".format(f.get("x2")) if f.get("x2") else "",
                    ),
                })
    mgn = result.get("mgn") or {}
    rows.append({"Показатель": "Квота мест для МГН (10 %)", "Ед. изм.": "мест",
                 "Значение": "{0}".format(mgn.get("quota", 0)), "Пункт НД": "181-ФЗ, ст. 15"})
    rows.append({"Показатель": "Специализированные места для МГН (справочно)", "Ед. изм.": "мест",
                 "Значение": "{0}".format(mgn.get("special", 0)), "Пункт НД": "СП 59.13330.2020, п. 5.2.1"})
    rows.append({"Показатель": "ИТОГО", "Ед. изм.": "мест",
                 "Значение": "{0}".format(result.get("total", 0)), "Пункт НД": "—"})
    return rows


def table_to_markdown(rows: List[Dict[str, str]]) -> str:
    """Представление таблицы в формате Markdown."""
    if not rows:
        return ""
    headers = ["Показатель", "Ед. изм.", "Значение", "Пункт НД"]
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for r in rows:
        lines.append("| " + " | ".join(str(r.get(h, "")) for h in headers) + " |")
    return "\n".join(lines)


def generate_justification(result: Dict[str, Any]) -> str:
    """Текстовое обоснование для экспертизы."""
    region = result.get("region") or {}
    p = result.get("permanent") or {}
    dev = result.get("deviation") or {}
    mgn = result.get("mgn") or {}
    of = result.get("objectFacilities") or {}
    paras: List[str] = []

    paras.append(
        "Расчёт количества машино-мест выполнен для объекта типа «{0}» в регионе «{1}». "
        "Применены нормативы: {2}. Приоритет отдан региональным нормативам градостроительного "
        "проектирования (РНГП/МНГП субъекта РФ, ст. 29.2 ГрК РФ); федеральный ориентир при "
        "недостаточности данных — СП 42.13330.2026 (приложение И).".format(
            result.get("objectType", "жилой"),
            region.get("label") or "не указан",
            region.get("source") or "РНГП/МНГП региона",
        )
    )

    if p.get("method") == "pz":
        paras.append(
            "Базовый расчёт постоянных машиномест выполнен по приложению 5 (в редакции от "
            "05.08.2026), п. 1: Nп = S / (S1 × 2,1) × D. Расчётное значение — {0} мест; "
            "округление итога — в большую сторону.".format(round(_num(p.get("NnRaw")), 2))
        )
    else:
        groups = "; ".join(
            "{0} — {1} × {2}".format(g.get("label"), g.get("count"), g.get("coefficient"))
            for g in p.get("byGroups") or []
        )
        paras.append(
            "Базовый расчёт постоянных машиномест выполнен по приложению 5 (в редакции от "
            "05.08.2026), п. 2: {0}. Расчётное значение — {1} мест; округление итога — в "
            "большую сторону.".format(groups, round(_num(p.get("NnRaw")), 2))
        )

    if dev.get("k") != 1:
        paras.append(
            "Применено допустимое отклонение от расчётного числа мест: {0} (k = {1}) в пределах "
            "п. 6.2.4.1 ПП № 945-ПП; при отклонении более 10 % требуется решение ГЗК Москвы "
            "(п. 6.2.4.2).".format(dev.get("label", ""), dev.get("k"))
        )
    else:
        paras.append("Отклонения от расчётного числа мест не применялись (п. 6.2.4.1 ПП № 945-ПП).")

    if result.get("objectPlaces"):
        paras.append(
            "Приобъектные машиноместа рассчитаны по приложению 6 ПП № 945-ПП: Nв = X / X2 × К1 × К2; "
            "К1 = {0}, К2 = {1}; итого — {2} мест (округление вверх).".format(
                of.get("k1"), of.get("k2"), result.get("objectPlaces")
            )
        )

    guest = (result.get("additional") or [{}])[0]
    paras.append(
        "Гостевые машиноместа приняты в количестве {0} (10 % от числа постоянных мест по "
        "п. 6.2.3.2 ПП № 945-ПП). Места для МГН определены по ФЗ № 181-ФЗ (ст. 15): не менее 10 % "
        "от общего числа мест и не менее одного — принято {1} мест (специализированных по шкале "
        "СП 59.13330.2020 — {2}).{3}".format(
            guest.get("accepted", 0),
            mgn.get("quota", 0),
            mgn.get("special", 0),
            " Из числа постоянных мест выделено {0} мест постоянного размещения для инвалидов "
            "(п. 6.2.3.7).".format(p.get("invalidPlaces", 0)) if p.get("invalidPlaces") else "",
        )
    )

    check = result.get("guestCheck") or {}
    if check.get("minimum") and not check.get("ok"):
        paras.append(
            "Гостевых мест {0} — меньше минимума по п. 8.117 СП 42.13330.2026 ({1}); применяется "
            "НГП/РНГП/МНГП либо увеличивается число гостевых мест.".format(
                guest.get("accepted", 0), check.get("minimum")
            )
        )

    paras.append(
        "Итоговое количество машино-мест (с округлением вверх): {0}. Расчёт выполнен по "
        "ПП Москвы № 945-ПП (приложения 5, 6, 1), СП 42.13330.2026, СП 113.13330.2023, "
        "СП 59.13330.2020 и региональным нормативам.".format(result.get("total", 0))
    )
    return "\n\n".join(paras)


def to_json(result: Dict[str, Any], indent: int = 2) -> str:
    """Сериализация результата (JSON)."""
    return json.dumps(result, ensure_ascii=False, indent=indent, default=str)


# =====================================================================================
# 9. ПРИМЕР И CLI
# =====================================================================================

def example_calculation() -> Dict[str, Any]:
    """Типовой пример расчёта (произвольные данные)."""
    data = InputData.from_dict({
        "object_type": "жилой",
        "region": "moscow",
        "parameters": {
            "f1": 137,
            "f2": 92,
            "f3": 41,
            "parking_method": "agr",
            "deviation": "none",
            "object_deviation": "none",
            "rail_zone": "walk",
            "k2": 1.0,
            "invalid_apartments": 4,
            "population": 250,
            "scenarios": [
                {
                    "id": "s1",
                    "label": "Функция коммерческих помещений",
                    "mode": "functions",
                    "functions": {
                        "retail_nonfood": {"S": 1200},
                        "medical": {"S": 600},
                        "built_in_residential": {"S": 450},
                    },
                }
            ],
        },
    })
    result = calculate(data)
    print(table_to_markdown(build_table(result)))
    print("\n" + generate_justification(result))
    return result


def _setup_console() -> None:
    """Принудительно переключаем stdout/stderr в UTF-8 (Windows cp1251 ломает «×», «№»)."""
    import sys
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # Python 3.7+
        except Exception:
            pass


def _cli() -> None:
    """Запуск: python parking_calc.py (пример) или с JSON-файлом."""
    import sys
    _setup_console()
    args = sys.argv[1:]
    if not args:
        example_calculation()
        return
    with open(args[0], "r", encoding="utf-8") as fh:
        data = json.load(fh)
    result = calculate(InputData.from_dict(data))
    print(table_to_markdown(build_table(result)))
    print("\n" + generate_justification(result))
    print("\n" + to_json(result))


if __name__ == "__main__":
    _cli()
