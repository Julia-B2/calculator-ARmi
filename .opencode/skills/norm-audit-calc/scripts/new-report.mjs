#!/usr/bin/env node
// new-report.mjs — создать файл отчёта в reports/ из шаблона навыка.
//
// Использование (из корня репозитория):
//     node .opencode/skills/norm-audit-calc/scripts/new-report.mjs "<краткая-тема>"
//     node .opencode/skills/norm-audit-calc/scripts/new-report.mjs "<тема>" --out reports --force
//
// Шаблон: ../templates/report-template.md
// Подставляются: {{DATE}}, {{TITLE}}, {{CHANGED_FILES}} и метки остальных разделов.
// Остальные поля заполняются вручную по факту проверки.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = resolve(here, "..", "templates", "report-template.md");

const argv = process.argv.slice(2);
const slug = (argv.find((a) => !a.startsWith("--")) || "").trim();
if (!slug) {
  console.error("Укажите тему отчёта: node new-report.mjs \"<краткая-тема>\"");
  process.exit(1);
}
const outIndex = argv.indexOf("--out");
const outDir = outIndex >= 0 && argv[outIndex + 1] ? argv[outIndex + 1] : "reports";
const force = argv.includes("--force");
const repoArg = argv.indexOf("--repo");

// Корень репозитория: ищем .git вверх от каталога скрипта (надёжнее process.cwd():
// рабочая папка может быть UNC-путь, который PowerShell не держит текущим).
function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
const repoRoot =
  repoArg >= 0 && argv[repoArg + 1] ? resolve(argv[repoArg + 1]) : findRepoRoot(resolve(here, "..", "..", "..", ".."));

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const createdAt = now.toISOString();

function changedFiles() {
  // git -C <repo> выполняется без shell (без cmd.exe): UNC-путь в cwd для cmd не поддерживается
  try {
    const out = execFileSync("git", ["-c", "core.quotepath=false", "-C", repoRoot, "status", "--porcelain"], {
      cwd: tmpdir(),
      encoding: "utf8",
    });
    const lines = out.split("\n").filter(Boolean);
    return lines.length ? lines.join("\n") : "(изменённых файлов нет)";
  } catch (e) {
    return "(не удалось получить git status: " + (e.stderr || e.message).toString().trim() + ")";
  }
}

const template = readFileSync(templatePath, "utf8");
const fill = (text, map) =>
  text.replace(/\{\{([A-Z_0-9]+)\}\}/g, (m, key) => (key in map ? map[key] : m));

const todo = (label) => `_TODO: ${label}_`;
const report = fill(template, {
  DATE: date,
  TITLE: `Отчёт: ${slug}`,
  CHANGED_FILES: changedFiles(),
  MODE: "аудит расчётов по НД + правка калькулятора",
  SUBJECT: todo("объект и блоки проверки"),
  ACTS: todo("проверенные редакции НД"),
  SOURCES: todo("источники и дата проверки"),
  NODE_RESULT: todo("результат headless-прогона"),
  BROWSER_RESULT: todo("результат проверки в браузере"),
  PY_RESULT: todo("паритет второго движка"),
  NEXT_1: todo("что сделать пользователю"),
  NEXT_2: todo("что сделать пользователю"),
});

const targetDir = resolve(repoRoot, outDir);
if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
const file = join(targetDir, `${date}_${slug.replace(/[\\/:*?"<>|]/g, "_")}.md`);

if (existsSync(file) && !force) {
  console.error(`Файл уже существует: ${file}\nИспользуйте --force, чтобы перезаписать.`);
  process.exit(2);
}

writeFileSync(file, report, "utf8");
console.log(`Создан отчёт: ${file}`);
console.log(`Заполните разделы с пометками _TODO_ (шаблон: ${templatePath}).`);
