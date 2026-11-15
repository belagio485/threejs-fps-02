// main.ts — the entrypoint. Copies game/ and screenshots/ into the output
// directory and writes dossier.json with the kit's buildDossier library, so
// the gate can rebuild the same dossier byte for byte. Standard library only,
// deterministic: no timestamps, no randomness, fixed copy order.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function fail(message: string): never {
  console.error('main.ts: ' + message);
  process.exit(1);
}

async function main(): Promise<void> {
  const gameDir = join(repoRoot, 'game');
  const shotsDir = join(repoRoot, 'screenshots');
  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
  if (statSync(join(gameDir, 'index.html')).size === 0) fail('game/index.html is empty');
  if (!existsSync(shotsDir)) fail('screenshots/ is missing');
  const shots = readdirSync(shotsDir).filter((n) => /\.(png|jpe?g)$/i.test(n));
  if (shots.length === 0) fail('screenshots/ holds no PNG/JPEG image');
  mkdirSync(outDir, { recursive: true });
  // Replace only the three entries this program owns, leaving the directory.
  for (const name of ['game', 'screenshots', 'dossier.json']) {
    const target = join(outDir, name);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  }
  cpSync(gameDir, join(outDir, 'game'), { recursive: true, dereference: false });
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true, dereference: false });
  const dossier = await buildDossier(outDir, { text_max_bytes: 163840 });
  if (!dossier || dossier.length === 0) fail('buildDossier returned no bytes');
  const dossierPath = join(outDir, 'dossier.json');
  writeFileSync(dossierPath, dossier);
  if (statSync(dossierPath).size !== dossier.length) fail('dossier.json short write');
  console.log('wrote ' + dossierPath);
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
