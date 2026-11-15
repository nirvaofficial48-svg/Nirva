/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { NirvaReadSearch } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/readsearch/NirvaReadSearch.sys.mjs"
);

const $ = id => document.getElementById(id);
const browserWindow =
  window.docShell?.chromeEventHandler?.documentGlobal ?? null;
const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
let settings = null;
let resultByURL = new Map();
let searchRequest = 0;
let searchTimer = null;
let pendingAction = null;
let lastItems = [];
const filters = { time: "any", kind: "all" };

function setStatus(id, args = {}) {
  document.l10n.setAttributes($("status"), id, args);
}

function formatDate(timestamp) {
  return dateTime.format(new Date(timestamp));
}

function makeButton(id, action, value, labelArgs = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "quiet-button small-button";
  button.dataset.action = action;
  button.dataset.value = value;
  document.l10n.setAttributes(button, id, labelArgs);
  return button;
}

function appendPassage(node, passage) {
  const fragments = passage.split(/(⟦[^⟧]*⟧)/g);
  for (const fragment of fragments) {
    if (!fragment) {
      continue;
    }
    if (fragment.startsWith("⟦") && fragment.endsWith("⟧")) {
      const mark = document.createElement("mark");
      mark.textContent = fragment.slice(1, -1);
      node.append(mark);
    } else {
      node.append(document.createTextNode(fragment));
    }
  }
}

function passesFilters(page) {
  if (filters.kind != "all") {
    const saved = page.sourceKind == "saved";
    if (saved != (filters.kind == "saved")) {
      return false;
    }
  }
  if (filters.time != "any") {
    const since = Date.now() - Number(filters.time) * 86400000;
    if (!(page.lastVisited >= since)) {
      return false;
    }
  }
  return true;
}

function openPage(page) {
  NirvaReadSearch.openResult(browserWindow, page);
}

function renderResults(items) {
  lastItems = items;
  const list = $("results");
  const query = $("query").value.trim();
  const shown = items.filter(passesFilters);
  resultByURL = new Map(items.map(page => [page.url, page]));
  const rows = shown.map(page => {
    const item = document.createElement("li");
    item.className = "result-card";
    item.tabIndex = 0;
    item.dataset.url = page.url;
    const heading = document.createElement("div");
    heading.className = "result-heading";
    const copy = document.createElement("div");
    copy.className = "result-copy";
    const title = document.createElement("h3");
    title.textContent = page.title;
    const url = document.createElement("p");
    url.className = "result-url";
    url.textContent = page.url;
    const context = document.createElement("p");
    context.className = "result-context";
    document.l10n.setAttributes(
      context,
      page.sourceKind == "saved"
        ? "nirva-read-search-result-saved-context"
        : "nirva-read-search-result-visited-context",
      {
        date: formatDate(page.lastVisited),
        count: page.visitCount,
      }
    );
    copy.append(title, url, context);
    const source = document.createElement("span");
    source.className = "source-badge";
    document.l10n.setAttributes(
      source,
      page.sourceKind == "saved"
        ? "nirva-read-search-source-saved"
        : "nirva-read-search-source-live"
    );
    heading.append(copy, source);
    const passage = document.createElement("p");
    passage.className = "result-passage";
    if (page.passage.includes("⟦")) {
      appendPassage(passage, page.passage);
    } else {
      document.l10n.setAttributes(
        passage,
        "nirva-read-search-result-metadata-match",
        { query }
      );
    }
    // Opening is the card itself; the rarer actions stay quiet until wanted.
    const actions = document.createElement("div");
    actions.className = "result-actions";
    const openButton = makeButton(
      page.sourceKind == "saved" && page.localURI
        ? "nirva-read-search-open-copy"
        : "nirva-read-search-open-live",
      "open-result",
      page.url
    );
    openButton.classList.add("result-open");
    actions.append(
      openButton,
      makeButton("nirva-read-search-exclude-page", "exclude-page", page.url),
      makeButton("nirva-read-search-forget-page", "delete-page", page.url)
    );
    item.append(heading, passage, actions);
    return item;
  });
  list.replaceChildren(...rows);
  $("empty-state").hidden = Boolean(rows.length) || !query;
  $("recent").hidden = Boolean(query) || !$("recent-list").children.length;
  if (query) {
    document.l10n.setAttributes(
      $("status"),
      rows.length
        ? "nirva-read-search-results-count"
        : "nirva-read-search-no-results",
      { count: rows.length }
    );
  }
}

function renderRecent() {
  const pages = [...(settings?.pages ?? [])]
    .sort((a, b) => b.lastVisited - a.lastVisited)
    .slice(0, 6);
  const rows = pages.map(page => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-row";
    button.dataset.url = page.url;
    const title = document.createElement("span");
    title.className = "recent-title";
    title.textContent = page.title;
    const detail = document.createElement("span");
    detail.className = "recent-detail";
    detail.textContent = `${page.domain} · ${formatDate(page.lastVisited)}`;
    button.append(title, detail);
    item.append(button);
    return item;
  });
  $("recent-list").replaceChildren(...rows);
  $("recent").hidden = Boolean($("query").value.trim()) || !rows.length;
}

