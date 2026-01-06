(async function () {
  console.log("[mBank Snapshot] loaded");

  const INDEX_FILE = "index.html";
  const REPLACE_DELAY_MS = 60;

  let cachedIndexHtml = "";

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function loadIndexHtml() {
    if (cachedIndexHtml) return cachedIndexHtml;
    const url = chrome.runtime.getURL(INDEX_FILE);
    const res = await fetch(url);
    cachedIndexHtml = await res.text();
    return cachedIndexHtml;
  }

  function removeScripts(root) {
    try {
      const scripts = root.querySelectorAll("script");
      scripts.forEach((s) => s.remove());
    } catch {
      // ignore
    }
  }

  async function injectIndexHtmlIntoPage() {
    const html = await loadIndexHtml();
    if (!html || html.trim().length === 0) {
      throw new Error("index.html is empty");
    }

    await sleep(REPLACE_DELAY_MS);

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Optional title update
    try {
      const t = doc.querySelector("title");
      if (t) document.title = t.textContent || document.title;
    } catch {
      // ignore
    }

    // Inject as static body content while keeping the tab URL unchanged
    const container = document.createElement("div");
    container.innerHTML = html;
    removeScripts(container);

    const head = document.head;
    document.body.parentNode.replaceChild(container, document.body);
    document.head = head;
  }

  function hookButton() {
    const btn = document.getElementById("liv-filter-action");
    if (!btn || btn.__hooked) return;

    btn.__hooked = true;
    console.log("[mBank Snapshot] liv-filter-action hooked");

    function is365Selected() {
      const dd = document.getElementById("cmn-dropdown-3");
      if (!dd) return false;

      // The selected label is typically rendered inside .style-select-header-value.
      const labelEl =
        dd.querySelector(".style-select-header-value") ||
        dd.querySelector(".style-select-div-value") ||
        dd;
      const text = (labelEl.textContent || "").trim();

      // Keep it language-agnostic: require "365" to be present.
      return /365/.test(text);
    }

    btn.addEventListener(
      "click",
      (e) => {
        if (!is365Selected()) return;

        // Only redirect/inject when the 365-day range is selected.
        // Prevent the original handler to keep the flow deterministic.
        try {
          e.preventDefault();
          e.stopImmediatePropagation();
        } catch {
          // ignore
        }

        injectIndexHtmlIntoPage().catch((err) => {
          console.error("[mBank Snapshot] Error:", err);
          alert("Error occurred: " + (err && err.message ? err.message : String(err)));
        });
      },
      true
    );
  }

  const observer = new MutationObserver(hookButton);
  observer.observe(document, { childList: true, subtree: true });

  hookButton();
})();