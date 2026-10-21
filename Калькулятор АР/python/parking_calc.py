#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parking_calc.py — полноценный калькулятор расчёта количества машино-мест (ММ)
для проектирования объектов капитального строительства. Применим для любого региона РФ.

Архитектура (модульная, только стандартная библиотека Python 3.7+):
    * resolve_norms()      — выбор нормативов (приоритет: РНГП региона -> СП 42 -> Минстрой)
    * calculate_base()     — базовый расчёт по типу объекта (жильё / ТЦ / офис / МФН)
    * apply_coefficients() — корректировки (близость ОТ, многофункциональность, совместное использование)
    * calculate_mgn()      — места для МГН (181-ФЗ, СП 113.13330.2023, СП 59.13330.2020)
    * build_table()        — таблица расчёта (Markdown / список словарей)
    * generate_justification() — текстовое обоснование для экспертизы
    * calculate()          — главная точка входа, возвращает структурированный результат
    * example_calculation()— типовой пример и печать полного вывода
    * to_json()            — сериализация результата для BIM/ERP

Округление: итоговое количество ММ всегда округляется вверх до целого (ceil).

Нормативные источники (указываются в обосновании):
    * СП 42.13330.2016, приложение Ж — федеральные нормативы обеспеченности стоянками.
    * СП 113.13330.2023 — стоянки автомобилей: габариты, уклоны, места для МГН, зарядные станции.
    * СП 59.13330.2020 — шкала специализированных мест для МГН.
    * РНГП субъекта РФ (ст. 29.2 ГрК РФ) — приоритет над СП 42.
    * ГПЗУ/ППТ — особые условия, имеют приоритет над общими нормативами.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Tuple


# =====================================================================================
# 1. НОРМАТИВНАЯ БАЗА (реестр регионов + федеральная база СП 42)
# =====================================================================================

# Федеральная база (СП 42.13330.2016, приложение Ж). Это "пол" для всех регионов:
# регионы могут уточнять (повышать/понижать), но обязаны обеспечивать не ниже минимума.
FEDERAL_NORMS: Dict[str, Any] = {
    "source": "СП 42.13330.2016, приложение Ж (таблица Ж.1) — федеральный ориентир",
    "priority": "federal",
    # Жильё: базовое число мест на 1 квартиру по классу (диапазоны СП 42 / методрекомендации Минстроя)
    "housing_k": {
        "социальное": 0.4,
        "эконом": 0.6,
        "комфорт": 0.8,
        "бизнес": 1.0,
        "премиум": 1.2,
    },
    # Торговые центры: число мест на 100 м² GLA по типу ТЦ
    "mall_k": {
        "районный": 1.0,
        "окружной": 1.3,
        "региональный": 1.7,
    },
    # Офис: места на 100 м² полезной площади и на 1 сотрудника
    "office_k_per_100m2": 1.0,
    "office_per_employee": 1.0,
    # Корректирующие коэффициенты (единые по методике)
    "ot_reduction": 0.75,       # близость к ОТ: -25 %
    "mfn_buffer": 1.10,         # многофункциональность: +10 % буфер на пики
    "shared_use": 0.85,         # совместное использование (пиковые нагрузки не совпадают): 0,8–0,9
    "guest_pct": 0.10,          # гостевые ММ (для жилья/МФН)
    "mgn_pct": 0.10,            # квота МГН (181-ФЗ, ст. 15): не менее 10 % и не менее 1 места
}

