# Cantrip 中文复刻与研究档案

Cantrip.cn 的教学研究项目：根据公开页面和交互进行拆解，再用原生 HTML、CSS、JavaScript 独立重写一个静态演示站。复刻站保留了布局、卡片、筛选、排序、详情弹层、搜索、订阅墙和移动端菜单等交互示例。

## 在线预览

GitHub Pages：<https://zmkc404.github.io/cantrip-cn-study/>

## 目录

- `site/`：GitHub Pages 实际发布内容，只包含复刻站和运行所需资源。
- `replica/`：复刻站完整源文件，含卡片模板。
- `research/拆解报告.md`：页面结构、设计系统与行为分析。
- `research/reference-source/cantrip.cn/`：研究时保存的公开页面、样式、脚本和搜索数据参考副本。
- `research/recorder-test/`：录制器测试用媒体文件。
- `PAGES.md`：Pages 发布方式与更新步骤。

## 本地预览

进入 `site/` 后启动任意静态文件服务器，例如：

```sh
python3 -m http.server 8000
```

浏览器打开 `http://localhost:8000/`。

## 发布

Pages 从 `gh-pages` 分支根目录发布；仓库主分支保留完整研发材料，网站只发布 `site/` 内容。更新网站时运行 `scripts/publish-pages.sh`。

## 参考资料说明

`research/reference-source/cantrip.cn/` 是对公开页面资源的研究归档，用于解释复刻依据，不属于本项目原创代码，也不随 Pages 站点发布。原站及其内容权利归原作者所有。复刻实现以独立编写为目标；该仓库不代表与 Cantrip.cn 存在关联或背书。
