/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { NirvaTimeTravel } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/timetravel/NirvaTimeTravel.sys.mjs"
);

const $ = id => document.getElementById(id);
const snapshotList = $("snapshot-list");
const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
let snapshots = [];
let selectedSnapshotId = null;
let selectedPreview = null;
let timeline = null;
let pendingAction = null;
let previewRequest = 0;
let selectedDay = null;
let findQuery = "";
let findTimer = 0;
let findRequest = 0;
const dayLabelFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function dayKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function setStatus(id, args = {}) {
  document.l10n.setAttributes($("status"), id, args);
}

function formatSnapshotCount(snapshot) {
  return document.l10n.formatValue("nirva-time-travel-window-count", {
    count: snapshot.windowCount,
  });
}

function formatTabCount(snapshot) {
  return document.l10n.formatValue("nirva-time-travel-tab-count", {
    count: snapshot.tabCount,
  });
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  if (bytes > 0 && mb < 0.1) {
    return "<0.1 MB";
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(mb)} MB`;
}

function updateStorageMeter(data) {
  const limitBytes = data.storageLimitMB * 1024 * 1024;
  $("storage-value").textContent =
    `${formatSize(data.storageBytes)} / ${data.storageLimitMB} MB`;
  $("storage-progress").max = limitBytes;
  $("storage-progress").value = Math.min(limitBytes, data.storageBytes);
  $("retention").value = String(data.retentionDays);
  $("storage-limit").value = String(data.storageLimitMB);
  document.l10n.setAttributes(
    $("recording-toggle"),
    data.enabled ? "nirva-time-travel-pause" : "nirva-time-travel-resume"
  );
  document.l10n.setAttributes(
    $("settings-summary"),
    data.enabled
      ? "nirva-time-travel-settings-summary"
      : "nirva-time-travel-settings-summary-paused",
    {
      days: data.retentionDays,
      used: formatSize(data.storageBytes),
      limit: `${data.storageLimitMB} MB`,
    }
  );
}

/**
 * "Today", "Yesterday", or a short date, for a day button.
 *
 * @param {number} timestamp
 */
function dayName(timestamp) {
  const today = new Date();
  const key = dayKey(timestamp);
  if (key == dayKey(today)) {
    return document.l10n.formatValue("nirva-time-travel-today");
  }
  today.setDate(today.getDate() - 1);
  if (key == dayKey(today)) {
    return document.l10n.formatValue("nirva-time-travel-yesterday");
  }
  return Promise.resolve(dayLabelFormat.format(timestamp));
}

async function renderDayStrip(days) {
  const strip = $("day-strip");
  const buttons = [];
  for (const [key, records] of [...days].reverse()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-chip";
    button.dataset.day = key;
    button.setAttribute(
      "aria-pressed",
      String(!findQuery && key == selectedDay)
    );
    const dayLabel = document.createElement("span");
    dayLabel.textContent = await dayName(records.at(-1).createdAt);
    const count = document.createElement("span");
    count.className = "day-count";
    count.textContent = String(records.length);
    button.append(dayLabel, count);
    buttons.push(button);
  }
  strip.replaceChildren(...buttons);
}

async function updateTimeline() {
  timeline = await NirvaTimeTravel.getTimeline();
  snapshots = timeline.snapshots.sort((a, b) => a.createdAt - b.createdAt);
  updateStorageMeter(timeline);

  const groupedDays = new Map();
  for (const snapshot of snapshots) {
    const key = dayKey(snapshot.createdAt);
    if (!groupedDays.has(key)) {
      groupedDays.set(key, []);
    }
    groupedDays.get(key).push(snapshot);
  }

  const days = [...groupedDays.entries()];
  if (!groupedDays.has(selectedDay)) {
    selectedDay = days.at(-1)?.[0] ?? null;
  }
  await renderDayStrip(days);

  const stillAvailable = snapshots.some(
    snapshot => snapshot.id == selectedSnapshotId
  );
  if (!stillAvailable) {
    selectedSnapshotId = null;
  }
  if (!selectedSnapshotId && snapshots.length) {
    selectedSnapshotId = snapshots.at(-1).id;
  }
  if (findQuery) {
    await renderFind();
  } else {
    await renderDay();
  }
  if (selectedSnapshotId) {
    await renderPreview(selectedSnapshotId);
  } else {
    clearPreview();
  }
}

async function snapshotRow(snapshot, { withDay = false, site = "" } = {}) {
  const [reason, windows, tabs] = await Promise.all([
    document.l10n.formatValue(`nirva-time-travel-reason-${snapshot.reason}`),
    formatSnapshotCount(snapshot),
    formatTabCount(snapshot),
  ]);
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.className = "snapshot-row";
  button.type = "button";
  button.dataset.id = snapshot.id;
  button.setAttribute(
    "aria-current",
    String(snapshot.id == selectedSnapshotId)
  );

  const time = document.createElement("span");
  time.className = "snapshot-time";
  time.textContent = timeFormat.format(snapshot.createdAt);
  if (withDay) {
    const day = document.createElement("span");
    day.className = "snapshot-day";
    day.textContent = await dayName(snapshot.createdAt);
    time.append(day);
  }
  const copy = document.createElement("span");
  copy.className = "snapshot-copy";
  const reasonLine = document.createElement("span");
  reasonLine.className = "snapshot-reason";
  reasonLine.textContent = reason;
  const countLine = document.createElement("span");
  countLine.className = "snapshot-counts";
  countLine.textContent = `${windows} · ${tabs}`;
  copy.append(reasonLine, countLine);
  if (site) {
    const match = document.createElement("span");
    match.className = "snapshot-match";
    document.l10n.setAttributes(match, "nirva-time-travel-find-match", {
      site,
    });
    copy.append(match);
  }
  button.append(time, copy);
  item.append(button);
  return item;
}

async function renderDay() {
  const daySnapshots = snapshots
    .filter(snapshot => dayKey(snapshot.createdAt) == selectedDay)
    .reverse();
  $("empty-state").hidden = Boolean(daySnapshots.length);
  document.l10n.setAttributes(
    $("empty-state"),
    snapshots.length
      ? "nirva-time-travel-empty"
      : "nirva-time-travel-no-history"
  );
  document.l10n.setAttributes($("list-count"), "nirva-time-travel-list-count", {
    count: daySnapshots.length,
  });
  const rows = [];
  for (const snapshot of daySnapshots) {
    rows.push(await snapshotRow(snapshot));
  }
  snapshotList.replaceChildren(...rows);
}

/** The states that had a page open on a site matching the search, across all days. */
async function renderFind() {
  const request = ++findRequest;
  const found = await NirvaTimeTravel.findSnapshots(findQuery);
  if (request != findRequest) {
    return;
  }
  const byId = new Map(snapshots.map(snapshot => [snapshot.id, snapshot]));
  const rows = [];
  for (const { id, site } of found) {
    if (byId.has(id)) {
      rows.push(await snapshotRow(byId.get(id), { withDay: true, site }));
    }
  }
  if (request != findRequest) {
    return;
  }
  snapshotList.replaceChildren(...rows);
  $("empty-state").hidden = Boolean(rows.length);
  document.l10n.setAttributes($("empty-state"), "nirva-time-travel-find-none", {
    query: findQuery,
  });
  document.l10n.setAttributes($("list-count"), "nirva-time-travel-list-count", {
    count: rows.length,
  });
  for (const chip of $("day-strip").children) {
    chip.setAttribute("aria-pressed", "false");
  }
  if (rows.length && !found.some(item => item.id == selectedSnapshotId)) {
    await renderPreview(found[0].id);
  }
}

function clearPreview() {
  previewRequest++;
  selectedPreview = null;
  $("preview-date").textContent = "";
  $("preview-counts").replaceChildren();
  $("preview-windows").replaceChildren();
  const placeholder = document.createElement("p");
  placeholder.className = "preview-placeholder";
  document.l10n.setAttributes(placeholder, "nirva-time-travel-pick-snapshot");
  $("preview-windows").append(placeholder);
  $("restore-snapshot").disabled = true;
  $("delete-snapshot").disabled = true;
}

function currentEntry(tab) {
  const index = Math.min(
    Math.max((tab.index || tab.entries.length) - 1, 0),
    tab.entries.length - 1
  );
  return tab.entries[index];
}

function displayAddress(value) {
  if (value.startsWith("about:")) {
    return value;
  }
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname == "/" ? "" : url.pathname}`;
  } catch (_error) {
    return value;
  }
}

