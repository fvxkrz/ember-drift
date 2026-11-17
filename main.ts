// Hands this entry in: copy the repository's game/ and screenshots/ into the output directory, then
// write dossier.json beside them with the vendored buildDossier. Outside the grader, run it as
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// and the output holds exactly what the grader's /output holds: the playable game, the screenshots,
// and the dossier the judge reads.
import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/**
 * The scorer's own limits, from the kit's reference/gate.json. Most of them only stop a dossier
 * being built for an entry the scorer would refuse anyway: more than four screenshots, one over
 * 256 KiB, more than 993 entries under game/, more than 48 MiB of game files, or a path under
 * game/ longer than 1000 bytes. text_max_bytes is the one that shapes the dossier, capping the
 * source the judge is shown at 160 KiB.
 */
const GATE = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/**
 * Copy one directory of the entry into the output. A missing directory is an error rather than a
 * shrug, because an entry handed in without its screenshots would be judged on nothing.
 */
function copyInto(name) {
  const from = join(here, name);
  if (!existsSync(from)) throw new Error(`${name}/ is missing from the repository, so there is nothing to hand in`);
  cpSync(from, join(outputDir, name), { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });

copyInto('game');
copyInto('screenshots');

// The dossier is built last, from the files just copied: buildDossier walks the output directory,
// so it describes what is actually there and can never drift from it.
const dossierPath = join(outputDir, 'dossier.json');
writeFileSync(dossierPath, buildDossier(outputDir, GATE));

const size = statSync(dossierPath).size;
if (size === 0) throw new Error('dossier.json came out empty, so the judge would see no entry');
console.log(`handed in ${outputDir}: game/, screenshots/ and dossier.json (${size} bytes)`);
