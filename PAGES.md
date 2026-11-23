# GitHub Pages 发布步骤

Pages 使用 GitHub 的分支发布模式：`gh-pages` 分支根目录。此分支只放 `site/` 静态文件，主分支保留研究报告、参考源码和完整复刻源码。

首次发布后，GitHub Pages 来源设为 `gh-pages` 分支根目录。以后更新站点：

```sh
./scripts/publish-pages.sh
```

脚本会将主分支的 `site/` 子目录推送到 `origin/gh-pages`。GitHub Pages 会在分支更新后重新发布。
