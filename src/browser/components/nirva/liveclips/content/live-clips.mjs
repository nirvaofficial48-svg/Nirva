/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { NirvaClips } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/liveclips/NirvaClips.sys.mjs"
);
const { NirvaClipsStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/liveclips/NirvaClipsStore.sys.mjs"
);

const CHANGE_TOPIC = "nirva-live-clips-changed";
const $ = selector => document.querySelector(selector);
const list = $("#clips");
const template = $("#clip-template");

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

function setStatus(id, args) {
  document.l10n.setAttributes($("#status"), id, args);
}

const browserWindow =
  window.docShell?.chromeEventHandler?.documentGlobal ?? null;
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/**
 * "just now", "5 minutes ago", "yesterday": how long ago, in words.
 *
 * @param {number} timestamp
 */
function formatAgo(timestamp) {
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const steps = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [Infinity, "week"],
  ];
  let value = seconds;
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) {
      return relative.format(unit == "second" ? 0 : value, unit);
    }
    value = Math.round(value / size);
  }
  return formatDate(timestamp);
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function makeCard(clip, globalPaused) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.clipId = clip.id;
  node.querySelector(".clip-title").textContent = clip.title;
  node.querySelector(".clip-source").textContent = clip.sourceTitle;
  node.querySelector(".clip-text").textContent = clip.text;
  const updated = node.querySelector(".clip-updated");
  document.l10n.setAttributes(updated, "nirva-live-clips-updated", {
    date: formatAgo(clip.updatedAt),
  });
  updated.title = formatDate(clip.updatedAt);
  // What changed at the last refresh: a mark to dismiss, and the earlier text.
  const change = NirvaClips.changeFor(clip.id);
  if (change) {
    node.classList.add("clip-card-changed");
    const mark = node.querySelector(".clip-changed");
    mark.hidden = false;
    mark.addEventListener("click", () => NirvaClips.markSeen(clip.id));
    const previous = node.querySelector(".clip-previous");
    previous.hidden = false;
    previous.querySelector(".clip-previous-text").textContent = change.previous;
  }
  const error = node.querySelector(".clip-error");
  if (clip.error) {
    document.l10n.setAttributes(error, `nirva-live-clips-error-${clip.error}`);
    error.hidden = false;
  }
  const schedule = node.querySelector(".clip-schedule");
  schedule.value = String(clip.refreshHours);
  schedule.addEventListener("change", async () => {
    await NirvaClipsStore.update(clip.id, {
      refreshHours: Number(schedule.value),
    });
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
  });
  const scheduleState = node.querySelector(".clip-schedule-state");
  if (clip.refreshHours && (clip.paused || globalPaused)) {
    document.l10n.setAttributes(
      scheduleState,
      clip.paused
        ? "nirva-live-clips-schedule-paused"
        : "nirva-live-clips-schedule-paused-all"
    );
  } else if (clip.refreshHours) {
    document.l10n.setAttributes(
      scheduleState,
      "nirva-live-clips-next-refresh",
      {
        date: formatDate(
          clip.nextRefreshAt || clip.updatedAt + clip.refreshHours * 3600000
        ),
      }
    );
  } else {
    document.l10n.setAttributes(
      scheduleState,
      "nirva-live-clips-schedule-manual"
    );
  }

  node.querySelector(".refresh-clip").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    setStatus("nirva-live-clips-refreshing", { title: clip.title });
    await NirvaClips.refreshClip(clip.id, true);
    await render();
  });
  const pauseButton = node.querySelector(".pause-clip");
  document.l10n.setAttributes(
    pauseButton,
    clip.paused ? "nirva-live-clips-resume-clip" : "nirva-live-clips-pause-clip"
  );
  pauseButton.addEventListener("click", async () => {
    await NirvaClipsStore.update(clip.id, { paused: !clip.paused });
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
  });
  const editor = node.querySelector(".clip-editor");
  const editButton = node.querySelector(".edit-clip");
  editButton.addEventListener("click", () => {
    editor.hidden = !editor.hidden;
    if (!editor.hidden) {
      node.querySelector(".edit-title").value = clip.title;
      node.querySelector(".edit-selector").value = clip.selector;
      node.querySelector(".edit-title").focus();
    }
  });
  node.querySelector(".cancel-edit").addEventListener("click", () => {
    editor.hidden = true;
  });
  editor.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await NirvaClipsStore.update(clip.id, {
        title: node.querySelector(".edit-title").value,
        selector: node.querySelector(".edit-selector").value,
      });
      setStatus("nirva-live-clips-edit-saved");
      Services.obs.notifyObservers(null, CHANGE_TOPIC);
    } catch (_error) {
      setStatus("nirva-live-clips-edit-error");
    }
  });
  node
    .querySelector(".open-source")
    .addEventListener("click", () => NirvaClips.openSource(window, clip.url));
  node.querySelector(".remove-clip").addEventListener("click", async () => {
    if (
      !window.confirm(
        await document.l10n.formatValue("nirva-live-clips-remove-confirm", {
          title: clip.title,
        })
      )
    ) {
      return;
    }
    await NirvaClipsStore.remove(clip.id);
    setStatus("nirva-live-clips-removed", { title: clip.title });
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
  });
  return node;
}