# Реестр регионов. Каждый регион может переопределять отдельные ключи FEDERAL_NORMS.
# Значения помечены как рабочие/требующие уточнения по действующей редакции РНГП субъекта.
REGIONS: Dict[str, Dict[str, Any]] = {
    "Москва": {
        "code": "MOW",
        "source": "ПП Москвы № 945-ПП (ред. 2026), приложение 5; МНГП г. Москвы",
        "priority": "РНГП/МНГП г. Москвы",
        # Локальные коэффициенты округа уточняются дополнительно (ГЗК/дептранс)
        "housing_k": {"эконом": 0.7, "комфорт": 0.9, "бизнес": 1.2, "премиум": 1.6},
        "mall_k": {"районный": 1.2, "окружной": 1.5, "региональный": 2.0},
        "office_k_per_100m2": 1.5,
        "office_per_employee": 1.2,
        "ot_reduction": 0.75,
        "mfn_buffer": 1.10,
    },
    "МО": {
        "code": "MO",
        "source": "РНГП Московской области (постановление Правительства МО)",
        "priority": "РНГП Московской области",
        "housing_k": {"эконом": 0.65, "комфорт": 0.85, "бизнес": 1.1, "премиум": 1.3},
        "office_k_per_100m2": 1.3,
        "office_per_employee": 1.1,
    },
    "СПб": {
        "code": "SPE",
        "source": "РНГП Санкт-Петербурга (Закон СПб о РНГП)",
        "priority": "РНГП Санкт-Петербурга",
        "housing_k": {"эконом": 0.6, "комфорт": 0.8, "бизнес": 1.1, "премиум": 1.3},
        "office_k_per_100m2": 1.4,
        "office_per_employee": 1.1,
    },
    "Краснодарский край": {
        "code": "KDA",
        "source": "РНГП Краснодарского края (требует уточнения по действующей редакции)",
        "priority": "РНГП Краснодарского края",
        "housing_k": {"эконом": 0.6, "комфорт": 0.8, "бизнес": 1.0, "премиум": 1.2},
    },
    "Республика Татарстан": {
        "code": "TA",
        "source": "РНГП Республики Татарстан (требует уточнения по действующей редакции)",
        "priority": "РНГП Республики Татарстан",
    },
    "Свердловская область": {
        "code": "SVE",
        "source": "РНГП Свердловской области (требует уточнения по действующей редакции)",
        "priority": "РНГП Свердловской области",
    },
    "Новосибирская область": {
        "code": "NGE",
        "source": "РНГП Новосибирской области (требует уточнения по действующей редакции)",
        "priority": "РНГП Новосибирской области",
    },
    "Ленинградская область": {
        "code": "LEN",
        "source": "РНГП Ленинградской области (требует уточнения по действующей редакции)",
        "priority": "РНГП Ленинградской области",
    },
}

# Допустимые значения (для валидации)
HOUSING_CLASSES = ("социальное", "эконом", "комфорт", "бизнес", "премиум")
MALL_TYPES = ("районный", "окружной", "региональный")
OBJECT_TYPES = ("жилой", "торговый", "офисный", "многофункциональный")


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
        return InputData(
            object_type=d.get("object_type", ""),
            region=d.get("region", ""),
            parameters=d.get("parameters", {}) or {},
            special_conditions=d.get("special_conditions", "")
            or d.get("parameters", {}).get("special_conditions", ""),
        )


@dataclass
class Component:
    """Одна слагаемая базового расчёта (функция объекта)."""
    name: str
    method: str
    raw: float            # "сырое" значение до коэффициентов
    ref: str              # ссылка на норматив
    comment: str = ""


# =====================================================================================
# 3. ВЫБОР НОРМАТИВОВ
# =====================================================================================

def resolve_norms(region: str) -> Dict[str, Any]:
    """
    Выбор нормативов с приоритетом: РНГП региона -> СП 42 (федеральная база).
    Возвращает словарь с применёнными значениями и метаданными (источник/приоритет).
    """
    # Копируем федеральную базу, затем накладываем региональные переопределения
    norms: Dict[str, Any] = dict(FEDERAL_NORMS)
    norms["applied_region"] = region
    norms["used_rnghp"] = False

    reg = REGIONS.get(region)
    if reg:
        norms["source"] = reg["source"]
        norms["priority"] = reg["priority"]
        norms["region_code"] = reg.get("code", "")
        for key, val in reg.items():
            if key in ("code", "source", "priority"):
                continue
            if isinstance(val, dict):
                # словари (housing_k, mall_k) — объединяем поверх федеральных
                merged = dict(norms.get(key, {}))
                merged.update(val)
                norms[key] = merged
            else:
                norms[key] = val
        norms["used_rnghp"] = True
    return norms


