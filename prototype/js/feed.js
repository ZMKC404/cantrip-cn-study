/* ============================================================
   Feed：JS masonry + 筛选/排序状态机 + FLIP + 详情浮层
   （行为规格对齐 cantrip.cn，代码为原生重实现）
   ============================================================ */

const grid = document.querySelector("[data-feed-grid]");
const feedWrap = document.querySelector("[data-feed]");
const emptyBox = document.querySelector("[data-feed-empty]");
const GAP = 24;
const MIN_COL = 304;

const state = { c: "", t: "", sort: "recent" };
const cards = () => [...grid.querySelectorAll("[data-card]")];

/* ---------- 状态从 URL 读 ---------- */
function readState() {
  const q = new URLSearchParams(location.search);
  const cat = q.get("c") || "";
  const sort = q.get("sort") || "recent";
  state.c = document.querySelector(`[data-chip="${cat}"]`) ? cat : "";
  state.sort = ["recent", "featured"].includes(sort) ? sort : "recent";
}
function writeState() {
  const q = new URLSearchParams();
  if (state.c) q.set("c", state.c);
  if (state.sort !== "recent") q.set("sort", state.sort);
  const s = q.toString();
  history.replaceState(history.state, "", s ? `?${s}` : location.pathname);
}

/* ---------- masonry：绝对定位贪心最短列 ---------- */
let firstLayout = true;
const oldRects = new WeakMap();

function layout(animate) {
  const W = grid.clientWidth;
  const cols = Math.max(1, Math.min(3, Math.floor((W + GAP) / MIN_COL)));
  const w = (W - GAP * (cols - 1)) / cols;
  const heights = new Array(cols).fill(0);

  grid.classList.add("js-masonry");
  const visible = cards().filter((c) => !c.hidden);
  if (!firstLayout) {
    for (const c of visible) {
      oldRects.set(c, c.getBoundingClientRect());
    }
  }

  for (const c of visible) {
    c.style.width = `${w}px`;
  }
  // 读完高度再定坐标（宽度定了 aspect-ratio 高度即定）
  for (const c of visible) {
    const h = c.offsetHeight;
    let col = 0;
    for (let i = 1; i < cols; i++) if (heights[i] < heights[col]) col = i;
    const x = col * (w + GAP);
    const y = heights[col];
    heights[col] = y + h + GAP;
    moveFLIP(c, `${x}px ${y}px`, animate);
  }
  grid.style.height = `${Math.max(0, Math.max(...heights) - GAP)}px`;
  firstLayout = false;
}

function moveFLIP(card, to, animate) {
  const from = oldRects.get(card);
  card.style.translate = to;
  if (!animate || !from || prefersReduced()) return;
  const now = card.getBoundingClientRect();
  const dx = from.left - now.left;
  const dy = from.top - now.top;
  // transform 与 style.translate 按规范叠加：动画补差值即可回到旧位
  if (dx || dy) {
    card.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: "translate(0,0)" },
      ],
      { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
  }
}

const prefersReduced = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- 筛选 / 排序 / 重排 ----------
   state 是唯一事实源：apply 只消费 state，最后 writeState 回写 URL */
function apply({ animate = true } = {}) {
  // 显隐
  let visibleCount = 0;
  for (const c of cards()) {
    const match = !state.c || c.dataset.category === state.c;
    c.hidden = !match;
    if (match) visibleCount++;
  }
  // 排序（过滤后的数组）
  const sorted = cards()
    .filter((c) => !c.hidden)
    .sort((a, b) => {
      if (state.sort === "featured") {
        const fa = a.hasAttribute("data-featured") ? 0 : 1;
        const fb = b.hasAttribute("data-featured") ? 0 : 1;
        if (fa !== fb) return fa - fb;
      }
      return (+a.dataset.order || 0) - (+b.dataset.order || 0);
    });
  // DOM 重排（LIS 太重，复刻用直接 append；视频场景需 moveBefore）
  for (const c of sorted) grid.appendChild(c);
  // chips aria-current
  for (const chip of document.querySelectorAll("[data-chip]")) {
    const on = (chip.dataset.chip || "") === state.c;
    if (on) chip.setAttribute("aria-current", "true");
    else chip.removeAttribute("aria-current");
  }
  // 空态
  emptyBox.toggleAttribute("data-show", visibleCount === 0);
  writeState();
  layout(animate);
}

