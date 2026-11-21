/** 极简哈希路由：#/ = 参考干员首页，#/calc = DPS 计算器，#/rank = DPS 排行。 */
export type View = 'home' | 'calc' | 'rank';

const HASH: Record<View, string> = { home: '#/', calc: '#/calc', rank: '#/rank' };

const parse = (): View =>
  location.hash.startsWith('#/calc') ? 'calc' : location.hash.startsWith('#/rank') ? 'rank' : 'home';

export const route = $state({ view: parse() });

window.addEventListener('hashchange', () => (route.view = parse()));

export function go(view: View) {
  const hash = HASH[view];
  if (!location.hash.startsWith(hash) || (view === 'home' && location.hash !== hash)) location.hash = hash;
  route.view = view;
}
