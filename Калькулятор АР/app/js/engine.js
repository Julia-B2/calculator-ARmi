// engine.js — общий каркас результата и агрегация по блокам

import { nowISO } from "./utils.js";

// Единый объект результата для всех блоков
export function createResult(inputs = {}) {
  return {
    meta: { calculatedAt: nowISO(), version: "1.0" },
    inputs,
    blockResults: {
      parking: null,
      tko: null,
      social: null
    }
  };
}

// Строка показателя: показатель, ед., значение, пункт НД
export function item(name, unit, value, refPoint = "") {
  return { name, unit, value, refPoint };
}

export function aggregate(result) {
  const refs = [];
  const byBlock = [];

  for (const [key, block] of Object.entries(result.blockResults)) {
    if (!block) continue;
    byBlock.push({ key, title: block.title || key });
    if (Array.isArray(block.refs)) {
      for (const r of block.refs) {
        refs.push({ block: block.title || key, ...r });
      }
    }
  }

  result.summary = { byBlock, refs };
  return result;
}
