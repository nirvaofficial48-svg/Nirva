/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { NirvaRemix } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/remix/NirvaRemix.sys.mjs"
);
const { NirvaRemixStore, REMIX_OPTIONS, remixKey } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/remix/NirvaRemixStore.sys.mjs"
);
const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

const CHANGE_TOPIC = "nirva-remix-changed";
const FOCUS_TOPIC = "nirva-remix-focus";
const $ = selector => document.querySelector(selector);
const list = $("#remixes");
const template = $("#remix-template");
// The page the user asked to remix; its card comes first, as a draft if nothing is saved yet.
let focusURL = NirvaRemix.takePendingURL();

function setStatus(id, args) {
  document.l10n.setAttributes($("#status"), id, args);
}

function fillOptions(select, values, l10nId, defaultId) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = String(value);
    if (value == values[0]) {
      document.l10n.setAttributes(option, defaultId);
    } else {
      document.l10n.setAttributes(option, l10nId, { value });
    }
    select.append(option);
  }
}

function makeCard(remix, draftURL = null) {
  const node = template.content.firstElementChild.cloneNode(true);
  const draft = !remix;
  const scopeSelect = node.querySelector(".remix-scope");
  node.dataset.remixId = remix?.id || "draft";
  node.querySelector(".page-title").textContent = draft
    ? remixKey(draftURL, "site")
    : remix.key.replace(/^https?:\/\//, "");
  let sourceId = "nirva-remix-draft";
  if (!draft) {
    sourceId =
      remix.scope == "page" ? "nirva-remix-for-page" : "nirva-remix-for-site";
  }
  document.l10n.setAttributes(node.querySelector(".page-source"), sourceId);

  const fields = {
    fontFamily: node.querySelector(".remix-font"),
    textScale: node.querySelector(".remix-size"),
    lineHeight: node.querySelector(".remix-spacing"),
  };
  fillOptions(
    fields.textScale,
    REMIX_OPTIONS.textScale,
    "nirva-remix-size-option",
    "nirva-remix-size-site"
  );
  fillOptions(
    fields.lineHeight,
    REMIX_OPTIONS.lineHeight,
    "nirva-remix-spacing-option",
    "nirva-remix-spacing-site"
  );
  const target = async () =>
    remix || NirvaRemix.ensureFor(draftURL, scopeSelect.value);
  for (const [field, select] of Object.entries(fields)) {
    select.value = String(remix ? remix[field] : REMIX_OPTIONS[field][0]);
    select.addEventListener("change", async () => {
      const value = field == "fontFamily" ? select.value : Number(select.value);
      try {
        await NirvaRemix.update((await target()).id, { [field]: value });
        setStatus("nirva-remix-saved");
      } catch (_error) {
        setStatus("nirva-remix-save-error");
      }
    });
  }

  const enabled = node.querySelector(".remix-enabled");
  const openSite = node.querySelector(".open-site");
  const reset = node.querySelector(".reset-remix");
  const hiddenBox = node.querySelector(".remix-hidden");
  if (draft) {
    node.querySelector(".scope-field").hidden = false;
    node.querySelector(".page-actions").hidden = true;
    hiddenBox.hidden = true;
    return node;
  }
  enabled.checked = remix.enabled;
  enabled.addEventListener("change", async () => {
    await NirvaRemix.setEnabled(remix.id, enabled.checked);
    setStatus(
      enabled.checked ? "nirva-remix-turned-on" : "nirva-remix-turned-off"
    );
  });
  openSite.addEventListener("click", () =>
    NirvaRemix.openSite(window.browsingContext.topChromeWindow, remix)
  );
  reset.addEventListener("click", async () => {
    await NirvaRemix.reset(remix.id);
    setStatus("nirva-remix-reset-done", { site: remix.key });
  });
  document.l10n.setAttributes(
    node.querySelector(".remix-hidden-heading"),
    "nirva-remix-hidden-heading",
    { count: remix.hidden.length }
  );
  node.querySelector(".remix-hidden-empty").hidden = !!remix.hidden.length;
  const hiddenList = node.querySelector(".remix-hidden-list");
  for (const entry of remix.hidden) {
    const row = document.createElement("li");
    row.className = "remix-hidden-row";
    const text = document.createElement("p");
    text.className = "remix-hidden-label";
    text.textContent = entry.label;
    const show = document.createElement("button");
    show.type = "button";
    show.className = "show-again quiet-button";
    document.l10n.setAttributes(show, "nirva-remix-show-again");
    show.addEventListener("click", async () => {
      await NirvaRemix.removeHidden(remix.id, entry.id);
      setStatus("nirva-remix-shown-again");
    });
    row.append(text, show);
    hiddenList.append(row);
  }
  return node;
}

async function render() {
  const active = document.activeElement;
  const focusKey = active?.closest?.(".page-card")
    ? [active.closest(".page-card").dataset.remixId, active.className]
    : null;
  const remixes = await NirvaRemixStore.list();
  const cards = [];
  if (focusURL) {
    const current = await NirvaRemixStore.lookup(focusURL);
    if (current) {
      remixes.sort((a, b) => (b.id == current.id) - (a.id == current.id));
    } else if (remixKey(focusURL, "site")) {
      cards.push(makeCard(null, focusURL));
    }
  }
  cards.push(...remixes.map(remix => makeCard(remix)));
  list.replaceChildren(...cards);
  $("#empty-state").hidden = !!cards.length;
  $("#reset-all").disabled = !remixes.length;
  document.l10n.setAttributes($("#remix-count"), "nirva-remix-count", {
    count: remixes.length,
  });
  if (focusKey) {
    const card = [...list.children].find(
      item => item.dataset.remixId == focusKey[0]
    );
    (card || list.firstElementChild)
      ?.querySelector(`.${focusKey[1].split(" ")[0]}`)
      ?.focus();
  }
}

function focusRequested() {
  focusURL = NirvaRemix.takePendingURL() || focusURL;
  render();
}

$("#reset-all").addEventListener("click", async () => {
  if (
    !window.confirm(
      await document.l10n.formatValue("nirva-remix-reset-all-confirm")
    )
  ) {
    return;
  }
  await NirvaRemix.resetAll();
  setStatus("nirva-remix-reset-all-done");
});

if (lazy.PrivateBrowsingUtils.isContentWindowPrivate(window)) {
  $("#private-notice").hidden = false;
  $(".page").hidden = true;
} else {
  Services.obs.addObserver(render, CHANGE_TOPIC);
  Services.obs.addObserver(focusRequested, FOCUS_TOPIC);
  window.addEventListener(
    "unload",
    () => {
      Services.obs.removeObserver(render, CHANGE_TOPIC);
      Services.obs.removeObserver(focusRequested, FOCUS_TOPIC);
    },
    { once: true }
  );
  await render();
}
