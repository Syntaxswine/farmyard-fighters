// Exports house parts as 24 x 24 Nautilus blocks for the workshop's Blocks
// library. In the workshop: Import the block file, Save it, switch to a map,
// choose it under Saved designs and Place block into any of the 10 x 10 slots.
// A block keeps 1 m of yard on every side, so parts wider or deeper than 22 m
// do not fit one (index.json `block`).
//
//   node tools/maps/house-parts/export-block.mjs <id> [<id> ...] [--out <dir>]
//   node tools/maps/house-parts/export-block.mjs --all [--out <dir>]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {root, PARTS_DIR, toBlock, sha256} from './house-parts.mjs';

export function readPart(id, base = root) {
  const bytes = fs.readFileSync(path.join(base, PARTS_DIR, id + '.json'));
  return {part: JSON.parse(bytes), sha: sha256(bytes)};
}

// Blocks for every committed part that fits, in index order.
export function allBlocks(base = root) {
  const index = JSON.parse(fs.readFileSync(path.join(base, PARTS_DIR, 'index.json'), 'utf8'));
  return index.parts.filter(p => p.block).map(p => { const {part, sha} = readPart(p.id, base); return {id: p.id, part, block: toBlock(part, sha)}; });
}

export const blockText = block => JSON.stringify(block) + '\n';

// What the workshop's checks read from a block. Three things are left out:
// - the name, which the engine only requires to be 1 to 60 characters;
// - housePart, which points back to the part file;
// - the run ids, which the engine checks only for form and placement renames.
//   They hash the house's town coordinates, so they change when a house moves.
// The runs are sorted, so their order does not count either. The receipt pins
// this per block, so a part's look, address, evidence or place in the town can
// change without staling it.
export const blockGeometry = ({name, housePart, wallRuns, ...rest}) =>
  ({...rest, wallRuns: {...wallRuns, segments: wallRuns.segments.map(({id, ...run}) => JSON.stringify(run)).sort()}});
export const blockDigest = block => sha256(JSON.stringify(blockGeometry(block))).slice(0, 16);
export const blockDigests = blocks => Object.fromEntries(blocks.map(b => [b.id, blockDigest(b.block)]));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--out');
  const out = at >= 0 ? path.resolve(args[at + 1]) : path.join(root, 'artifacts/house-parts/blocks');
  const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
  const blocks = args.includes('--all') ? allBlocks() : ids.map(id => { const {part, sha} = readPart(id); return {id, part, block: toBlock(part, sha)}; });
  if (!blocks.length) throw Error('Name one or more part ids, or pass --all.');
  fs.mkdirSync(out, {recursive: true});
  for (const {id, block} of blocks) fs.writeFileSync(path.join(out, id + '.block.json'), blockText(block));
  console.log(`Wrote ${blocks.length} block${blocks.length === 1 ? '' : 's'} to ${out}`);
}