/* toolbar 事件（委托） */
document.querySelector("[data-toolbar]")?.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-chip]");
  if (chip) {
    e.preventDefault();
    state.c = chip.dataset.chip || "";
    apply();
    if (window.scrollY > grid.offsetTop) {
      scrollTo({ top: 0, behavior: prefersReduced() ? "auto" : "smooth" });
    }
    return;
  }
  const opt = e.target.closest("[data-sort-opt]");
  if (opt) {
    state.sort = opt.dataset.sortOpt;
    closeSort();
    apply();
  }
});

/* 排序菜单 */
const sortBtn = document.querySelector("[data-sort-btn]");
const sortMenu = document.querySelector("[data-sort-menu]");
function closeSort() {
  sortMenu.hidden = true;
  sortBtn.setAttribute("aria-expanded", "false");
}
sortBtn?.addEventListener("click", () => {
  const open = sortMenu.hidden;
  sortMenu.hidden = !open;
  sortBtn.setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (e) => {
  if (sortMenu && !sortMenu.hidden && !e.target.closest("[data-sort]")) closeSort();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sortMenu && !sortMenu.hidden) {
    closeSort();
    sortBtn.focus();
  }
});
document.querySelector("[data-feed-reset]")?.addEventListener("click", () => {
  state.c = "";
  apply();
});

/* ---------- 视口入场动画（对应原站视频 IO 懒加载的位置） ---------- */
const io = new IntersectionObserver(
  (entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        en.target.animate(
          [
            { opacity: 0, scale: 0.97 },
            { opacity: 1, scale: 1 },
          ],
          {
            duration: 260,
            delay: Math.min(visibleIndex(en.target), 10) * 24,
            easing: "cubic-bezier(.23,1,.32,1)",
            fill: "backwards",
          }
        );
        io.unobserve(en.target);
      }
    }
  },
  { rootMargin: "0px 0px 200px 0px" }
);
function visibleIndex(card) {
  return cards().filter((c) => !c.hidden).indexOf(card);
}
for (const c of cards()) io.observe(c);

/* resize 重排（不动画） */
let raf = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => layout(false));
}).observe(grid);

/* ============================================================
   详情浮层：打开 = 克隆卡片 artwork 进舞台 + pushState
   ============================================================ */
const detail = document.querySelector("[data-detail]");
const detailStage = detail.querySelector("[data-detail-stage]");
const detailInfo = detail.querySelector("[data-detail-info]");
const detailPos = detail.querySelector("[data-detail-pos]");
const detailStatus = detail.querySelector("[data-detail-status]");
let currentSlug = null;
let lastFocus = null;

/* 详情文案（复刻样例数据） */
const NOTES = {
  "dayface-mood-faces": {
    title: "今天是哪张脸",
    desc: "把记心情做成摆弄一盒玩具：八个选项是八张有表情的小脸，五官会轻轻挪动，心情名在标签里轮显。选一张脸，今天就算记完了。",
    author: "rishi（复刻样例）",
    date: "2026 年 11 月 17 日",
    notes: ["凭脸认心情，不用读字。", "名字不常驻，靠标签轮显。", "五官会挪，像玩具被拨动。"],
    meta: { "英文": "Today's Face", "风格": "趣味", "色调": "多彩" },
  },
  default: null,
};

