import { expect, it } from 'vitest';
import { renewalCurve, withExpectedRenewals, withSwiftPath, type RenewalPlan } from './swift.ts';

const plan:RenewalPlan = {
  independentCycles:true, prefix:[{duration:3,dps:7},{duration:2,dps:19,cast:true,burst:31}],
  cost:8, maxCharges:2, stock:0, probability:.34, reward:5, wait:sp=>sp, skillDuration:2,
  segments:wait=>[{duration:wait,dps:7},{duration:2,dps:19,cast:true,burst:31}],
};

// 埋入路径的发数与开技时点：先取本轮剩余窗口，再各自决定下一轮要冷却3秒还是8秒。
function manual(seconds:number) {
  const rate = (t:number, wait:number) => Math.min(t,wait)*7 + (t<wait ? 0 : 31 + Math.min(2,t-wait)*19);
  function after(t:number):number {
    return [.34,.66].reduce((s,weight,i)=>{
      const wait = i===0 ? 3 : 8;
      return s + weight*(rate(t,wait) + (t>=wait+2 ? after(t-wait-2) : 0));
    },0);
  }
  return rate(seconds,3)+(seconds>=5 ? after(seconds-5) : 0);
}

it('同一组轮数与成功数的路径合并，任意窗口按实际技能起点与分段积分',()=>{
  let decisions = 0;
  withSwiftPath(()=>{decisions++;return false;},()=>withExpectedRenewals(()=>{
    const curve = renewalCurve(plan);
    for(let i=0;i<=132;i++) expect(curve.at(i/4)).toBeCloseTo(manual(i/4),8);
    expect(curve.killTime(Infinity)).toBe(Infinity);
    expect(decisions).toBe(0);
    expect(curve.castsUntil!(22)).toEqual([3,13]);
    expect(decisions).toBeGreaterThan(0);
  }));
});

it('耗尽库存的零时长技能全额回复成功后有最短间隔',()=>{
  const base:RenewalPlan={...plan,prefix:[],cost:5,reward:5,probability:.5,maxCharges:1,skillDuration:0,minCycle:1,
    segments:wait=>[{duration:wait,dps:0},{duration:0,dps:0,burst:20}]};
  withExpectedRenewals(()=>{
    const at = renewalCurve(base).at;
    expect(at(.99)).toBe(0);
    expect(at(1)).toBe(10);
    expect(at(2)).toBe(15);
    expect(at(5)).toBeCloseTo(20*(.5+.25+.125+.0625+.03125+.5),8);
  });
});

it('库存或跨轮窗口动态时退出期望优化；有限血量沿既有代表轨迹计算',()=>{
  const dynamic = {...plan,stock:3};
  const windowed = {...plan,segments:(wait:number)=>[{duration:wait,dps:10,window:{length:3,dps:15}}]};
  withSwiftPath(()=>false,()=>{
    for(const p of [dynamic,windowed]) {
      const ordinary = renewalCurve(p).at(25);
      expect(withExpectedRenewals(()=>renewalCurve(p).at(25))).toBe(ordinary);
    }
    const kill = renewalCurve(plan).killTime(350);
    expect(withExpectedRenewals(()=>renewalCurve(plan).killTime(350))).toBe(kill);
  });
});
