# 卫戍协议 DPS 计算器

《明日方舟》「卫戍协议：规程」模式的 DPS 计算器。选干员（普通 / 精锐）、模组、技能、装备，设定盟约档位与层数、自身练度与潜能，选择 Boss 与规程等级，即可算出干员的 DPS、技能循环、180 秒总伤害与击杀用时；每个数字都能展开看到计算过程。也可以一键查看全干员 DPS 排行。

> 非官方粉丝工具，与鹰角网络（Hypergryph）无关。

## Agent 快速开始

不想手动敲命令？把下面这段话发给你常用的 AI 编程助手（Claude Code、Codex、Cursor 等能在本机执行命令的 Agent），它会帮你在本机装好、构建并打开计算器：

```text
请帮我在本机部署这个开源项目并构建出可以打开的网页：https://github.com/qingjingshenghuo/stronghold-dps-calculator

要求：
1. 先检查本机有没有 Git 和 Node.js 24 及以上版本；没有的话告诉我怎么安装，等我确认后再继续。
2. 把仓库克隆到我指定的目录（没指定就放在当前目录下），然后在仓库目录里按顺序执行：
   npm ci
   node tools/fetch-gamedata.ts
   npm test
   npm run assets
   npm run build
3. 构建完成后运行 npm run preview，把能在浏览器打开的本机地址告诉我。
4. 不要修改项目代码。任何一步失败，先把报错原文和你判断的原因告诉我，再给出解决办法。
```

想要一个双击就能打开、不需要启动服务的版本，可以让它改用 `npm run build:local`，产物在 `dist-local/index.html`。

## 功能

- **参考干员首页**：代表性干员的动态展示，点一下进入计算。
- **完整配置**：
  - 147 名干员（含赤刃明霄陈、望、丰川祥子、维什戴尔 4 名自选干员，自选干员可选 5 阶或 6 阶棋子），普通 / 精锐两种阶级、全部技能；
  - 精锐阶可自选模组（集成战略、生息演算模组只计属性加成）；
  - 自身练度映射（未精英化到精二 60 级）与潜能 1–6；
  - 装备、盟约档位与 0–999 层，含叙拉古「裁度」策略版 6 人效果、阿戈尔吞噬攻击力输入；
  - 卫戍特质中影响伤害的战斗增益。
- **Boss 与规程等级**：16 个 Boss（含隐秘核心），个人模拟规程 1–20 与联合模拟四档。可量化的 Boss 机制（如本体减伤、残血减伤）可逐条选择计入或不计。
- **结果与计算过程**：
  - 技能期、非技能期、循环平均 DPS，180 秒总伤害，击杀用时；
  - 伤害分项（物理、法术、真实、元素）逐项展开，攻击力逐乘区列出；
  - 调整设置时显示相对上一次的涨跌。
- **对比**：底部对比栏最多并排 10 个配置。
- **DPS 排行**：全干员 × 阶级 × 技能 × 模组一键排行，可按平均 DPS、技能期、非技能期、击杀用时排序，可只看每名干员的最佳技能或最高模组（排行不含自选干员）。
- 记住上次的配置；手机可用。

## 计算口径

计算按 PRTS 整理的伤害公式（攻击力乘区、物理 / 法术保底、穿透与减防减抗、脆弱同名取最高等），并按技力回复和技能持续做**时间过程积分**。137 名干员按游戏实际机制逐一手工建模，覆盖两种阶级的全部技能，并附手算样例测试。

发现算错的地方？欢迎提 Issue，最好附上游戏内实测或 PRTS 依据。

## 数据来源