async function runSearch() {
  const request = ++searchRequest;
  const query = $("query").value.trim();
  if (!query) {
    renderResults([]);
    $("status").textContent = "";
    return;
  }
  try {
    const items = await NirvaReadSearch.search(query, browserWindow, 40);
    if (request != searchRequest) {
      return;
    }
    renderResults(items);
  } catch (error) {
    setStatus("nirva-read-search-status-error", { reason: error.message });
  }
}

function renderList(items, emptyNode, id, renderer) {
  const list = $(id);
  list.replaceChildren(...items.map(renderer));
  $(emptyNode).hidden = items.length;
}

function renderSettings() {
  $("retention").value = String(settings.retentionDays);
  document.l10n.setAttributes(
    $("pause-toggle"),
    settings.paused ? "nirva-read-search-resume" : "nirva-read-search-pause"
  );
  $("page-count").textContent = "";
  document.l10n.setAttributes($("page-count"), "nirva-read-search-page-count", {
    count: settings.pageCount,
  });
  document.l10n.setAttributes(
    $("manage-summary"),
    settings.paused
      ? "nirva-read-search-manage-summary-paused"
      : "nirva-read-search-manage-summary",
    { count: settings.pageCount, days: settings.retentionDays }
  );
  renderRecent();

  renderList(settings.domains, "domains-empty", "domains", domain => {
    const item = document.createElement("li");
    const main = document.createElement("div");
    main.className = "management-copy";
    const title = document.createElement("strong");
    title.textContent = domain.domain;
    const detail = document.createElement("span");
    detail.textContent = `${domain.count} · ${formatDate(domain.lastVisited)}`;
    main.append(title, detail);
    const actions = document.createElement("div");
    actions.className = "management-actions";
    actions.append(
      makeButton(
        "nirva-read-search-exclude-site",
        "exclude-domain",
        domain.domain
      ),
      makeButton(
        "nirva-read-search-delete-site",
        "delete-domain",
        domain.domain
      )
    );
    item.append(main, actions);
    return item;
  });

  renderList(
    settings.excludedDomains,
    "excluded-domains-empty",
    "excluded-domains",
    domain => {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      title.textContent = domain;
      item.append(
        title,
        makeButton("nirva-read-search-allow-site", "allow-domain", domain)
      );
      return item;
    }
  );

  renderList(settings.pages, "pages-empty", "pages", page => {
    const item = document.createElement("li");
    const main = document.createElement("div");
    main.className = "management-copy";
    const title = document.createElement("strong");
    title.textContent = page.title;
    const detail = document.createElement("span");
    detail.textContent = `${page.domain} · ${formatDate(page.lastVisited)}`;
    main.append(title, detail);
    const actions = document.createElement("div");
    actions.className = "management-actions";
    actions.append(
      makeButton("nirva-read-search-exclude-page", "exclude-page", page.url),
      makeButton("nirva-read-search-forget-page", "delete-page", page.url)
    );
    item.append(main, actions);
    return item;
  });

  renderList(
    settings.excludedPages,
    "excluded-pages-empty",
    "excluded-pages",
    url => {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      title.textContent = url;
      item.append(
        title,
        makeButton("nirva-read-search-allow-page", "allow-page", url)
      );
      return item;
    }
  );
}

async function refreshSettings() {
  settings = await NirvaReadSearch.getSettings();
  renderSettings();
}

function openConfirm(titleId, copyId, actionId, action, args = {}) {
  pendingAction = action;
  document.l10n.setAttributes($("confirm-title"), titleId, args);
  document.l10n.setAttributes($("confirm-copy"), copyId, args);
  document.l10n.setAttributes($("confirm-action"), actionId, args);
  $("confirm-dialog").showModal();
}

async function perform(action) {
  try {
    await action();
    await refreshSettings();
    await runSearch();
    setStatus("nirva-read-search-status-updated");
  } catch (error) {
    setStatus("nirva-read-search-status-error", { reason: error.message });
  }
}

