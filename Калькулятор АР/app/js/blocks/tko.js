// blocks/tko.js — ТКО по СанПиН 2.1.3684-21 и СП 42.13330.2026 (приложение Ж)

import { toNumber, ceilInt, round } from "../utils.js";
import { item } from "../engine.js";

export function calculateTko(norms, inputs) {
  const cfg = norms.tko;
  const d = cfg.defaults;

  const S = toNumber(inputs.sq, 0);
  const n = toNumber(inputs.n, d.n);
  const T = toNumber(inputs.T, d.T);
  const Vcont = toNumber(inputs.containerVolume, d.containerVolume);
  const Kn = toNumber(inputs.Kn, d.Kn);
  const Kz = toNumber(inputs.Kz, d.Kz);
  const nPrem = toNumber(inputs.nPremises, d.nPremises);
  const gap = toNumber(inputs.gapM, d.gapM);
  const wallOffset = toNumber(inputs.wallOffsetM, d.wallOffsetM);
  const Kpr = toNumber(inputs.Kpr, d.Kpr);
  const lenMm = toNumber(inputs.containerLengthMm, d.containerLengthMm);
  const widMm = toNumber(inputs.containerWidthMm, d.containerWidthMm);
  // Спецификация: сезонный коэффициент, плотность (масса), фракции
  const Kseason = toNumber(inputs.seasonalCoeff, d.seasonalCoeff ?? 1);
  const density = toNumber(inputs.density, d.density ?? 0.35);

  // 3. Объём ТКО: V_год = N × Q; с сезонным коэффициентом
  const Vyear = round(S * n, 3);
  const VyearSeason = round(Vyear * Kseason, 3);
  const Vday = round(Vyear / 365, 3);
  const Vaccum = round(Vday * T * Kn, 3);
  const Vuseful = round(Vcont * Kz, 3);
  const Ncont = ceilInt(Vuseful > 0 ? Vaccum / Vuseful : 0);
  // Масса ТКО в год: M_год = V_год × ρ (т/год)
  const Myear = round(VyearSeason * density, 3);

  // Разбивка по фракциям (справочно): от объёма и массы
  const fractions = (d.fractions || []).map((f) => {
    const pct = toNumber(inputs.fractions?.[f.id], f.percent);
    return {
      id: f.id,
      label: f.label,
      percent: pct,
      volume: round((VyearSeason * pct) / 100, 3),
      mass: round((Myear * pct) / 100, 3)
    };
  });

  // 5. Площади
  const Smm2PerBase = 1e6;
  const Sbase = round((lenMm * widMm) / Smm2PerBase, 3);
  const S1 = round(((lenMm + gap * 1000) * (widMm + gap * 1000)) / Smm2PerBase, 3);
  const Stotal = round(Ncont * S1, 1);
  // provisional: площадь помещения с учётом Kпр, отступ от стен применяется как допущение
  const Sroom = round((Stotal / nPrem) * Kpr, 1);
  const Ssum = round(Sroom * nPrem, 1);

  const items = [
    item("Годовой объём ТКО (V_год = N × Q)", "м³/год", Vyear, "СанПиН 2.1.3684-21; ФЗ № 89-ФЗ"),
    ...(Kseason !== 1 ? [item("Сезонный коэффициент", "×", Kseason, d.seasonalNote || "Региональный акт о нормативах накопления")] : []),
    ...(Kseason !== 1 ? [item("Объём ТКО в год с учётом сезона", "м³/год", VyearSeason, "V_год × K_сез")] : []),
    item("Среднесуточный объём ТКО", "м³/сут", Vday, "СанПиН 2.1.3684-21"),
    item("Объём накопления за период вывоза", "м³", Vaccum, "СП 42.13330.2026, прил. Ж «Количество коммунальных отходов»"),
    item("Плотность отходов (ρ)", "т/м³", density, d.densityNote || "Паспорт регионального оператора"),
    item("Масса ТКО в год (M_год = V_год × ρ)", "т/год", Myear, "Региональные акты о нормативах накопления ТКО"),
    item("Полезный объём контейнера", "м³", Vuseful, "—"),
    item("Требуемое количество контейнеров", "шт.", Ncont, "СанПиН 2.1.3684-21, п. 3"),
    item("Площадь основания контейнера", "м²", Sbase, "—"),
    item("Площадь на контейнер с зазорами", "м²", S1, "СанПиН 2.1.3684-21, п. 3"),
    item("Общая площадь размещения контейнеров", "м²", Stotal, "—"),
    item("Площадь одного контейнерного помещения", "м²", Sroom, "СП 54.13330.2022"),
    item("Суммарная площадь контейнерных помещений", "м²", Ssum, "СП 54.13330.2022")
  ];

  return {
    title: cfg.title,
    document: cfg.document,
    inputs: { S, n, T, Vcont, Kn, Kz, nPrem, gap, wallOffset, Kpr, lenMm, widMm, Kseason, density },
    calc: { Vyear, VyearSeason, Myear, Vday, Vaccum, Vuseful, Ncont, Sbase, S1, Stotal, Sroom, Ssum, Kseason, density },
    fractions,
    fractionsNote: d.fractionsNote || "",
    items,
    refs: cfg.refs || []
  };
}
