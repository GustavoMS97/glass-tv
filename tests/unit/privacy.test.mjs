// Guarda permanente de privacidade: nenhum arquivo que iria para o git pode conter
// dados do aparelho ou pessoais (IP, MAC, caminho com usuário, e-mail, segredos).
// Usa a mesma regra do git (respeita o .gitignore).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SELF = path.relative(ROOT, fileURLToPath(import.meta.url));
const BINARY = /\.(jpe?g|png|gif|webp|ico|wgt|p12|zip)$/i;

function versionableFiles() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean).filter((f) => fs.existsSync(path.join(ROOT, f)));
}

// Endereços permitidos: loopback e faixas reservadas para documentação (RFC 5737).
const ALLOWED_IP = /^(127\.0\.0\.1|0\.0\.0\.0|192\.0\.2\.\d+|198\.51\.100\.\d+|203\.0\.113\.\d+)$/;

const RULES = [
  { name: 'endereço IPv4', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, allow: (m) => ALLOWED_IP.test(m) },
  { name: 'endereço MAC', re: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g },
  { name: 'caminho com usuário', re: /\/(?:Users|home)\/[A-Za-z0-9._-]+/g, allow: (m) => /\/(Users|home)\/(voce|you|user|username|SEU_USUARIO)$/.test(m) },
  { name: 'e-mail', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { name: 'segredo', re: /\b(password|passwd|senha|token|secret|api[_-]?key)\b\s*[:=]\s*['"]?[^\s'"]{4,}/gi },
  { name: 'DUID preenchido', re: /\bDUID\s*[:=]\s*['"]?[A-Z0-9]{8,}/g }
];

test('arquivos versionáveis não contêm dados do aparelho ou pessoais', () => {
  const problems = [];
  for (const file of versionableFiles()) {
    if (file === SELF || BINARY.test(file)) continue;
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const rule of RULES) {
      for (const m of text.matchAll(rule.re)) {
        if (rule.allow && rule.allow(m[0])) continue;
        problems.push(`${file}: ${rule.name} → ${m[0]}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('nada sensível escapa do .gitignore', () => {
  const files = versionableFiles();
  const sensitive = files.filter((f) =>
    /(^|\/)\.env$|(^|\/)\.env\.(?!example$)|\.p12$|\.pfx$|profiles\.xml$|\.wgt$|signature\d*\.xml$|^logs\/|^dumps\/|^dist\/|^build\/|manifest\.user\.js$|^app\/wallpapers\/user\//.test(f));
  assert.deepEqual(sensitive, []);
});
