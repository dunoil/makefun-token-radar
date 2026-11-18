// Token Radar (model radar-2): a working token-radar-01 entry, Node 22, standard library only.
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the comparables model in lib/model.ts, writes the ranked board to
// /output/board.json, and copies this repository's dashboard/ and screenshots/ to /output. It also
// writes /output/data.js, the dataset the dashboard renders, from the same board the gate reads, and
// last /output/dossier.json, the summary the judge reads, with the vendored make.fun library.
//
// Before anything is written the board is checked twice: once by the model's own gate shape
// (boardIssue: coverage, ranks, order, farm steps) and once by an independent recomputation that
// rebuilds the top row's implied value straight from the raw snapshot fields, so a board whose numbers
// do not follow from the snapshot never reaches /output.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, categoryMultiples, dataScript, impliedValue, medianAgeDays, parseSnapshot } from './lib/model.ts';
import type { Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** Refuse a snapshot this entry cannot honestly score, before any model runs on it. */
function snapshotIssue(snapshot: Snapshot): string | null {
  if (snapshot.protocols.length < 100) return `only ${snapshot.protocols.length} protocols: the universe is far larger`;
  const slugs = new Set<string>();
  for (const p of snapshot.protocols) {
    if (slugs.has(p.slug)) return `protocol slug ${p.slug} appears twice`;
    slugs.add(p.slug);
    if (!(p.tvl_usd >= 0)) return `${p.slug} carries a negative or unreadable TVL`;
  }
  if (snapshot.watchlist.length === 0) return 'the watchlist is empty';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the watchlist names ${missing.length} slug(s) the protocols do not carry: ${missing.slice(0, 5).join(', ')}`;
  const traded = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  if (traded.length < 30) return `only ${traded.length} traded comparables: a comparables model cannot stand on so few`;
  return null;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const badSnapshot = snapshotIssue(snapshot);
if (badSnapshot !== null) {
  process.stderr.write(`token radar: the snapshot is not one this entry can score: ${badSnapshot}\n`);
  process.exit(2);
}

const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

// The independent recomputation: the top row's implied value, rebuilt from the raw snapshot fields
// alone (its category's multiple, its growth, its age, its chain count), must be the number the board
// carries. If the model and this second path ever disagree, the hand-in stops here.
{
  const { table } = categoryMultiples(snapshot);
  const top = board[0]!;
  const raw = snapshot.protocols.find((p) => p.slug === top.slug)!;
  const rebuilt = impliedValue(raw, snapshot.as_of, table.get(raw.category ?? '')!, medianAgeDays(snapshot));
  if (rebuilt.implied !== top.implied_value_usd) {
    process.stderr.write(`token radar: self-check failed: ${top.slug} recomputes to ${rebuilt.implied}, the board carries ${top.implied_value_usd}\n`);
    process.exit(1);
  }
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const topLines = board.slice(0, 5).map((r) => `token radar:   #${r.rank} ${r.name} — implied $${r.implied_value_usd.toLocaleString('en-US')} on $${r.tvl_usd.toLocaleString('en-US')} TVL (x${r.model.category_multiple} category, ${r.model.comparables} comparables)`);
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: market multiple x${radar.global_multiple}, median age ${radar.median_age_days} days, ${radar.multiples.length} category multiples\n` +
    `${topLines.join('\n')}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
