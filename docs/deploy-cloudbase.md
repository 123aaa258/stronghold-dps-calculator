# 部署到静态托管（以腾讯云 CloudBase 为例）

## 能直接拖文件夹上传

构建用的是**相对路径**（`vite.config.ts` 里 `base: './'`），页面切换用的是 **hash 路由**（`#/calc`、`#/rank`）。所以：

- 构建产物 `dist/` 放在网站根目录或任意子目录都能用；
- 不需要配置「404 回退到 index.html」或重写规则；
- 排行用的后台线程（Web Worker）已内联在 JS 里，服务器不需要额外配置。

GitHub Pages、Netlify、Vercel、对象存储静态网站等任何静态托管都适用，下文以 CloudBase 控制台为例。

## 步骤

1. 下载素材并构建（素材不随仓库分发，第一次需要先下载）：

   ```bash
   npm run assets
   ```

   ```bash
   npm run build
   ```

2. 打开 CloudBase 控制台 → 静态网站托管 → 文件管理，进入 `dist/` 文件夹，**选中里面的全部内容**（`index.html` 和 `assets/`），拖进上传区。也可以直接拖整个 `dist/`，这时网站地址多一级 `/dist/`。
3. 用手机和电脑各打开一次，检查首页立绘、计算器选干员、排行页出结果、Boss 头像。

## 产物情况

| 项 | 数值 |
|---|---|
| 文件数 | 约 410 个（绝大多数是干员和 Boss 的 webp 图片） |
| 总大小 | 约 23 MB |
| 主 JS | 约 3.5 MB（内嵌全部游戏数据，gzip 后约 0.53 MB） |

用户首次打开主要下载 JS 和当前页面用到的图片，图片按需加载。如果控制台对单次拖入的文件数有限制，就分两次上传：先 `assets/` 里的图片目录，再传 `index.html` 和 JS / CSS。

## 正式域名

CloudBase 的默认域名只适合开发测试，访问时可能先出现提示页，正式使用请在控制台绑定自己的域名。参见 [CloudBase 域名说明](https://docs.cloudbase.net/service/alias)。

## 更新版本

- JS / CSS 文件名带内容哈希，每次构建都不同，不会被缓存成旧版本。
- `index.html` 名字不变。上传顺序：先传图片和新的 JS / CSS，**最后**传 `index.html`，这样上传过程中打开页面的人不会拿到引用了未上传文件的入口。
- 控制台上传会自动刷新 CDN 缓存，参见 [CloudBase 静态资源管理](https://docs.cloudbase.net/hosting/manage)。浏览器本地缓存仍受有效期影响，建议 `index.html` 设短缓存，带哈希的 JS / CSS 设长缓存。
- 旧版本的 JS 文件可以留着不删。图片目录没变就不用重传；同名换图时注意浏览器可能继续显示旧图。

## 单文件版

`npm run build:local` 输出到 `dist-local/`：单个 `index.html`（内联 JS 和 CSS），图片在同目录 `assets/`，可以双击离线使用。网页托管用 `dist/` 即可。

## 素材版权

干员立绘、头像和 Boss 图属于游戏版权方。仓库不包含这些图片，克隆后用 `npm run assets` 自行下载。托管站点会公开分发这些图片；如有顾虑，可以只托管不带 `assets/` 图片的版本，界面会显示文字占位。