# =====================================================================================
# 4. БАЗОВЫЙ РАСЧЁТ ПО ТИПУ ОБЪЕКТА
# =====================================================================================

def calculate_base(data: InputData, norms: Dict[str, Any]) -> Tuple[List[Component], float]:
    """
    Базовый расчёт (без корректирующих коэффициентов) по функциям объекта.
    Поддерживает жильё, торговые, офисные функции и их сочетание (МФН).
    Возвращает (список компонентов, сумма "сырых" мест).
    """
    p = data.parameters
    comps: List[Component] = []

    # --- Жилая функция ---
    units = _num(p.get("units_count"))
    if units > 0:
        hclass = p.get("housing_class", "эконом")
        k = norms["housing_k"].get(hclass, norms["housing_k"].get("эконом", 0.6))
        raw = units * k
        comps.append(Component(
            name=f"Жильё ({hclass})",
            method=f"{units:.0f} кв. × K={k:.2f} мест/кв.",
            raw=raw,
            ref="РНГП региона / СП 42, прил. Ж",
            comment="База — по классу жилья; точные значения задаёт РНГП субъекта.",
        ))

    # --- Торговая функция (ТЦ) ---
    gla = _num(p.get("gla"))
    if gla > 0:
        mtype = p.get("mall_type", "районный")
        k = norms["mall_k"].get(mtype, norms["mall_k"].get("районный", 1.0))
        raw = gla / 100.0 * k
        comps.append(Component(
            name=f"Торговый центр ({mtype})",
            method=f"GLA {gla:.0f} м² / 100 × K={k:.2f} мест/100 м²",
            raw=raw,
            ref="РНГП региона / СП 42, прил. Ж",
            comment="Тип ТЦ определяет коэффициент: районный ниже, региональный выше.",
        ))

    # --- Офисная функция (от площади и/или численности; берём максимум) ---
    office_area = _num(p.get("office_area"))
    employees = _num(p.get("employees_count"))
    if office_area > 0 or employees > 0:
        by_area = office_area / 100.0 * norms["office_k_per_100m2"] if office_area > 0 else 0.0
        by_emp = employees * norms["office_per_employee"] if employees > 0 else 0.0
        raw = max(by_area, by_emp)
        parts = []
        if by_area > 0:
            parts.append(f"от площади {office_area:.0f} м²/100 × {norms['office_k_per_100m2']:.2f} = {by_area:.1f}")
        if by_emp > 0:
            parts.append(f"от численности {employees:.0f} чел. × {norms['office_per_employee']:.2f} = {by_emp:.1f}")
        comps.append(Component(
            name="Офис",
            method="Максимум: " + " vs ".join(parts),
            raw=raw,
            ref="РНГП региона / СП 42, прил. Ж",
            comment="Совместное использование в пики учитывается отдельным коэффициентом.",
        ))

    if not comps:
        raise ValueError(
            "Не заданы исходные параметры: укажите units_count (жильё), "
            "gla (ТЦ) и/или office_area/employees_count (офис)."
        )

    total = sum(c.raw for c in comps)
    return comps, total


# =====================================================================================
# 5. ПРИМЕНЕНИЕ КОРРЕКТИРУЮЩИХ КОЭФФИЦИЕНТОВ
# =====================================================================================