- 游戏数据：[Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData)（`zh_CN`），锁定提交见 `tools/gamedata.lock.json`，当前数据版本见页面右上角。
- 图片素材：[yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource)、[ArknightsAssets/ArknightsAssets2](https://github.com/ArknightsAssets/ArknightsAssets2)，锁定提交见 `tools/assets.config.json`。**图片不包含在本仓库中**，构建时由脚本下载。
- 机制资料：[PRTS Wiki](https://prts.wiki/)。精建模型的代码注释中标注了每项机制的依据页面。
- 对照基线：开发过程中，部分基线 DPS 对比数据来源于[泛用型环境自适应干员强度评价体系（UOEP）](https://uoep.github.io/UOEP/)，作者：极夜星辰；另参考了 [AuCl0ud/dps-calculator](https://github.com/AuCl0ud/dps-calculator)。

## 本地开发

需要 Node.js 24+。克隆仓库后，在仓库目录里按顺序执行：

```bash
npm ci                          # 安装依赖
node tools/fetch-gamedata.ts    # 按锁定提交下载原始游戏数据到 .cache/（测试会用到）
npm test                        # 单元测试
npm run check                   # 类型检查
npm run assets                  # 下载并转换图片素材到 public/assets/（约 20 MB）
npm run build                   # 构建带图片的完整站点到 dist/
```

开发预览用 `npm run dev`（http://127.0.0.1:5173）。不下载图片也能构建和使用，界面会显示文字占位。

其他命令：

| 命令 | 作用 |
|---|---|
| `npm test` | 单元测试（含各精建干员的手算样例） |
| `npm run check` | 类型检查 |
| `npm run build` | 构建静态站点到 `dist/`（相对路径，可放在任意目录或静态托管平台） |
| `npm run build:local` | 构建单文件版到 `dist-local/`（双击 `index.html` 即可离线使用，图片在同目录 `assets/`） |
| `npm run data` | 按锁定提交重新下载并提取游戏数据到 `src/data/generated/` |
| `npm run coverage` | 生成引擎覆盖报告 `docs/engine-coverage.md` |

游戏版本更新时，按顺序执行：

1. `node tools/fetch-gamedata.ts --update`：把 `tools/gamedata.lock.json` 更新到最新提交。
2. `npm run data`：重新提取 `src/data/generated/`。
3. `npm run assets`：补下载新干员、Boss 的图片，并回填图片路径。
4. 查看 `docs/data-report.md` 与 `git diff src/data/generated/`，确认变化符合预期。
5. `npm test`、`npm run build`。

### 项目结构

```
src/engine/            伤害引擎（纯 TypeScript，可单测）
  types.ts             对外接口
  stats.ts damage.ts   面板与伤害公式
  timeline.ts          技能循环与时间过程
  effects/             盟约、装备、卫戍特质、元素损伤
  skills/generic.ts    通用模型
  skills/overrides/    手工精建（每名干员一个文件）
src/ui/                界面（Svelte 5）
src/data/generated/    从游戏数据提取的精简 JSON
tools/                 数据提取、素材下载、覆盖报告脚本
docs/                  数据提取报告与引擎覆盖报告
```

### 想帮忙精建一名干员？

参考 `src/engine/skills/overrides/` 中已有的文件：每名干员实现一个 override，注释写明每项机制的处理与 PRTS 依据，并在测试里附上完整手算推导。`docs/engine-coverage.md` 列出了通用模型下各干员被忽略的机制，可以作为挑选目标的参考。

## 版权与免责声明

- 本项目**代码**以 [MIT 许可证](LICENSE) 开源。
- 《明日方舟》的游戏数据、文本、角色名称、立绘、图标等素材的著作权归**上海鹰角网络科技有限公司**及相关权利人所有，**不适用**本项目的开源许可证。本项目仅以非商业的粉丝工具形式引用，图片素材不随仓库分发。如权利人认为有不妥之处，请通过 Issue 联系，我们会及时处理。
- 计算结果仅供参考，可能与游戏内实际表现存在差异。

## 致谢

感谢 ArknightsGameData、ArknightsGameResource、ArknightsAssets2 的维护者，以及 PRTS Wiki 的编辑者们。