async function renderPreview(id) {
  const request = ++previewRequest;
  const result = await NirvaTimeTravel.preview(id);
  if (request != previewRequest) {
    return;
  }
  selectedSnapshotId = id;
  selectedPreview = result;
  const { snapshot, state, workspaceList } = result;
  $("preview-date").textContent =
    `${dateFormat.format(snapshot.createdAt)} · ${timeFormat.format(snapshot.createdAt)}`;
  const [windowCount, tabCount] = await Promise.all([
    formatSnapshotCount(snapshot),
    formatTabCount(snapshot),
  ]);
  const windowStat = document.createElement("span");
  windowStat.textContent = windowCount;
  const tabStat = document.createElement("span");
  tabStat.textContent = tabCount;
  $("preview-counts").replaceChildren(windowStat, tabStat);
  const workspaceNames = new Map(
    workspaceList.map(item => [item.id, item.name])
  );
  const previews = [];

  for (let index = 0; index < state.windows.length; index++) {
    const windowState = state.windows[index];
    const card = document.createElement("article");
    card.className = "window-preview";
    const heading = document.createElement("h3");
    document.l10n.setAttributes(heading, "nirva-time-travel-window", {
      index: index + 1,
    });
    card.append(heading);

    const groups = new Map();
    for (const [tabIndex, tab] of windowState.tabs.entries()) {
      const workspaceId = tab.extData?.["nirva-workspace"];
      const workspaceName = workspaceNames.get(workspaceId) || "";
      const label =
        workspaceName ||
        (await document.l10n.formatValue("nirva-time-travel-no-workspace"));
      if (request != previewRequest) {
        return;
      }
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label).push({ tab, tabIndex });
    }

    if (!windowState.tabs.length) {
      const empty = document.createElement("p");
      document.l10n.setAttributes(empty, "nirva-time-travel-no-tabs");
      card.append(empty);
    }
    for (const [workspace, tabs] of groups) {
      const workspaceHeading = document.createElement("p");
      workspaceHeading.className = "workspace-heading";
      workspaceHeading.textContent = workspace;
      const list = document.createElement("ul");
      list.className = "tab-preview-list";
      for (const { tab, tabIndex } of tabs) {
        const entry = currentEntry(tab);
        if (!entry) {
          continue;
        }
        const row = document.createElement("li");
        const details = document.createElement("div");
        details.className = "tab-preview-copy";
        const title = document.createElement("span");
        title.className = "site-name";
        title.textContent = entry.title;
        const address = document.createElement("span");
        address.className = "site-address";
        address.textContent = displayAddress(entry.url);
        details.append(title, address);
        const restoreTab = document.createElement("button");
        restoreTab.className = "restore-tab-button";
        restoreTab.type = "button";
        restoreTab.dataset.windowIndex = String(index);
        restoreTab.dataset.tabIndex = String(tabIndex);
        document.l10n.setAttributes(
          restoreTab,
          "nirva-time-travel-restore-tab"
        );
        row.append(details, restoreTab);
        list.append(row);
      }
      card.append(workspaceHeading, list);
    }
    previews.push(card);
  }
  if (request != previewRequest) {
    return;
  }
  $("preview-windows").replaceChildren(...previews);
  $("restore-snapshot").disabled = false;
  $("delete-snapshot").disabled = false;
  for (const button of snapshotList.querySelectorAll(".snapshot-row")) {
    button.setAttribute("aria-current", String(button.dataset.id == id));
  }
}

