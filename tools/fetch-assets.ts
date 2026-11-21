import assert from 'node:assert/strict';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BondData, BossData, EquipData, OperatorData } from '../src/engine/types.ts';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(root, 'tools/assets.config.json'), 'utf8')) as {
  sources: Record<string, { repository: string; commit: string; reference: string }>;
  assets: Record<Kind, { source: string; paths: string[]; fallbacks: { source: string; paths: string[] }[]; directory: string; maxWidth: number; maxHeight?: number }>;
  notes: string[];
};
type Kind = 'avatar' | 'portrait' | 'boss' | 'bond' | 'equip';
interface SharpImage {
  resize(options: { width: number; height?: number; fit: 'inside'; withoutEnlargement: boolean }): SharpImage;
  webp(options: { quality: number }): SharpImage;
  toBuffer(): Promise<Buffer>;
  metadata(): Promise<{ format?: string; width?: number; height?: number }>;
}
type Sharp = (input: Buffer) => SharpImage;
const sharpPackage = 'sharp';
let sharpError = '';
// 离线环境可能尚未安装转码器；保留缺图报告，联网后 npm install --save-dev sharp 再重跑。
const sharp: Sharp | null = await import(sharpPackage).then(module => (module as { default: Sharp }).default).catch(error => {
  sharpError = `sharp 转码器不可用：${error instanceof Error ? error.message : String(error)}；联网后运行 npm install --save-dev sharp`;
  return null;
});
type AssetFile = { kind: Kind; id: string; image: string; sourceUrl: string; cached: boolean };
type Missing = { kind: Kind; id: string; name: string; urls: string[]; reason: string };
export interface AssetsReport {
  generatedAt: string;
  sources: typeof config.sources;
  notes: string[];
  coverage: Record<Kind, { total: number; available: number; missing: number }>;
  missing: Missing[];
  files: AssetFile[];
}

export function assetUrls(kind: Kind, id: string): string[] {
  const spec = config.assets[kind];
  return [spec, ...spec.fallbacks].flatMap(candidate => {
    const source = config.sources[candidate.source]!;
    assert.match(source.commit, /^[a-f0-9]{40}$/, '素材来源必须锁定完整 commit');
    return candidate.paths.map(path => `https://raw.githubusercontent.com/${source.repository}/${source.commit}/` +
      path.replace('{id}', id).split('/').map(encodeURIComponent).join('/'));
  });
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n');
  await rename(path + '.tmp', path);
}

