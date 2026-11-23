/* ============================================================
   UI：toast / 复制门禁 / 逐词入场 / 搜索 / 订阅 / 投稿 / 移动栏
   （行为规格对齐 cantrip.cn，代码为原生重实现）
   ============================================================ */

/* ---------- toast ---------- */
const toaster = document.querySelector("[data-toaster]");
export function toast(text) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  toaster.appendChild(el);
  requestAnimationFrame(() => el.setAttribute("data-show", ""));
  setTimeout(() => {
    el.removeAttribute("data-show");
    setTimeout(() => el.remove(), 250);
  }, 2200);
}

/* ---------- 收录计数（跟随卡片数量自动更新） ---------- */
const countAll = document.querySelector(".count-all");
if (countAll) {
  countAll.textContent = `已收录 ${document.querySelectorAll("[data-card]").length} 个`;
}

/* ---------- 逐词入场（.word span 在 HTML 里预拆好则跳过；否则 JS 拆） ---------- */
for (const p of document.querySelectorAll("[data-words]")) {
  if (!p.querySelector(".word")) {
    p.innerHTML = p.textContent
      .trim()
      .split("")
      .map((ch, i) =>
        ch === " " ? " " : `<span class="word" style="--wi:${i}">${ch}</span>`
      )
      .join("");
  }
  new IntersectionObserver(
    (entries, obs) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          obs.unobserve(en.target);
        }
      }
    },
    { threshold: 0.4 }
  ).observe(p);
}

/* ---------- 复制 + 门禁（gate → 未放行则弹订阅墙） ---------- */
const PASS_KEY = "cp_pass";
const passed = () => localStorage.getItem(PASS_KEY) === "1";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制到剪贴板");
    return true;
  } catch {
    toast("复制失败，请手动复制");
    return false;
  }
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-gate]");
  if (btn && !passed()) {
    e.preventDefault();
    e.stopImmediatePropagation();
    openOverlay("subscribe");
    subscribeMode({ wall: true, from: btn });
    return;
  }
  if (btn) {
    // 门禁已放行：按钮自带 prompt 则直接复制
    const text = btn.getAttribute("data-copy-prompt");
    if (text) copyText(text);
    return;
  }
  const cp = e.target.closest("[data-copy-prompt-for]");
  if (cp) {
    const slug = cp.dataset.copyPromptFor;
    const card = document.querySelector(`[data-slug="${slug}"]`);
    const title = card?.querySelector(".title")?.textContent || slug;
    const sub = card?.querySelector(".sub")?.textContent || "";
    copyText(`${title}：${sub}。照这个交互复刻，换成现有技术栈。`);
    return;
  }
  const link = e.target.closest("[data-copy-link]");
  if (link) {
    copyText(location.origin + location.pathname);
  }
});

/* ---------- 浮层通用开关 ---------- */
const overlayCfg = {
  search: { sel: "[data-search]", open: "[data-search-open]", close: "[data-search-close]" },
  subscribe: { sel: "[data-subscribe]", open: "[data-subscribe-open]", close: "[data-subscribe-close]" },
  feedback: { sel: "[data-feedback]", open: "[data-feedback-open]", close: "[data-feedback-close]" },
};

function openOverlay(name) {
  const el = document.querySelector(overlayCfg[name].sel);
  if (!el || !el.hasAttribute("hidden")) return el;
  el.removeAttribute("hidden");
  document.documentElement.style.overflow = "hidden";
  const input = el.querySelector("input:not([tabindex='-1'])");
  input?.focus();
  return el;
}
function closeOverlay(name) {
  const el = document.querySelector(overlayCfg[name].sel);
  if (!el || el.hasAttribute("hidden")) return;
  el.setAttribute("hidden", "");
  document.documentElement.style.overflow = "";
  el.querySelector("form")?.reset();
}

for (const [name, cfg] of Object.entries(overlayCfg)) {
  document.addEventListener("click", (e) => {
    const openBtn = e.target.closest(cfg.open);
    if (openBtn) {
      e.preventDefault();
      openOverlay(name);
      if (name === "subscribe") subscribeMode({ wall: false });
      if (name === "feedback") feedbackMode("submit");
    }
    if (e.target.closest(cfg.close)) closeOverlay(name);
  });
}