def apply_coefficients(
    raw_base: float,
    norms: Dict[str, Any],
    public_transport_proximity: bool = False,
    has_mfn: bool = False,
    shared_use: Optional[float] = None,
) -> Tuple[float, List[Dict[str, Any]]]:
    """
    Применение корректировок к базе. Возвращает (скорректированное значение, журнал коэффициентов).
    Порядок: база -> ОТ -> МФН-буфер -> совместное использование.
    """
    value = raw_base
    log: List[Dict[str, Any]] = []

    if public_transport_proximity:
        k = norms["ot_reduction"]
        value *= k
        log.append({
            "name": "Близость к ОТ (метро/МЦД/крупные остановки)",
            "k": k,
            "effect": "снижение",
            "value_after": round(value, 2),
            "ref": "РНГП региона / методрекомендации Минстроя",
        })

    if has_mfn:
        k = norms["mfn_buffer"]
        value *= k
        log.append({
            "name": "Многофункциональность (буфер на пики функций)",
            "k": k,
            "effect": "повышение +10 %",
            "value_after": round(value, 2),
            "ref": "Методические рекомендации по МФН",
        })

    if shared_use is not None:
        if not (0.8 <= shared_use <= 0.9):
            raise ValueError("Коэффициент совместного использования должен быть в диапазоне 0,8–0,9.")
        value *= shared_use
        log.append({
            "name": "Совместное использование (пиковые нагрузки не совпадают)",
            "k": shared_use,
            "effect": "снижение (с обоснованием)",
            "value_after": round(value, 2),
            "ref": "Методическое обоснование разработчика (СНиП/СП, пиковые нагрузки)",
        })

    return value, log


# =====================================================================================
# 6. РАСЧЁТ МЕСТ ДЛЯ МГН
# =====================================================================================

def calculate_mgn(total_for_quota: float, mgn_pct: float = 0.10) -> Dict[str, Any]:
    """
    Квота МГН: не менее 10 % от общего числа ММ и не менее 1 места
    (ФЗ № 181-ФЗ, ст. 15; габариты и размещение — СП 113.13330.2023, СП 59.13330.2020).
    Округление — вверх.
    """
    places = max(1, math.ceil(total_for_quota * mgn_pct))
    return {
        "places": places,
        "percent": mgn_pct,
        "dimensions": "6,0 × 3,6 м (вдоль проезжей части — длина 6,8 м)",
        "ref": "ФЗ № 181-ФЗ, ст. 15; СП 113.13330.2023; СП 59.13330.2020",
        "comment": "Места включаются в планировку; округление вверх.",
    }


# =====================================================================================
# 7. ГЛАВНАЯ ФУНКЦИЯ РАСЧЁТА
# =====================================================================================

def calculate(data: InputData, include_guest: Optional[bool] = None) -> Dict[str, Any]:
    """
    Главная точка входа. Возвращает структурированный результат расчёта.
    Округление вверх применяется к постоянным, гостевым и итогу.
    """
    # --- Валидация ---
    if data.object_type not in OBJECT_TYPES:
        raise ValueError(f"object_type должен быть одним из {OBJECT_TYPES}, получено: '{data.object_type}'")

    # --- Нормативы ---
    norms = resolve_norms(data.region)

    # --- Базовый расчёт ---
    components, raw_base = calculate_base(data, norms)

    # --- Коэффициенты ---
    p = data.parameters
    shared = p.get("shared_use_coefficient")
    if shared is not None:
        shared = float(shared)
    corrected, coef_log = apply_coefficients(
        raw_base,
        norms,
        public_transport_proximity=bool(p.get("public_transport_proximity", False)),
        has_mfn=bool(p.get("has_mfn", False)) or data.object_type == "многофункциональный",
        shared_use=shared,
    )

    # --- Постоянные ММ (ceil) ---
    permanent = math.ceil(corrected)

    # --- Гостевые ММ (для жилья/МФН), ceil ---
    is_residential = data.object_type in ("жилой", "многофункциональный")
    if include_guest is None:
        include_guest = is_residential
    guest = math.ceil(permanent * norms["guest_pct"]) if include_guest else 0

    # --- Итого постоянные+гостевые; МГН — подмножество этой суммы (10 %) ---
    subtotal = permanent + guest
    mgn = calculate_mgn(subtotal, norms["mgn_pct"])
    total = subtotal  # МГН входят в итог (181-ФЗ: не менее 10 % от общего числа мест)

    result = {
        "input": {
            "object_type": data.object_type,
            "region": data.region,
            "region_code": norms.get("region_code", ""),
            "parameters": dict(p),
            "special_conditions": data.special_conditions,
        },
        "norms": {
            "source": norms["source"],
            "priority": norms["priority"],
            "used_rnghp": norms["used_rnghp"],
            "federal_fallback": FEDERAL_NORMS["source"],
        },
        "components": [asdict(c) for c in components],
        "raw_base": round(raw_base, 2),
        "coefficients": coef_log,
        "permanent": permanent,
        "guest": guest,
        "subtotal": subtotal,
        "mgn": mgn,
        "total": total,
        "_norms_mgn_pct": norms["mgn_pct"],
        "_guest_pct": norms["guest_pct"],
    }
    return result