function openDetail(slug) {
  const card = grid.querySelector(`[data-slug="${slug}"]`);
  if (!card) return;
  lastFocus = document.activeElement;
  currentSlug = slug;

  // stage：克隆卡片 artwork
  detailStage.innerHTML = "";
  const art = card.querySelector(".art");
  if (art) {
    const clone = art.cloneNode(true);
    clone.classList.remove("demo");
    const r = card.querySelector(".media")?.style.aspectRatio || "1";
    clone.style.setProperty("--r", r.split("/")[0] / r.split("/")[1]);
    clone.style.setProperty("--mw", "720px");
    detailStage.appendChild(clone);
  }

  // info：从卡片 + NOTES 生成
  const note = NOTES[slug];
  const title = note?.title || card.querySelector(".title")?.textContent || slug;
  const sub = card.querySelector(".sub")?.textContent || "";
  const catName = card.querySelector(".labels span")?.textContent || "";
  detailInfo.innerHTML = `
    <div class="lead">
      <p class="labels"><a href="#" data-filter="c:${card.dataset.category}">${catName}</a></p>
      <h2 id="detail-title">${title}</h2>
      <p class="desc">${note?.desc || sub}</p>
      <p class="byline"><span>作者：</span><a href="#" onclick="return false">${note?.author || "佚名"}</a><span class="sep">·</span><time>${note?.date || "2026 年"}</time></p>
    </div>
    <div class="side">
      <div class="actions single">
        <button class="btn primary t-press" data-gate="prompt" data-copy-prompt="${title}：${sub}。照这个交互做，换成现有技术栈。">复制提示词</button>
        <button class="btn icon ghost" data-copy-link aria-label="复制链接"><svg width="15" height="15" viewBox="0 0 256 256" fill="currentColor"><path d="M224 96a56 56 0 0 0-56-56h-24a8 8 0 0 0 0 16h24a40 40 0 0 1 0 80h-24a8 8 0 0 0 0 16h24a56 56 0 0 0 56-56ZM104 136h48a8 8 0 0 0 0-16h-48a8 8 0 0 0 0 16Zm-24 8H56a40 40 0 0 1 0-80h24a8 8 0 0 0 0-16H56a56 56 0 0 0 0 112h24a8 8 0 0 0 0-16Z"/></svg></button>
      </div>
      <dl class="meta">${note ? Object.entries(note.meta).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("") : ""}</dl>
    </div>
    <div class="notes">
      <h3>设计要点</h3>
      ${(note?.notes || ["结构与交互均为复刻样例。"]).map((n) => `<p>${n}</p>`).join("")}
    </div>`;

  // 位置指示 + 打开
  const visible = cards().filter((c) => !c.hidden);
  const idx = visible.indexOf(card) + 1;
  detailPos.textContent = `${idx} / ${visible.length}`;
  detail.removeAttribute("hidden");
  document.documentElement.style.overflow = "hidden";
  document.querySelector(".shell-main")?.setAttribute("inert", "");
  document.querySelector(".mbar")?.setAttribute("inert", "");
  history.pushState({ detail: slug }, "", `#i/${slug}`);
  detail.querySelector("[data-detail-close]")?.focus();
  detailStatus.textContent = title;
}

function closeDetail({ skipHistory = false } = {}) {
  if (detail.hasAttribute("hidden")) return;
  detail.setAttribute("hidden", "");
  document.documentElement.style.overflow = "";
  document.querySelector(".shell-main")?.removeAttribute("inert");
  document.querySelector(".mbar")?.removeAttribute("inert");
  if (!skipHistory && location.hash.startsWith("#i/")) {
    history.pushState({}, "", location.pathname + location.search);
  }
  lastFocus?.focus?.();
  currentSlug = null;
}

function stepDetail(dir) {
  const visible = cards().filter((c) => !c.hidden);
  const i = visible.findIndex((c) => c.dataset.slug === currentSlug);
  const next = visible[i + dir];
  if (next) openDetail(next.dataset.slug);
}

/* 打开入口：卡片点击（避开卡内按钮）；热区锚点阻止默认 hash 跳转，
   URL 交给 pushState 管理，避免多余 popstate 把浮层关掉 */
grid.addEventListener("click", (e) => {
  const openHit = e.target.closest("a[data-open]");
  if (openHit) e.preventDefault();
  if (e.target.closest("button, a:not([data-open])")) return;
  const card = e.target.closest("[data-card]");
  if (card) openDetail(card.dataset.slug);
});
detail.addEventListener("click", (e) => {
  if (e.target.closest("[data-detail-close]")) return closeDetail();
  const step = e.target.closest("[data-detail-step]");
  if (step) return stepDetail(+step.dataset.detailStep);
  const filter = e.target.closest("[data-filter]");
  if (filter) {
    e.preventDefault();
    closeDetail();
    state.c = filter.dataset.filter.split(":")[1] || "";
    apply();
  }
});
document.addEventListener("keydown", (e) => {
  if (!detail.hasAttribute("hidden")) {
    if (e.key === "Escape") return closeDetail();
    if (e.key === "ArrowLeft") return stepDetail(-1);
    if (e.key === "ArrowRight") return stepDetail(1);
  }
});

/* popstate：浏览器返回时同步浮层 */
window.addEventListener("popstate", (e) => {
  if (e.state?.detail) openDetail(e.state.detail);
  else closeDetail({ skipHistory: true });
});

/* ---------- 启动 ---------- */
readState();
apply({ animate: false });