/* Esc / ⌘K */
document.addEventListener("keydown", (e) => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === "Escape") {
    for (const name of Object.keys(overlayCfg)) {
      const el = document.querySelector(overlayCfg[name].sel);
      if (el && !el.hasAttribute("hidden")) {
        closeOverlay(name);
        return;
      }
    }
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    const el = document.querySelector(overlayCfg.search.sel);
    el.hasAttribute("hidden") ? openOverlay("search") : closeOverlay("search");
  }
  if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) {
    e.preventDefault();
    openOverlay("search");
  }
});

/* ---------- 搜索（评分：标题前缀 3 > 包含 2 > 关键词 1） ---------- */
const searchRoot = document.querySelector("[data-search]");
const searchInput = searchRoot.querySelector("[data-search-input]");
const searchResults = searchRoot.querySelector("[data-search-results]");
const searchHeading = searchRoot.querySelector("[data-search-heading]");
const searchEmpty = searchRoot.querySelector("[data-search-empty]");
const searchStatus = searchRoot.querySelector("[data-search-status]");

const searchData = (cards) =>
  cards.map((c) => ({
    slug: c.dataset.slug,
    title: c.querySelector(".title")?.textContent || c.dataset.slug,
    sub: c.querySelector(".sub")?.textContent || "",
    category: c.dataset.category,
    keywords: c.dataset.tags || "",
  }));
let list = searchData([...document.querySelectorAll("[data-card]")]);

const esc = (s) =>
  s.replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );

function renderResults(q) {
  const query = q.trim().toLowerCase();
  let hits;
  if (!query) {
    hits = list.slice(0, 6);
    searchHeading.textContent = "最近收录";
  } else {
    hits = list
      .map((item) => {
        const t = item.title.toLowerCase();
        let score = 0;
        if (t.startsWith(query)) score = 3;
        else if (t.includes(query)) score = 2;
        else if (
          `${item.category} ${item.keywords}`.toLowerCase().includes(query)
        )
          score = 1;
        return { ...item, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    searchHeading.textContent = `共 ${hits.length} 条`;
  }
  searchResults.innerHTML = hits
    .map((h, i) => {
      const t = esc(h.title);
      const idx = h.title.toLowerCase().indexOf(query);
      const marked =
        query && idx >= 0
          ? esc(h.title.slice(0, idx)) +
            "<mark>" +
            esc(h.title.slice(idx, idx + query.length)) +
            "</mark>" +
            esc(h.title.slice(idx + query.length))
          : t;
      return `<li role="option" aria-selected="false" id="search-opt-${i}">
        <button type="button" data-goto="${h.slug}">
          <span class="swatch" aria-hidden="true"></span>
          <span><span class="r-title">${marked}</span><br><span class="r-sub">${esc(h.sub || h.keywords)}</span></span>
        </button>
      </li>`;
    })
    .join("");
  searchEmpty.toggleAttribute("hidden", hits.length > 0 || !query);
  searchStatus.textContent = query ? `${hits.length} 条结果` : "";
}

searchInput?.addEventListener("input", () => renderResults(searchInput.value));
searchInput?.addEventListener("keydown", (e) => {
  if (e.isComposing) return;
  const opts = [...searchResults.querySelectorAll("li")];
  const cur = opts.findIndex((o) => o.getAttribute("aria-selected") === "true");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const next =
      e.key === "ArrowDown"
        ? (cur + 1) % opts.length
        : (cur - 1 + opts.length) % opts.length;
    opts.forEach((o, i) =>
      o.setAttribute("aria-selected", String(i === next))
    );
    opts[next]?.scrollIntoView({ block: "nearest" });
    searchInput.setAttribute("aria-activedescendant", `search-opt-${next}`);
  } else if (e.key === "Enter" && cur >= 0) {
    opts[cur]?.querySelector("button")?.click();
  }
});
searchResults?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-goto]");
  if (!btn) return;
  closeOverlay("search");
  const card = document.querySelector(`[data-slug="${btn.dataset.goto}"]`);
  card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});

