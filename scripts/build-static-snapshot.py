#!/usr/bin/env python3
"""Build a static, time-stamped frontend snapshot of public cantrip.cn pages."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from html import unescape
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
BASE = "https://cantrip.cn"
PAGES_BASE = "https://zmkc404.github.io/cantrip-cn-study"
PATH_PREFIX = "/cantrip-cn-study"
USER_AGENT = "Cantrip-UI-study-snapshot/1.0 (educational capture)"
TIMEOUT = 40


def fetch(path):
    url = path if path.startswith("https://") else BASE + path
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urlopen(req, timeout=TIMEOUT) as response:
        return response.read(), response.headers.get_content_type()


def fetch_with_status(path):
    try:
        body, content_type = fetch(path)
        return body, content_type, 200
    except HTTPError as exc:
        if exc.code == 404:
            return exc.read(), exc.headers.get_content_type(), 404
        raise


def route_file(path):
    if path == "/":
        return SITE / "index.html"
    if path.endswith(".json") or re.search(r"\.[A-Za-z0-9]{2,5}$", path):
        return SITE / path.lstrip("/")
    return SITE / path.strip("/") / "index.html"


def archive_file(archive, route):
    if route == "/":
        return archive / "pages" / "index.html"
    if route.endswith(".json") or re.search(r"\.[A-Za-z0-9]{2,5}$", route):
        return archive / "pages" / route.lstrip("/")
    return archive / "pages" / (route.strip("/") + ".html")


def prefix_path(path):
    if path.startswith("/x/") and path.lower().endswith(".mp4"):
        return BASE + path
    if path == PATH_PREFIX or path.startswith(PATH_PREFIX + "/"):
        return path
    return PATH_PREFIX + (path if path.startswith("/") else "/" + path)


def patch_html(text):
    attr = re.compile(r'\b(href|src|poster|data-src|data-page-src|action|srcset)=("|\')([^"\']*)("|\')')

    def patch_attr(match):
        name, quote, value, _ = match.groups()
        if name == "srcset":
            def item(m):
                return prefix_path(m.group(1)) + m.group(2)
            value = re.sub(r"(?<![A-Za-z0-9:])(/[^\s,]+)(\s+[^,]+)?", item, value)
        elif value.startswith("/"):
            value = prefix_path(value)
        elif value.startswith("https://cantrip.cn/") and name in ("href", "src", "poster"):
            parsed = value.removeprefix("https://cantrip.cn")
            value = prefix_path(parsed) if not parsed.lower().endswith(".mp4") else value
        return f"{name}={quote}{value}{quote}"

    text = attr.sub(patch_attr, text)
    text = re.sub(r'(content=["\'])https://cantrip\.cn(/[^"\']*)',
                  lambda m: m.group(1) + PAGES_BASE + m.group(2), text)
    shim = f'''<script>
(() => {{
  const base = {PATH_PREFIX!r};
  const withBase = value => {{
    if (value instanceof URL) value = value.pathname + value.search + value.hash;
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return value;
    if (value === base || value.startsWith(base + "/")) return value;
    return base + (value === "/" ? "/" : value);
  }};
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {{
    if (typeof input === "string" || input instanceof URL) {{
      const url = withBase(input);
      const method = init?.method ?? "GET";
      if (method !== "GET" && new URL(url, location.href).pathname.startsWith(base + "/api/"))
        return Promise.reject(new TypeError("Server APIs are not included in this static snapshot."));
      return nativeFetch(url, init);
    }}
    if (input instanceof Request && new URL(input.url).origin === location.origin) {{
      const url = withBase(new URL(input.url).pathname + new URL(input.url).search + new URL(input.url).hash);
      if (input.method !== "GET" && new URL(url, location.href).pathname.startsWith(base + "/api/"))
        return Promise.reject(new TypeError("Server APIs are not included in this static snapshot."));
      return nativeFetch(new Request(url, input), init);
    }}
    return nativeFetch(input, init);
  }};
  for (const method of ["pushState", "replaceState"]) {{
    const original = history[method].bind(history);
    history[method] = (state, title, url) => original(state, title, withBase(url));
  }}
}})();
</script>'''
    if "</head>" in text:
        text = text.replace("</head>", shim + "</head>", 1)
    return text


def write_page(path, body, archive, route):
    text = body.decode("utf-8", "replace")
    archive_target = archive_file(archive, route)
    archive_target.parent.mkdir(parents=True, exist_ok=True)
    archive_target.write_bytes(body)
    target = route_file(route)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(patch_html(text), encoding="utf-8")
    return text


def fetch_many(paths, workers=6):
    results, failures = {}, []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch, path): path for path in paths}
        for future in as_completed(futures):
            path = futures[future]
            try:
                results[path] = future.result()
            except Exception as exc:
                failures.append((path, str(exc)))
    return results, failures


def main():
    stamp = datetime.now().strftime("%Y-%m-%d")
    archive = ROOT / "research" / "reference-source" / f"cantrip.cn-live-{stamp}"
    if SITE.exists():
        shutil.rmtree(SITE)
    SITE.mkdir(parents=True)
    base_routes = [
        "/", "/en", "/reference", "/info", "/search.json",
        "/en/reference", "/en/info", "/en/search.json",
    ]
    # The page-one HTML is embedded in `/`; the API calls its next page `/feed/1`.
    feed_routes = [f"/feed/{n}" for n in range(1, 5)] + [f"/en/feed/{n}" for n in range(1, 5)]
    captured, failures = fetch_many(base_routes + feed_routes)
    if failures:
        raise SystemExit("Required page capture failed: " + repr(failures))

    pages = {}
    for route, (body, _) in captured.items():
        pages[route] = write_page(route, body, archive, route)
    slugs = []
    for text in pages.values():
        slugs.extend(re.findall(r'data-slug="([^"]+)"', text))
    slugs = list(dict.fromkeys(slugs))
    if len(slugs) != 99:
        raise SystemExit(f"Expected the source's 99-item catalogue; found {len(slugs)}")

    detail_routes = [
        path
        for slug in slugs
        for path in (f"/i/{slug}", f"/d/{slug}", f"/en/i/{slug}", f"/en/d/{slug}")
    ]
    detail_pages, failures = fetch_many(detail_routes)
    if failures:
        raise SystemExit("Detail page capture failed: " + repr(failures[:8]))
    for route, (body, _) in detail_pages.items():
        pages[route] = write_page(route, body, archive, route)

    # Capture every linked play/code endpoint, including the source's own per-path 404s.
    linked_routes = {"/code/dayface-mood-faces"}
    for text in pages.values():
        linked_routes.update(re.findall(r'''(?:href|src)=["'](/(?:en/)?(?:play|code)/[^"'#?]+)["']''', text))
    route_results, failures = {}, []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(fetch_with_status, route): route for route in sorted(linked_routes)}
        for future in as_completed(futures):
            route = futures[future]
            try:
                route_results[route] = future.result()
            except Exception as exc:
                failures.append((route, str(exc)))
    if failures:
        raise SystemExit("Linked route capture failed: " + repr(failures[:8]))
    not_found_count = 0
    first_404 = None
    for route, (body, _, status) in route_results.items():
        pages[route] = write_page(route, body, archive, route)
        if status == 404:
            not_found_count += 1
            first_404 = first_404 or body
    if first_404:
        pages["/404.html"] = write_page("/404.html", first_404, archive, "/404.html")

    # Preserve the exact captured source documents, including the 99 direct views and detail templates.
    assets = set()
    for text in pages.values():
        for match in re.finditer(r'''(?:href|src|poster|data-src|srcset)=["']([^"']+)["']''', text):
            value = unescape(match.group(1))
            for item in re.split(r"\s*,\s*", value):
                url = item.split()[0]
                if url.startswith(BASE):
                    url = url[len(BASE):]
                if not url.startswith("/") or url.startswith("//"):
                    continue
                if url.lower().endswith(".mp4"):
                    continue
                if re.search(r"\.(?:css|js|webp|png|jpe?g|svg|ico|woff2?|json)$", url, re.I):
                    assets.add(url)
        for match in re.finditer(r'''content=["']([^"']+)["']''', text):
            url = unescape(match.group(1))
            if url.startswith(BASE):
                url = url[len(BASE):]
            if url.startswith("/") and not url.startswith("//") and re.search(r"\.(?:webp|png|jpe?g|svg|ico)$", url, re.I):
                assets.add(url)
    # Styles can reference additional local images/fonts.
    for url in list(assets):
        if url.lower().endswith(".css"):
            try:
                body, _ = fetch(url)
                text = body.decode("utf-8", "replace")
                archive_target = archive / "assets" / url.lstrip("/")
                archive_target.parent.mkdir(parents=True, exist_ok=True)
                archive_target.write_bytes(body)
                target = SITE / url.lstrip("/")
                target.parent.mkdir(parents=True, exist_ok=True)
                text = re.sub(r"url\((['\"]?)(/[^)'\"]+)\1\)",
                              lambda m: "url(" + m.group(1) + prefix_path(m.group(2)) + m.group(1) + ")", text)
                target.write_text(text, encoding="utf-8")
                for ref in re.findall(r"url\((?:['\"]?)(/[^)'\"]+)", text):
                    if re.search(r"\.(?:webp|png|jpe?g|svg|ico|woff2?)$", ref, re.I):
                        assets.add(ref.removeprefix(PATH_PREFIX))
            except Exception as exc:
                print(f"CSS fetch failed {url}: {exc}", file=sys.stderr)

    asset_routes = sorted(assets)
    # Copy downloaded CSS from the archive through the already rewritten version in site.
    to_download = [u for u in asset_routes if not u.lower().endswith(".css") or not (SITE / u.lstrip("/")).exists()]
    assets_fetched, failures = fetch_many(to_download)
    for route, (body, _) in assets_fetched.items():
        archive_target = archive / "assets" / route.lstrip("/")
        archive_target.parent.mkdir(parents=True, exist_ok=True)
        archive_target.write_bytes(body)
        target = SITE / route.lstrip("/")
        target.parent.mkdir(parents=True, exist_ok=True)
        if route.lower().endswith(".css"):
            text = body.decode("utf-8", "replace")
            text = re.sub(r"url\((['\"]?)(/[^)'\"]+)\1\)",
                          lambda m: "url(" + m.group(1) + prefix_path(m.group(2)) + m.group(1) + ")", text)
            target.write_text(text, encoding="utf-8")
        else:
            target.write_bytes(body)
    if failures:
        print("Optional assets failed:", failures[:10], file=sys.stderr)

    # Keep non-MP4 media on the reference host to avoid bloating the GitHub repository.
    (SITE / ".nojekyll").touch()
    manifest = [
        f"Captured: {stamp}",
        f"Catalogue items: {len(slugs)}",
        "Feed pages: 5 per language (page 1 embedded in homepage)",
        f"Direct detail pages: {len(slugs)} per language",
        f"Detail fragments: {len(slugs)} per language",
        f"Captured linked /play/ and /code/ routes; original response was 404 for {not_found_count} routes.",
        f"Local assets: {len(assets_fetched)}",
        "MP4 files remain linked to cantrip.cn; no form data is sent by this build script.",
    ]
    (archive / "CAPTURE-MANIFEST.txt").write_text("\n".join(manifest) + "\n", encoding="utf-8")
    print("\n".join(manifest))


if __name__ == "__main__":
    main()