async function render() {
  const [clips, globalPaused] = await Promise.all([
    NirvaClipsStore.list(),
    NirvaClipsStore.getPaused(),
  ]);
  list.replaceChildren(...clips.map(clip => makeCard(clip, globalPaused)));
  $("#empty-state").hidden = !!clips.length;
  document.l10n.setAttributes($("#clip-count"), "nirva-live-clips-count", {
    count: clips.length,
  });
  document.l10n.setAttributes(
    $("#pause-all"),
    globalPaused ? "nirva-live-clips-resume-all" : "nirva-live-clips-pause-all"
  );
  $("#pause-all").disabled = clips.every(clip => !clip.refreshHours);
  $("#refresh-all").disabled = !clips.length;
}

function closeNewMenu() {
  $("#new-clip-menu").hidden = true;
  $("#new-clip").setAttribute("aria-expanded", "false");
}

$("#new-clip").addEventListener("click", () => {
  const menu = $("#new-clip-menu");
  if (!menu.hidden) {
    closeNewMenu();
    return;
  }
  const tabs = NirvaClips.capturableTabs(browserWindow);
  const rows = tabs.map(tab => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "new-clip-tab";
    const icon = document.createElement("img");
    icon.alt = "";
    icon.src =
      tab.getAttribute("image") ||
      "chrome://global/skin/icons/defaultFavicon.svg";
    const label = document.createElement("span");
    label.textContent = tab.label;
    button.append(icon, label);
    button.addEventListener("click", () => {
      closeNewMenu();
      NirvaClips.captureFromTab(browserWindow, tab);
    });
    item.append(button);
    return item;
  });
  $("#new-clip-tabs").replaceChildren(...rows);
  $("#new-clip-none").hidden = Boolean(rows.length);
  menu.hidden = false;
  $("#new-clip").setAttribute("aria-expanded", "true");
  menu.querySelector("button")?.focus();
});
document.addEventListener("mousedown", event => {
  if (!event.target.closest(".new-clip")) {
    closeNewMenu();
  }
});
document.addEventListener("keydown", event => {
  if (event.key == "Escape" && !$("#new-clip-menu").hidden) {
    closeNewMenu();
    $("#new-clip").focus();
  }
});

$("#refresh-all").addEventListener("click", async () => {
  const button = $("#refresh-all");
  button.disabled = true;
  setStatus("nirva-live-clips-refreshing-all");
  try {
    const changed = await NirvaClips.refreshAll();
    setStatus("nirva-live-clips-refreshed-all", { changed });
  } finally {
    await render();
  }
});

$("#pause-all").addEventListener("click", async () => {
  await NirvaClipsStore.setPaused(!(await NirvaClipsStore.getPaused()));
  setStatus(
    (await NirvaClipsStore.getPaused())
      ? "nirva-live-clips-all-paused"
      : "nirva-live-clips-all-resumed"
  );
  Services.obs.notifyObservers(null, CHANGE_TOPIC);
});

if (lazy.PrivateBrowsingUtils.isContentWindowPrivate(window)) {
  document.body.dataset.private = "true";
  $("#private-notice").hidden = false;
  $(".page").hidden = true;
} else {
  Services.obs.addObserver(render, CHANGE_TOPIC);
  window.addEventListener(
    "unload",
    () => Services.obs.removeObserver(render, CHANGE_TOPIC),
    { once: true }
  );
  await render();
}