/* ---------- 订阅（本地模拟三态 + 复制墙） ---------- */
const subscribeRoot = document.querySelector("[data-subscribe]");
const subscribeForm = subscribeRoot.querySelector("[data-subscribe-form]");
const subscribeDone = subscribeRoot.querySelector("[data-subscribe-done]");
const subscribeError = subscribeRoot.querySelector("[data-subscribe-error]");
let wallFrom = null;

function subscribeMode({ wall, from }) {
  wallFrom = from || null;
  subscribeForm.hidden = false;
  subscribeDone.hidden = true;
  subscribeRoot.querySelector(".dialog-h").textContent = wall
    ? "先验证邮箱"
    : "订阅上新";
  subscribeRoot.querySelector(".dialog-p").textContent = wall
    ? "复制提示词前，验证一下邮箱就好——验证过一次，本浏览器永久放行。"
    : "每月一封，只发值得看的新作品。";
}

subscribeForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = subscribeRoot.querySelector("[data-subscribe-email]").value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    subscribeError.textContent = "邮箱格式看起来不太对。";
    return;
  }
  if (subscribeForm.website?.value) return; // 蜜罐
  subscribeError.textContent = "";
  localStorage.setItem(PASS_KEY, "1");
  subscribeForm.hidden = true;
  subscribeDone.hidden = false;
  subscribeDone.querySelector("[data-subscribe-done-text]").textContent =
    "验证通过，欢迎加入。";
  setTimeout(() => {
    closeOverlay("subscribe");
    if (wallFrom) wallFrom.click(); // 还原焦点并补发原操作
    wallFrom = null;
  }, 900);
});

/* ---------- 投稿（本地模拟） ---------- */
const feedbackRoot = document.querySelector("[data-feedback]");
const feedbackForm = feedbackRoot.querySelector("[data-feedback-form]");
const feedbackError = feedbackRoot.querySelector("[data-feedback-error]");
const feedbackCount = feedbackRoot.querySelector("[data-feedback-count]");
const feedbackMsg = feedbackRoot.querySelector("[data-feedback-message]");
const MAX = 300;

function feedbackMode() {
  feedbackForm.hidden = false;
  feedbackError.textContent = "";
}

feedbackMsg?.addEventListener("input", () => {
  const n = [...feedbackMsg.value].length;
  feedbackCount.textContent = `${n} / ${MAX}`;
  feedbackCount.toggleAttribute("data-over", n > MAX);
});

feedbackForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const link = feedbackRoot.querySelector("[data-feedback-link]").value.trim();
  const url = /^https?:\/\//.test(link) ? link : link && `https://${link}`;
  if (!url || !/^https?:\/\/.+/.test(url)) {
    feedbackError.textContent = "请填一个有效的作品链接。";
    return;
  }
  if (feedbackForm.website?.value) return;
  feedbackError.textContent = "";
  feedbackForm.hidden = true;
  const p = document.createElement("p");
  p.className = "done-panel";
  p.style.marginTop = "16px";
  p.textContent = "收到了，谢谢你。";
  feedbackForm.after(p);
  setTimeout(() => {
    closeOverlay("feedback");
    p.remove();
    feedbackForm.hidden = false;
  }, 1200);
});

/* ---------- 移动顶栏 ---------- */
const mbar = document.querySelector("[data-mbar]");
const mToggle = document.querySelector("[data-mbar-toggle]");
const mMenu = document.querySelector("[data-mbar-menu]");
const mScrim = document.querySelector("[data-mbar-scrim]");

function toggleMenu(open) {
  mToggle.setAttribute("aria-expanded", String(open));
  mMenu.classList.toggle("is-open", open);
  mScrim.classList.toggle("is-open", open);
}
mToggle?.addEventListener("click", () =>
  toggleMenu(mToggle.getAttribute("aria-expanded") !== "true")
);
mScrim?.addEventListener("click", () => toggleMenu(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && mMenu?.classList.contains("is-open")) {
    toggleMenu(false);
    mToggle.focus();
  }
});

let sRaf = 0;
function onScroll() {
  cancelAnimationFrame(sRaf);
  sRaf = requestAnimationFrame(() => {
    mbar?.toggleAttribute("data-scrolled", window.scrollY > 0);
  });
}
addEventListener("scroll", onScroll, { passive: true });
onScroll();