async function webp(input: Buffer, width: number, height?: number): Promise<Buffer> {
  if (!sharp) throw new Error(sharpError);
  return sharp(input).resize({ width, height, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
}

export async function fetchAssets(): Promise<void> {
  const dataDir = resolve(root, 'src/data/generated');
  const read = async <T>(file: string): Promise<T[]> => {
    const data: unknown = JSON.parse(await readFile(resolve(dataDir, file + '.json'), 'utf8'));
    assert.ok(Array.isArray(data), `${file}.json 必须是数组；请先运行 npm run data`);
    return data as T[];
  };
  const [operators, bosses, bonds, equips] = await Promise.all([
    read<OperatorData>('operators'), read<BossData>('bosses'), read<BondData>('bonds'), read<EquipData>('equips'),
  ]);
  const reportPath = resolve(root, '.cache/assets-report.json');
  let previous: AssetFile[] = [];
  try { previous = (JSON.parse(await readFile(reportPath, 'utf8')) as AssetsReport).files; }
  catch { /* 首次执行没有素材记录。 */ }
  const report: AssetsReport = {
    generatedAt: new Date().toISOString(), sources: config.sources, notes: [...config.notes, ...(sharpError ? [sharpError] : [])],
    coverage: Object.fromEntries(Object.keys(config.assets).map(kind => [kind, { total: 0, available: 0, missing: 0 }])) as AssetsReport['coverage'],
    missing: [], files: [],
  };
  const hostFailures = new Map<string, string>();
  const downloads = new Map<string, Promise<{ sourceUrl: string; cached: boolean }>>();
  const jobs: (() => Promise<void>)[] = [];

  function plan(kind: Kind, id: string, name: string, sourceId: string | null, assign: (image: string | null) => void): void {
    assert.match(id, /^[a-zA-Z0-9_-]+$/, '素材文件名必须是安全的游戏 id');
    const spec = config.assets[kind];
    const fileId = kind === 'equip' && sourceId ? sourceId : id;
    assert.match(fileId, /^[a-zA-Z0-9_-]+$/, '素材文件名必须是安全的游戏 id');
    const image = `assets/${spec.directory}/${fileId}.webp`;
    const urls = sourceId ? assetUrls(kind, sourceId) : [];
    report.coverage[kind].total++;
    jobs.push(async () => {
      try {
        if (!sharp) throw new Error(sharpError);
        if (!urls.length) throw new Error('没有明确的素材 id');
        let download = downloads.get(image);
        if (!download) {
          download = (async () => {
            const output = resolve(root, 'public', image);
            const old = previous.find(file => file.image === image && urls.includes(file.sourceUrl));
            try {
              const metadata = await sharp(await readFile(output)).metadata();
              if (metadata.format === 'webp' && metadata.width && metadata.width <= spec.maxWidth &&
                (!spec.maxHeight || (metadata.height && metadata.height <= spec.maxHeight))) {
                // CI 只恢复图片缓存；没有旧报告时，来源地址按首选候选推定。
                return { sourceUrl: old?.sourceUrl ?? urls[0]!, cached: true };
              }
            } catch { /* 中断或损坏的图片重新下载。 */ }
            for (const sourceUrl of urls) {
              const host = new URL(sourceUrl).host;
              if (hostFailures.has(host)) throw new Error(hostFailures.get(host));
              let response: Response;
              try {
                response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
              } catch (error) {
                const cause = error instanceof Error ? error.cause as { code?: string } | undefined : undefined;
                const reason = `${error instanceof Error ? error.message : String(error)}${cause?.code ? ` (${cause.code})` : ''}`;
                // DNS/网络权限失败对同一主机后续图片同样成立，避免数百次重复超时。
                if (['EAI_AGAIN', 'ENOTFOUND', 'EACCES', 'EPERM', 'ENETUNREACH'].includes(cause?.code ?? '')) hostFailures.set(host, reason);
                throw new Error(reason);
              }
              if (response.status === 404 || response.status === 410) continue;
              if (!response.ok) throw new Error(`HTTP ${response.status}: ${sourceUrl}`);
              const buffer = await webp(Buffer.from(await response.arrayBuffer()), spec.maxWidth, spec.maxHeight);
              await mkdir(dirname(output), { recursive: true });
              await writeFile(output + '.tmp', buffer);
              await rename(output + '.tmp', output);
              return { sourceUrl, cached: false };
            }
            throw new Error('所有明确候选图片均为 HTTP 404/410');
          })();
          downloads.set(image, download);
        }
        const result = await download;
        assign(image);
        report.coverage[kind].available++;
        report.files.push({ kind, id, image, ...result });
      } catch (error) {
        assign(null);
        report.coverage[kind].missing++;
        report.missing.push({ kind, id, name, urls, reason: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  for (const operator of operators) {
    operator.images = { avatar: null, portrait: null };
    plan('avatar', operator.charId, operator.name, operator.charId, value => operator.images.avatar = value);
    plan('portrait', operator.charId, operator.name, operator.charId, value => operator.images.portrait = value);
  }
  for (const boss of bosses) plan('boss', boss.bossId, boss.name, boss.enemyId, value => boss.image = value);
  // 原始 iconId 大小写混合，而解包文件名为小写（来源见 assets.config.json.pathReferences）。
  for (const bond of bonds) plan('bond', bond.bondId, bond.name, bond.iconId.toLowerCase(), value => bond.image = value);
  for (const equip of equips) plan('equip', equip.chessId, equip.name, equip.trapId, value => equip.image = value);
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (jobs.length) await jobs.shift()!();
  }));
  report.files.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  report.missing.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  await atomicJson(resolve(dataDir, 'operators.json'), operators);
  await atomicJson(resolve(dataDir, 'bosses.json'), bosses);
  await atomicJson(resolve(dataDir, 'bonds.json'), bonds);
  await atomicJson(resolve(dataDir, 'equips.json'), equips);
  await atomicJson(reportPath, report);
  const { writeReport } = await import('./extract/report.ts');
  await writeReport();
  for (const [kind, counts] of Object.entries(report.coverage)) console.log(`${kind}: ${counts.available}/${counts.total}，缺图 ${counts.missing}`);
  console.log('缺图原因与来源已写入 .cache/assets-report.json 和 docs/data-report.md');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await fetchAssets();
}