$("search-form").addEventListener("submit", event => {
  event.preventDefault();
  runSearch();
});
$("query").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 160);
});
$("filters").addEventListener("click", event => {
  const chip = event.target.closest("button[data-filter]");
  if (!chip) {
    return;
  }
  filters[chip.dataset.filter] = chip.dataset.value;
  for (const other of $("filters").querySelectorAll(
    `button[data-filter="${chip.dataset.filter}"]`
  )) {
    other.setAttribute("aria-pressed", String(other === chip));
  }
  renderResults(lastItems);
});
$("recent-list").addEventListener("click", event => {
  const row = event.target.closest(".recent-row");
  if (row) {
    openPage({ url: row.dataset.url });
  }
});
// Down from the search box goes into the results; up and down move between them,
// Enter opens one, and up from the first returns to the search box.
$("query").addEventListener("keydown", event => {
  if (event.key == "ArrowDown") {
    const first = $("results").querySelector(".result-card");
    if (first) {
      event.preventDefault();
      first.focus();
    }
  }
});
$("results").addEventListener("keydown", event => {
  const card = event.target.closest?.(".result-card");
  if (!card || event.target !== card) {
    return;
  }
  if (event.key == "Enter") {
    event.preventDefault();
    openPage(resultByURL.get(card.dataset.url));
  } else if (event.key == "ArrowDown" || event.key == "ArrowUp") {
    event.preventDefault();
    const next =
      event.key == "ArrowDown"
        ? card.nextElementSibling
        : card.previousElementSibling;
    (next ?? (event.key == "ArrowUp" ? $("query") : card)).focus();
  }
});
$("pause-toggle").addEventListener("click", async () => {
  const button = $("pause-toggle");
  button.disabled = true;
  try {
    await NirvaReadSearch.setPaused(!settings.paused);
    await refreshSettings();
    setStatus(
      settings.paused
        ? "nirva-read-search-status-paused"
        : "nirva-read-search-status-resumed"
    );
  } catch (error) {
    setStatus("nirva-read-search-status-error", { reason: error.message });
  } finally {
    button.disabled = false;
  }
});
$("retention").addEventListener("change", event =>
  perform(() => NirvaReadSearch.setRetentionDays(event.target.value))
);
$("delete-date").addEventListener("input", event => {
  $("delete-before").disabled = !event.target.value;
});
$("delete-before").addEventListener("click", () => {
  const date = $("delete-date").value;
  const before = new Date(`${date}T00:00:00`).getTime();
  if (!date || !Number.isFinite(before)) {
    return;
  }
  openConfirm(
    "nirva-read-search-confirm-date-title",
    "nirva-read-search-confirm-date-copy",
    "nirva-read-search-confirm-date-action",
    async () => {
      await NirvaReadSearch.deleteBefore(before);
      $("confirm-dialog").close();
      $("delete-date").value = "";
      $("delete-before").disabled = true;
    },
    { date: new Intl.DateTimeFormat().format(before) }
  );
});
$("exclude-domain-form").addEventListener("submit", event => {
  event.preventDefault();
  const domain = $("domain-input").value.trim();
  if (!domain) {
    return;
  }
  perform(async () => {
    await NirvaReadSearch.excludeDomain(domain);
    $("domain-input").value = "";
  });
});
$("results").addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    const card = event.target.closest(".result-card");
    // A click on the card opens it, unless the person was selecting text in it.
    if (card && !window.getSelection()?.toString()) {
      openPage(resultByURL.get(card.dataset.url));
    }
    return;
  }
  const page = resultByURL.get(button.dataset.value);
  const result = page || { url: button.dataset.value };
  if (button.dataset.action == "open-result") {
    NirvaReadSearch.openResult(browserWindow, result);
    return;
  }
  const actions = {
    "exclude-page": () => NirvaReadSearch.excludePage(button.dataset.value),
    "delete-page": () => NirvaReadSearch.deletePage(button.dataset.value),
  };
  perform(actions[button.dataset.action]);
});
document.querySelectorAll(".management-list").forEach(list => {
  list.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    const { action, value } = button.dataset;
    const actions = {
      "exclude-domain": () => NirvaReadSearch.excludeDomain(value),
      "delete-domain": () => NirvaReadSearch.deleteDomain(value),
      "allow-domain": () => NirvaReadSearch.allowDomain(value),
      "exclude-page": () => NirvaReadSearch.excludePage(value),
      "delete-page": () => NirvaReadSearch.deletePage(value),
      "allow-page": () => NirvaReadSearch.allowPage(value),
    };
    perform(actions[action]);
  });
});
$("clear-all").addEventListener("click", () =>
  openConfirm(
    "nirva-read-search-confirm-clear-title",
    "nirva-read-search-confirm-clear-copy",
    "nirva-read-search-confirm-clear-action",
    async () => {
      await NirvaReadSearch.clear();
      $("confirm-dialog").close();
    }
  )
);
$("confirm-action").addEventListener("click", async () => {
  const action = pendingAction;
  pendingAction = null;
  if (action) {
    await perform(action);
  }
  if ($("confirm-dialog").open) {
    $("confirm-dialog").close();
  }
});

const storeChanged = () => {
  refreshSettings().catch(error =>
    setStatus("nirva-read-search-status-error", { reason: error.message })
  );
};
Services.obs.addObserver(storeChanged, "nirva-read-search-changed");
window.addEventListener(
  "pagehide",
  () => {
    Services.obs.removeObserver(storeChanged, "nirva-read-search-changed");
    clearTimeout(searchTimer);
  },
  { once: true }
);

await document.l10n.ready;
refreshSettings()
  .then(runSearch)
  .catch(error =>
    setStatus("nirva-read-search-status-error", { reason: error.message })
  );
