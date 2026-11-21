import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { GameDataMeta } from '../../src/engine/types.ts';
import { root } from '../fetch-gamedata.ts';
import { extractOperators } from './operators.ts';
import { extractEffects } from './effects.ts';
import { extractBosses } from './bosses.ts';
import { writeReport } from './report.ts';

const lock = JSON.parse(await readFile(resolve(root, 'tools/gamedata.lock.json'), 'utf8')) as { repository: string; commit: string };
const cache = resolve(root, '.cache/gamedata', lock.commit);
const output = resolve(root, 'src/data/generated');
const operatorsResult = await extractOperators(cache);
const garrisonIds = [...new Set(operatorsResult.operators.flatMap(op => Object.values(op.tiers).flatMap(tier => tier.garrisonIds)))];
const [effects, bosses] = await Promise.all([extractEffects(cache, garrisonIds), extractBosses(cache)]);
const dataVersion = (await readFile(resolve(cache, 'excel/data_version.txt'), 'utf8')).match(/VersionControl:(\S+)/)?.[1];
if (!dataVersion) throw new Error('data_version.txt 缺少 VersionControl');
const meta: GameDataMeta = {
  source: lock.repository, commit: lock.commit, dataVersion, activityId: 'act3autochess', generatedAt: new Date().toISOString(),
  cultivation: effects.cultivation,
};
const data = {
  operators: operatorsResult.operators, tokens: operatorsResult.tokens, skills: operatorsResult.skills, ranges: operatorsResult.ranges,
  garrisons: effects.garrisons, bonds: effects.bonds, equips: effects.equips, bosses: bosses.bosses, modes: bosses.modes, meta,
};
await mkdir(output, { recursive: true });
// 同一版本重提取保留素材脚本已回填的路径；更新版本交给素材脚本重新核对。
try {
  const previousMeta = JSON.parse(await readFile(resolve(output, 'meta.json'), 'utf8')) as GameDataMeta;
  if (previousMeta.commit === meta.commit) {
    const previous = JSON.parse(await readFile(resolve(output, 'operators.json'), 'utf8')) as typeof data.operators;
    for (const op of data.operators) op.images = previous.find(p => p.charId === op.charId)?.images ?? op.images;
    for (const name of ['bonds', 'equips', 'bosses'] as const) {
      const previous = JSON.parse(await readFile(resolve(output, `${name}.json`), 'utf8')) as { bondId?: string; chessId?: string; bossId?: string; image: string | null }[];
      for (const entry of data[name]) {
        const id = 'bondId' in entry ? entry.bondId : 'chessId' in entry ? entry.chessId : entry.bossId;
        entry.image = previous.find(p => (p.bondId ?? p.chessId ?? p.bossId) === id)?.image ?? null;
      }
    }
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
for (const [name, value] of Object.entries(data)) await writeFile(resolve(output, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
await mkdir(resolve(root, '.cache'), { recursive: true });
await writeFile(resolve(root, '.cache/extract-report.json'), JSON.stringify({
  commit: lock.commit, diy: operatorsResult.diy, targets: operatorsResult.targets, spTypeRaw: operatorsResult.spTypeRaw,
  issues: [...operatorsResult.issues, ...effects.issues, ...bosses.issues], keys: effects.keys,
}, null, 2) + '\n');
await writeReport();
console.log(`提取完成：干员 ${data.operators.length}，召唤物 ${Object.keys(data.tokens).length}，技能 ${Object.keys(data.skills).length}，Boss ${data.bosses.length}`);