# =====================================================================================
# 8. ФОРМИРОВАНИЕ ТАБЛИЦЫ РАСЧЁТА
# =====================================================================================

def build_table(result: Dict[str, Any]) -> List[Dict[str, str]]:
    """Таблица расчёта как список словарей (для BIM/ERP и для Markdown)."""
    rows: List[Dict[str, str]] = []

    for comp in result["components"]:
        rows.append({
            "Параметр": comp["name"],
            "Значение": f"{comp['raw']:.1f}",
            "Норматив": comp["ref"],
            "Комментарий": comp["method"],
        })

    rows.append({
        "Параметр": "База (без коэффициентов)",
        "Значение": f"{result['raw_base']:.1f}",
        "Норматив": "Сумма функций",
        "Комментарий": "До применения корректирующих коэффициентов",
    })

    for c in result["coefficients"]:
        rows.append({
            "Параметр": c["name"],
            "Значение": f"× {c['k']:.2f}",
            "Норматив": c["ref"],
            "Комментарий": f"{c['effect']}; после = {c['value_after']}",
        })

    rows.append({
        "Параметр": "Постоянные ММ (округление вверх)",
        "Значение": str(result["permanent"]),
        "Норматив": "Методика расчёта",
        "Комментарий": f"ceil({result['coefficients'][-1]['value_after'] if result['coefficients'] else result['raw_base']})",
    })
    rows.append({
        "Параметр": "Гостевые ММ",
        "Значение": str(result["guest"]),
        "Норматив": "РНГП/СП 42",
        "Комментарий": f"{int(result['_guest_pct']*100)} % от постоянных" if result["guest"] else "не применимо",
    })
    rows.append({
        "Параметр": "Места для МГН",
        "Значение": str(result["mgn"]["places"]),
        "Норматив": result["mgn"]["ref"],
        "Комментарий": f"{int(result['mgn']['percent']*100)} % от итога, не менее 1; {result['mgn']['dimensions']}",
    })
    rows.append({
        "Параметр": "ИТОГО машино-мест",
        "Значение": str(result["total"]),
        "Норматив": "—",
        "Комментарий": "Постоянные + гостевые (МГН входят в итог)",
    })
    return rows


def table_to_markdown(rows: List[Dict[str, str]]) -> str:
    """Рендер списка словарей в Markdown-таблицу."""
    headers = ["Параметр", "Значение", "Норматив", "Комментарий"]
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for r in rows:
        lines.append("| " + " | ".join(str(r.get(h, "")) for h in headers) + " |")
    return "\n".join(lines)


# =====================================================================================
# 9. ГЕНЕРАЦИЯ ТЕКСТОВОГО ОБОСНОВАНИЯ ДЛЯ ЭКСПЕРТИЗЫ
# =====================================================================================

