// Coloca ?v=<hash do conteúdo> nos links do index.html para furar o cache do Discord/navegador.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const pub = new URL('../public/', import.meta.url);
const hash = (f) => createHash('sha1').update(readFileSync(new URL(f, pub))).digest('hex').slice(0, 8);

const arquivo = new URL('index.html', pub);
const html = readFileSync(arquivo, 'utf8').replace(
  /(href|src)="(style\.css|app\.js|icon\.svg)(\?v=[^"]*)?"/g,
  (_m, attr, f) => `${attr}="${f}?v=${hash(f)}"`
);
writeFileSync(arquivo, html);
console.log('index.html versionado');