function openConfirm(action) {
  pendingAction = typeof action == "string" ? { type: action } : action;
  const title = $("confirm-title");
  const copy = $("confirm-copy");
  const button = $("confirm-action");
  if (pendingAction.type == "restore") {
    document.l10n.setAttributes(
      title,
      "nirva-time-travel-confirm-restore-title"
    );
    document.l10n.setAttributes(copy, "nirva-time-travel-confirm-restore");
    document.l10n.setAttributes(
      button,
      "nirva-time-travel-confirm-restore-action"
    );
  } else if (pendingAction.type == "restore-tab") {
    document.l10n.setAttributes(
      title,
      "nirva-time-travel-confirm-restore-tab-title"
    );
    document.l10n.setAttributes(copy, "nirva-time-travel-confirm-restore-tab");
    document.l10n.setAttributes(
      button,
      "nirva-time-travel-confirm-restore-tab-action"
    );
  } else {
    document.l10n.setAttributes(title, "nirva-time-travel-confirm-clear-title");
    document.l10n.setAttributes(copy, "nirva-time-travel-confirm-clear");
    document.l10n.setAttributes(
      button,
      "nirva-time-travel-confirm-clear-action"
    );
  }
  $("confirm-dialog").showModal();
}

async function confirmAction() {
  $("confirm-action").disabled = true;
  try {
    if (pendingAction?.type == "restore" && selectedPreview) {
      await NirvaTimeTravel.restoreSnapshot(selectedPreview.snapshot.id);
      $("confirm-dialog").close();
      setStatus("nirva-time-travel-status-restored");
    } else if (pendingAction?.type == "restore-tab" && selectedPreview) {
      await NirvaTimeTravel.restoreTab(
        selectedPreview.snapshot.id,
        pendingAction.windowIndex,
        pendingAction.tabIndex
      );
      $("confirm-dialog").close();
      setStatus("nirva-time-travel-status-tab-restored");
    } else if (pendingAction?.type == "clear") {
      await NirvaTimeTravel.clearSnapshots();
      $("confirm-dialog").close();
      selectedSnapshotId = null;
      clearPreview();
      setStatus("nirva-time-travel-status-cleared");
    }
    await updateTimeline();
  } catch (error) {
    $("confirm-dialog").close();
    setStatus("nirva-time-travel-status-error", {
      reason: error.message,
    });
  } finally {
    $("confirm-action").disabled = false;
    pendingAction = null;
  }
}