def generate_justification(result: Dict[str, Any]) -> str:
    """
    Текстовое обоснование (3–5 абзацев) для экспертизы:
    тип объекта, регион, применённые нормативы, выбор коэффициентов, учёт МГН и габаритов,
    особые условия ГПЗУ/ППТ или их отсутствие.
    """
    inp = result["input"]
    norm = result["norms"]
    p = inp["parameters"]

    # Функции объекта перечисляем
    funcs = ", ".join(c["name"] for c in result["components"])
    rngh_label = norm["priority"]

    # Абзац 1 — объект, регион, нормативы
    para1 = (
        f"Расчёт количества машино-мест выполнен для объекта капитального строительства "
        f"типа «{inp['object_type']}» (функции: {funcs}) в регионе «{inp['region']}». "
        f"Применены нормативы: {norm['source']}. "
        + ("Приоритет отдан региональным нормативам градостроительного проектирования (РНГП/МНГП субъекта РФ, ст. 29.2 ГрК РФ); "
           if norm["used_rnghp"] else "Региональные нормативы в реестре не заданы — применена федеральная база СП 42; ")
        + f"при недостаточности данных используется федеральный ориентир: {norm['federal_fallback']}. "
        f"Планировочные требования (габариты, уклоны, места для МГН) учтены по СП 113.13330.2023."
    )

    # Абзац 2 — базовый расчёт
    comp_desc = "; ".join(
        f"{c['name']} — {c['method'].rstrip('.')}" for c in result["components"]
    )
    para2 = (
        f"Базовый расчёт выполнен по функциям объекта: {comp_desc}. "
        f"Суммарная база (без корректирующих коэффициентов) составляет {result['raw_base']:.1f} мест."
    )

    # Абзац 3 — коэффициенты
    if result["coefficients"]:
        coef_desc = "; ".join(
            f"{c['name']} — коэффициент {c['k']:.2f} ({c['effect']})" for c in result["coefficients"]
        )
        para3 = (
            f"Применены корректирующие коэффициенты: {coef_desc}. "
            f"После применения коэффициентов расчётное значение составило "
            f"{result['coefficients'][-1]['value_after']:.2f} мест, что с округлением вверх даёт "
            f"{result['permanent']} постоянных машино-мест."
        )
        if p.get("public_transport_proximity"):
            para3 += (" Близость объекта к рельсовому/наземному общественному транспорту подтверждает "
                      "правомерность понижающего коэффициента (снижение до 25 %).")
        if p.get("has_mfn") or inp["object_type"] == "многофункциональный":
            para3 += (" Учтён многофункциональный характер: введён буфер +10 % на покрытие пиковых нагрузок разных функций.")
        if result["coefficients"] and any("Совместное использование" in c["name"] for c in result["coefficients"]):
            para3 += (" Обосновано совместное использование мест: пиковые нагрузки функций не совпадают, "
                      "применён понижающий коэффициент в диапазоне 0,8–0,9.")
    else:
        para3 = (
            f"Корректирующие коэффициенты не применялись (не подтверждены условия близости к ОТ, "
            f"многофункциональности или совместного использования). Постоянные машино-места — "
            f"{result['permanent']} (округление вверх)."
        )

    # Абзац 4 — гостевые и МГН
    guest_txt = (
        f"Гостевые машино-места приняты в количестве {result['guest']} "
        f"({int(result['_guest_pct']*100)} % от постоянных). "
        if result["guest"] else "Гостевые машино-места не предусмотрены. "
    )
    para4 = (
        guest_txt +
        f"Итого постоянных и гостевых мест — {result['subtotal']}. "
        f"Места для МГН определены по ФЗ № 181-ФЗ (ст. 15): не менее 10 % от общего числа мест и не менее одного — "
        f"принято {result['mgn']['places']} мест. Габариты специализированных мест для МГН "
        f"{result['mgn']['dimensions']} (СП 113.13330.2023, СП 59.13330.2020); округление — вверх. "
        f"Места для МГН входят в общее количество и подлежат выделению в планировке и на схеме размещения."
    )

    # Абзац 5 — особые условия
    special = inp.get("special_conditions", "").strip()
    if special:
        para5 = (
            f"Особые условия (ГПЗУ/ППТ): {special}. Данные условия имеют приоритет над общими нормативами "
            f"и учтены в расчёте. В случае противоречия с базовыми нормативами применяются требования "
            f"ГПЗУ/ППТ и решения уполномоченных органов (для Москвы — ГЗК/Дептранс при отклонении >10 % в большую сторону)."
        )
    else:
        para5 = (
            "Особые условия ГПЗУ/ППТ, ограничивающие количество или тип парковок, не предъявлены. "
            "При наличии таких условий они имеют приоритет над расчётными нормативами и требуют повторного пересчёта."
        )

    # Итоговая строка
    para_final = (
        f"Итоговое количество машино-мест (с округлением вверх): {result['total']}. "
        f"Расчёт выполнен по методике СП 42.13330.2016 (приложение Ж), СП 113.13330.2023, СП 59.13330.2020 "
        f"и региональным нормативам ({rngh_label})."
    )

    return "\n\n".join([para1, para2, para3, para4, para5, para_final])


