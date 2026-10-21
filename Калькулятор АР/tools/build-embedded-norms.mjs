#!/usr/bin/env node
// build-embedded-norms.mjs — синхронизация встроенной копии нормативной базы
// в app/index.html с единственным источником app/data/norms.json.
//
// Запуск (из папки «Калькулятор АР»):
//     node tools/build-embedded-norms.mjs
//     node tools/build-embedded-norms.mjs --check   (только проверка, без записи)
//
// Встроенная копия нужна для работы оффлайн (открытие index.html двойным кликом,
// протокол file://), где fetch('data/norms.json') недоступен.
// Блок в index.html НЕ редактируется вручную — он генерируется этим скриптом.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const normsPath = resolve(root, "app/data/norms.json");
const htmlPath = resolve(root, "app/index.html");

const OPEN = '<script id="norms-embed" type="application/json">';
const CLOSE = "</script>";

const checkOnly = process.argv.includes("--check");

const raw = readFileSync(normsPath, "utf8");
let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  console.error("Ошибка разбора app/data/norms.json:", e.message);
  process.exit(1);
}

const html = readFileSync(htmlPath, "utf8");
const start = html.indexOf(OPEN);
if (start < 0) {
  console.error("В index.html не найден блок <script id=\"norms-embed\">");
  process.exit(1);
}
const bodyStart = start + OPEN.length;
const end = html.indexOf(CLOSE, bodyStart);
if (end < 0) {
  console.error("В index.html не найден закрывающий тег блока norms-embed");
  process.exit(1);
}

const current = html.slice(bodyStart, end).trim();
const next = JSON.stringify(parsed, null, 2);

if (current === next) {
  console.log("Встроенная копия актуальна — изменения не требуются.");
  process.exit(0);
}

if (checkOnly) {
  console.error("Встроенная копия в app/index.html устарела. Запустите: node tools/build-embedded-norms.mjs");
  process.exit(2);
}

const updated = html.slice(0, bodyStart) + "\n" + next + "\n" + html.slice(end);
writeFileSync(htmlPath, updated, "utf8");
console.log(
  `Встроенная копия обновлена: версия ${parsed?.meta?.version || "?"} от ${parsed?.meta?.updated || "?"}, ` +
  `${current.length} → ${next.length} символов.`
);