$("day-strip").addEventListener("click", async event => {
  const chip = event.target.closest("button[data-day]");
  if (!chip) {
    return;
  }
  selectedDay = chip.dataset.day;
  if (findQuery) {
    findQuery = "";
    $("find").value = "";
  }
  for (const other of $("day-strip").children) {
    other.setAttribute("aria-pressed", String(other === chip));
  }
  await renderDay();
  const latest = snapshots
    .filter(snapshot => dayKey(snapshot.createdAt) == selectedDay)
    .at(-1);
  selectedSnapshotId = latest?.id || null;
  if (selectedSnapshotId) {
    renderPreview(selectedSnapshotId).catch(error =>
      setStatus("nirva-time-travel-status-error", { reason: error.message })
    );
  } else {
    clearPreview();
  }
});
$("find").addEventListener("input", () => {
  clearTimeout(findTimer);
  findTimer = setTimeout(async () => {
    findQuery = $("find").value.trim();
    try {
      if (findQuery) {
        await renderFind();
      } else {
        await updateTimeline();
      }
    } catch (error) {
      setStatus("nirva-time-travel-status-error", { reason: error.message });
    }
  }, 200);
});
// Up and down move through the timeline and preview as they go.
snapshotList.addEventListener("keydown", event => {
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) {
    return;
  }
  const rows = [...snapshotList.querySelectorAll(".snapshot-row")];
  const at = rows.indexOf(event.target.closest(".snapshot-row"));
  const next = rows[at + (event.key == "ArrowDown" ? 1 : -1)];
  if (next) {
    event.preventDefault();
    next.focus();
    renderPreview(next.dataset.id).catch(error =>
      setStatus("nirva-time-travel-status-error", { reason: error.message })
    );
  }
});
$("save-now").addEventListener("click", async () => {
  try {
    // Pressing the button is a request to save, even while automatic snapshots are paused.
    const saved = await NirvaTimeTravel.captureNow("manual", null, true);
    if (saved) {
      setStatus("nirva-time-travel-status-saved");
    }
    if (saved) {
      selectedDay = dayKey(saved.createdAt);
      selectedSnapshotId = saved.id;
    }
    await updateTimeline();
  } catch (error) {
    setStatus("nirva-time-travel-status-error", { reason: error.message });
  }
});
snapshotList.addEventListener("click", event => {
  const button = event.target.closest("button[data-id]");
  if (button) {
    renderPreview(button.dataset.id).catch(error =>
      setStatus("nirva-time-travel-status-error", { reason: error.message })
    );
  }
});
$("preview-windows").addEventListener("click", event => {
  const button = event.target.closest(
    "button[data-window-index][data-tab-index]"
  );
  if (button) {
    openConfirm({
      type: "restore-tab",
      windowIndex: Number(button.dataset.windowIndex),
      tabIndex: Number(button.dataset.tabIndex),
    });
  }
});
$("recording-toggle").addEventListener("click", async () => {
  try {
    await NirvaTimeTravel.setEnabled(!timeline.enabled);
    setStatus("nirva-time-travel-status-settings");
    await updateTimeline();
  } catch (error) {
    setStatus("nirva-time-travel-status-error", { reason: error.message });
  }
});
$("retention").addEventListener("change", async event => {
  try {
    await NirvaTimeTravel.setRetentionDays(event.target.value);
    setStatus("nirva-time-travel-status-settings");
    await updateTimeline();
  } catch (error) {
    setStatus("nirva-time-travel-status-error", { reason: error.message });
  }
});
$("storage-limit").addEventListener("change", async event => {
  try {
    await NirvaTimeTravel.setStorageLimitMB(event.target.value);
    setStatus("nirva-time-travel-status-settings");
    await updateTimeline();
  } catch (error) {
    setStatus("nirva-time-travel-status-error", { reason: error.message });
  }
});
$("clear-all").addEventListener("click", () => openConfirm("clear"));
$("restore-snapshot").addEventListener("click", () => openConfirm("restore"));
$("delete-snapshot").addEventListener("click", async () => {
  if (!selectedSnapshotId) {
    return;
  }
  await NirvaTimeTravel.deleteSnapshot(selectedSnapshotId);
  selectedSnapshotId = null;
  clearPreview();
  setStatus("nirva-time-travel-status-deleted");
  await updateTimeline();
});
$("confirm-action").addEventListener("click", confirmAction);

const storeChanged = () =>
  updateTimeline().catch(error =>
    setStatus("nirva-time-travel-status-error", { reason: error.message })
  );
Services.obs.addObserver(storeChanged, "nirva-timetravel-changed");
window.addEventListener(
  "pagehide",
  () => Services.obs.removeObserver(storeChanged, "nirva-timetravel-changed"),
  { once: true }
);

await document.l10n.ready;
updateTimeline().catch(error =>
  setStatus("nirva-time-travel-status-error", { reason: error.message })
);
