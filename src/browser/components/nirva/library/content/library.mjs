/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { NirvaLibrary } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/library/NirvaLibrary.sys.mjs"
);
const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PrivateBrowsingUtils.sys.mjs"
);

const CHANGE_TOPIC = "nirva-library-changed";
const FOCUS_TOPIC = "nirva-library-focus";
const SEARCH_DELAY_MS = 150;
const $ = selector => document.querySelector(selector);
const browserWindow = window.browsingContext.topChromeWindow;
const list = $("#pages");
const pageTemplate = $("#page-template");
const highlightTemplate = $("#highlight-template");
let renderCount = 0;
let searchTimer = null;

function setStatus(id, args) {
  document.l10n.setAttributes($("#status"), id, args);
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatSize(bytes) {
  const megabytes = bytes / (1024 * 1024);
  const [unit, value, digits] =
    megabytes >= 0.1
      ? ["megabyte", megabytes, 1]
      : ["kilobyte", bytes ? Math.max(1, bytes / 1024) : 0, 0];
  return new Intl.NumberFormat(undefined, {
    style: "unit",
    unit,
    maximumFractionDigits: digits,
  }).format(value);
}

function sourceLabel(value) {
  const url = new URL(value);
  return `${url.hostname}${url.pathname == "/" ? "" : url.pathname}`;
}

function focusKey(element) {
  const field = ["page-tags", "page-note", "highlight-note"].find(className =>
    element?.classList?.contains(className)
  );
  if (!field) {
    return null;
  }
  return {
    field,
    pageId: element.closest(".page-card")?.dataset.pageId,
    annotationId: element.closest(".highlight")?.dataset.annotationId,
  };
}

function findField({ field, pageId, annotationId }) {
  for (const card of list.children) {
    if (card.dataset.pageId != pageId) {
      continue;
    }
    if (!annotationId) {
      return card.querySelector(`.${field}`);
    }
    for (const item of card.querySelectorAll(".highlight")) {
      if (item.dataset.annotationId == annotationId) {
        return item.querySelector(`.${field}`);
      }
    }
  }
  return null;
}

async function confirmed(id, args) {
  return window.confirm(await document.l10n.formatValue(id, args));
}

function makeHighlight(page, annotation) {
  const node = highlightTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.annotationId = annotation.id;
  node.querySelector(".highlight-quote").textContent = annotation.quote;
  const note = node.querySelector(".highlight-note");
  note.value = annotation.note;
  note.addEventListener("change", async () => {
    await NirvaLibrary.setAnnotationNote(page.id, annotation.id, note.value);
    setStatus("nirva-library-status-note-saved");
  });
  node
    .querySelector(".remove-highlight")
    .addEventListener("click", async () => {
      await NirvaLibrary.removeAnnotation(page.id, annotation.id);
      setStatus("nirva-library-status-highlight-removed");
    });
  return node;
}

function makeCard(page) {
  const node = pageTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.pageId = page.id;
  node.querySelector(".page-title").textContent = page.title;
  node.querySelector(".page-source").textContent = sourceLabel(page.url);
  const copyState = node.querySelector(".page-copy-state");
  if (page.copy) {
    document.l10n.setAttributes(copyState, "nirva-library-copy-saved", {
      date: formatDate(page.copy.savedAt),
      size: formatSize(page.copy.bytes),
    });
    if (page.copy.skipped) {
      const partial = node.querySelector(".page-copy-partial");
      document.l10n.setAttributes(partial, "nirva-library-copy-partial", {
        skipped: page.copy.skipped,
      });
      partial.hidden = false;
    }
  } else {
    document.l10n.setAttributes(copyState, "nirva-library-no-copy");
  }

  const tags = node.querySelector(".page-tags");
  tags.value = page.tags.join(", ");
  tags.addEventListener("change", async () => {
    await NirvaLibrary.updatePage(page.id, { tags: tags.value });
    setStatus("nirva-library-status-tags-saved");
  });
  const note = node.querySelector(".page-note");
  note.value = page.note;
  note.addEventListener("change", async () => {
    await NirvaLibrary.updatePage(page.id, { note: note.value });
    setStatus("nirva-library-status-note-saved");
  });

  if (page.annotations.length) {
    const section = node.querySelector(".highlights");
    section.hidden = false;
    document.l10n.setAttributes(
      section.querySelector(".highlights-heading"),
      "nirva-library-highlights-heading",
      { count: page.annotations.length }
    );
    section
      .querySelector(".highlight-list")
      .replaceChildren(
        ...page.annotations.map(annotation => makeHighlight(page, annotation))
      );
  }

  const openCopy = node.querySelector(".open-copy");
  const openLive = node.querySelector(".open-live");
  const exportCopy = node.querySelector(".export-copy");
  const removeCopy = node.querySelector(".remove-copy");
  for (const button of [openCopy, exportCopy, removeCopy]) {
    button.hidden = !page.copy;
  }
  // One accent action per card: the saved copy when there is one, the live page otherwise.
  openLive.classList.toggle("primary-button", !page.copy);
  openLive.classList.toggle("quiet-button", Boolean(page.copy));
  openCopy.addEventListener("click", () =>
    NirvaLibrary.openCopy(browserWindow, page.id)
  );
  openLive.addEventListener("click", () =>
    NirvaLibrary.openSource(browserWindow, page.url)
  );
  exportCopy.addEventListener("click", async () => {
    try {
      if (await NirvaLibrary.exportCopyWithPicker(browserWindow, page.id)) {
        setStatus("nirva-library-status-copy-exported");
      }
    } catch (error) {
      console.error(error);
      setStatus("nirva-library-status-export-failed");
    }
  });
  removeCopy.addEventListener("click", async () => {
    if (
      await confirmed("nirva-library-remove-copy-confirm", {
        title: page.title,
      })
    ) {
      await NirvaLibrary.deleteCopy(page.id);
      setStatus("nirva-library-status-copy-removed");
    }
  });
  node.querySelector(".delete-page").addEventListener("click", async () => {
    if (
      await confirmed("nirva-library-delete-page-confirm", {
        title: page.title,
      })
    ) {
      await NirvaLibrary.deletePage(page.id);
      setStatus("nirva-library-status-deleted", { title: page.title });
    }
  });
  return node;
}

function renderTagFilter(pages) {
  const select = $("#tag-filter");
  const chosen = select.value;
  const tags = [...new Set(pages.flatMap(page => page.tags))].sort((a, b) =>
    a.localeCompare(b)
  );
  const all = document.createElement("option");
  all.value = "";
  document.l10n.setAttributes(all, "nirva-library-tag-all");
  select.replaceChildren(
    all,
    ...tags.map(tag => {
      const option = document.createElement("option");
      option.value = tag;
      option.textContent = tag;
      return option;
    })
  );
  select.value = tags.includes(chosen) ? chosen : "";
  select.disabled = !tags.length;
  return select.value;
}

async function render() {
  const current = ++renderCount;
  const query = $("#search").value.trim();
  const all = await NirvaLibrary.search("");
  const matching = query ? await NirvaLibrary.search(query) : all;
  if (current != renderCount) {
    return;
  }
  const tag = renderTagFilter(all);
  const shown = tag
    ? matching.filter(page => page.tags.includes(tag))
    : matching;

  const focused = focusKey(document.activeElement);
  const draft = focused && document.activeElement.value;
  list.replaceChildren(...shown.map(makeCard));
  const restored = focused && findField(focused);
  if (restored) {
    restored.value = draft;
    restored.focus();
  }

  const copies = all.filter(page => page.copy);
  document.l10n.setAttributes($("#usage"), "nirva-library-usage", {
    pages: all.length,
    copies: copies.length,
    size: formatSize(copies.reduce((sum, page) => sum + page.copy.bytes, 0)),
  });
  document.l10n.setAttributes($("#page-count"), "nirva-library-count", {
    count: shown.length,
  });
  $("#empty-state").hidden = !!all.length;
  $("#no-results").hidden = !all.length || !!shown.length;
  $("#export-all").disabled = !all.length;
  $("#delete-all").disabled = !all.length;
  $("#search").disabled = !all.length && !query;
  showRequestedEntry();
}

function showRequestedEntry() {
  const requested = NirvaLibrary.takePendingFocus();
  if (!requested) {
    return;
  }
  const field = findField({
    field: requested.annotationId ? "highlight-note" : "page-note",
    pageId: requested.pageId,
    annotationId: requested.annotationId,
  });
  if (field) {
    field.closest(".page-card").scrollIntoView({ block: "nearest" });
    field.focus();
  }
}

async function requestedEntryChanged() {
  if ($("#search").value || $("#tag-filter").value) {
    $("#search").value = "";
    $("#tag-filter").value = "";
  }
  await render();
}

$("#search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, SEARCH_DELAY_MS);
});
$("#tag-filter").addEventListener("change", render);
$("#export-all").addEventListener("click", async () => {
  try {
    const result = await NirvaLibrary.exportAllWithPicker(browserWindow);
    if (result) {
      setStatus("nirva-library-status-exported", { copies: result.copies });
    }
  } catch (error) {
    console.error(error);
    setStatus("nirva-library-status-export-failed");
  }
});
$("#delete-all").addEventListener("click", async () => {
  if (await confirmed("nirva-library-delete-all-confirm")) {
    await NirvaLibrary.clear();
    setStatus("nirva-library-status-cleared");
  }
});

if (PrivateBrowsingUtils.isContentWindowPrivate(window)) {
  document.body.dataset.private = "true";
  $("#private-notice").hidden = false;
  $(".page").hidden = true;
} else {
  Services.obs.addObserver(render, CHANGE_TOPIC);
  Services.obs.addObserver(requestedEntryChanged, FOCUS_TOPIC);
  window.addEventListener(
    "unload",
    () => {
      Services.obs.removeObserver(render, CHANGE_TOPIC);
      Services.obs.removeObserver(requestedEntryChanged, FOCUS_TOPIC);
    },
    { once: true }
  );
  await render();
}
