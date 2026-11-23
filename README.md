# Cantrip.cn 前端快照与界面原型

本仓库用于验证网页结构、交互和静态部署能力。

- 在线快照：<https://zmkc404.github.io/cantrip-cn-study/>
- 原站：<https://cantrip.cn/>
- 快照时间：2026-11-23

## 内容

- `site/`：GitHub Pages 当前发布的前端快照，包含中英文首页、99 个作品、两种语言各 5 页列表与 99 个详情页、搜索索引、自定义 404 和必要静态资源。
- `research/reference-source/cantrip.cn-live-2026-11-23/`：本次采集的原站页面、分页片段、详情片段和资源档案，含采集清单。
- `research/拆解报告.md`：此前的结构、样式和交互研究记录。
- `prototype/`：早期手工制作的 10 卡原生 HTML/CSS/JS 原型；它不是当前线上快照。
- `scripts/build-static-snapshot.py`：从公开页面更新静态快照及研究档案。
- `scripts/publish-pages.sh`：将 `site/` 推送到 Pages 发布分支。

## 静态托管范围

列表、搜索、详情、筛选和排序使用保存的前端资源与页面数据。视频文件仍由原站提供。原站的订阅、验证码和投稿服务端没有被复制；本仓库不应收集真实邮箱或投稿内容。

## 更新

```sh
python3 scripts/build-static-snapshot.py
./scripts/publish-pages.sh
```

GitHub Pages 从 `gh-pages` 分支根目录发布。完整源码和研究材料保存在 `main` 分支，网页只发布 `site/`。
