import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const root = resolve(import.meta.dirname, '..');
export async function fetchGameData(update = false): Promise<string> {
  const lockPath = resolve(root, 'tools/gamedata.lock.json');
  const lock = JSON.parse(await readFile(lockPath, 'utf8')) as { repository: string; commit: string };
  if (update) {
    const response = await fetch(`https://api.github.com/repos/${lock.repository}/commits/master`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`更新 commit 失败: ${response.status}`);
    lock.commit = ((await response.json()) as { sha: string }).sha;
    if (!/^[a-f0-9]{40}$/.test(lock.commit)) throw new Error('无效 commit');
    await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
  }
  if (!/^[a-f0-9]{40}$/.test(lock.commit)) throw new Error('lock 必须包含完整 commit SHA');
  const cache = resolve(root, '.cache/gamedata', lock.commit);
  let downloaded = 0;
  let reused = 0;
  async function get(path: string): Promise<string> {
    const destination = resolve(cache, path);
    const validate = (text: string) => {
      if (path.endsWith('.json')) JSON.parse(text);
      else if (!/VersionControl:\S+/.test(text)) throw new Error(`不完整版本文件: ${path}`);
      return text;
    };
    try {
      const text = validate(await readFile(destination, 'utf8'));
      reused++;
      return text;
    } catch { /* 缺失或上次中断留下的不完整文件重新下载。 */ }
    for (let attempt = 0; ; attempt++) {
      try {
        const url = `https://raw.githubusercontent.com/${lock.repository}/${lock.commit}/zh_CN/gamedata/${path}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
        if (!response.ok) throw new Error(`${response.status} ${url}`);
        const text = validate(await response.text());
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination + '.tmp', text);
        await rename(destination + '.tmp', destination);
        downloaded++;
        return text;
      } catch (error) {
        if (attempt >= 2) throw error;
      }
    }
  }
  await get('excel/activity_table.json');
  const activity = JSON.parse(await readFile(resolve(cache, 'excel/activity_table.json'), 'utf8'));
  const season = activity.activity.AUTOCHESS.act3autochess.V3_1;
  const tables = ['character_table', 'char_patch_table', 'skill_table', 'uniequip_table', 'battle_equip_table', 'favor_table', 'range_table', 'enemy_handbook_table'];
  const paths = new Set<string>(tables.map(name => `excel/${name}.json`));
  paths.add('excel/data_version.txt');
  paths.add('levels/enemydata/enemy_database.json');
  for (const [modeId, rounds] of Object.entries(season.battleDataDict)) {
    if (!/^mode_(single|multi)_/.test(modeId)) continue;
    for (const battles of Object.values(rounds as Record<string, { levelId: string; bossId: string | null }[]>)) {
      for (const battle of battles) if (battle.bossId) paths.add(`levels/${battle.levelId.toLowerCase()}.json`);
    }
  }
  // 有界并发，限制同时进行的文件读写和下载请求。
  const queue = [...paths];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) await get(queue.shift()!);
  }));
  console.log(`gamedata ${lock.commit}: 下载 ${downloaded}，完整缓存复用 ${reused}`);
  return cache;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await fetchGameData(process.argv.includes('--update'));
}