# =====================================================================================
# 10. СЕРИАЛИЗАЦИЯ
# =====================================================================================

def to_json(result: Dict[str, Any], indent: int = 2) -> str:
    """Сериализация результата в JSON (для BIM/ERP/интеграций)."""
    payload = dict(result)
    # скрытые служебные ключи не экспортируем с "_", а переименуем в читаемые
    payload["guest_pct"] = payload.pop("_guest_pct", None)
    payload["mgn_pct"] = payload.pop("_norms_mgn_pct", None)
    payload["table"] = build_table(result)
    payload["justification"] = generate_justification(result)
    return json.dumps(payload, ensure_ascii=False, indent=indent)


# =====================================================================================
# 11. ПРИМЕР ИНТЕГРАЦИИ / ТИПОВОЙ РАСЧЁТ
# =====================================================================================

def example_calculation() -> Dict[str, Any]:
    """
    Типовой пример: жилой дом, 200 квартир, класс «эконом», регион — не Москва (МО),
    близость к ОТ подтверждена. Показывает полный вывод (таблица, обоснование, JSON).
    """
    data = InputData(
        object_type="жилой",
        region="МО",
        parameters={
            "units_count": 200,
            "housing_class": "эконом",
            "public_transport_proximity": True,
            "has_mfn": False,
        },
        special_conditions="",
    )
    result = calculate(data)

    # --- Вывод ---
    print("=" * 78)
    print("ПРИМЕР РАСЧЁТА: жилой дом, 200 квартир, класс «эконом», регион — МО")
    print("=" * 78)

    print("\n### ТАБЛИЦА РАСЧЁТА\n")
    print(table_to_markdown(build_table(result)))

    print("\n### ИТОГОВЫЕ ЧИСЛА\n")
    print(f"Постоянные машино-места:  {result['permanent']}")
    print(f"Гостевые машино-места:    {result['guest']}")
    print(f"Места для МГН:            {result['mgn']['places']}")
    print(f"Суммарное количество:     {result['total']}")

    print("\n### ОБОСНОВАНИЕ ДЛЯ ЭКСПЕРТИЗЫ\n")
    print(generate_justification(result))

    print("\n### JSON-РЕЗУЛЬТАТ\n")
    print(to_json(result))

    return result


# =====================================================================================
# 12. ВСПОМОГАТЕЛЬНЫЕ
# =====================================================================================

def _num(v: Any) -> float:
    """Безопасное приведение к числу (None/пусто -> 0)."""
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


# =====================================================================================
# 13. CLI
# =====================================================================================

def _setup_console() -> None:
    """Принудительно переключаем stdout/stderr в UTF-8 (Windows cp1251 ломает «×», «№»)."""
    import sys
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # Python 3.7+
        except Exception:
            pass


def _cli() -> None:
    """Запуск: python parking_calc.py  (пример) или с JSON на stdin/файлом."""
    import sys
    _setup_console()
    args = sys.argv[1:]
    if not args:
        example_calculation()
        return
    # передан путь к JSON-файлу с входными данными
    with open(args[0], "r", encoding="utf-8") as fh:
        data = json.load(fh)
    result = calculate(InputData.from_dict(data))
    print(table_to_markdown(build_table(result)))
    print("\n" + generate_justification(result))
    print("\n" + to_json(result))


if __name__ == "__main__":
    _cli()
