/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { NirvaHome, HOME_CHANGE_TOPIC, HOME_WIDGETS } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/nirva/home/NirvaHome.sys.mjs"
  );
const { NirvaWorkspaces, WORKSPACES_CHANGED_TOPIC } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs"
  );
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

const { NirvaTheme } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/theme/NirvaTheme.sys.mjs"
);
const { NirvaCommandBar } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommandBar.sys.mjs"
);

const browserWindow = window.browsingContext.topChromeWindow;
const root = document.documentElement;
const $ = selector => document.querySelector(selector);
const look = () => root.dataset.nirvaLook || "glass";

// The widgets each look shows until the person chooses otherwise.
const DEFAULT_WIDGETS = {
  glass: [
    "todo",
    "focus",
    "clips",
    "countdown",
    "computer",
    "privacy",
    "reading",
  ],
  paper: ["todo", "focus", "note", "countdown", "reading", "privacy"],
  cockpit: ["focus", "ribbon", "reading", "energy", "privacy"],
};
const ORDINALS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "sixteenth",
  "seventeenth",
  "eighteenth",
  "nineteenth",
  "twentieth",
  "twenty-first",
  "twenty-second",
  "twenty-third",
  "twenty-fourth",
  "twenty-fifth",
  "twenty-sixth",
  "twenty-seventh",
  "twenty-eighth",
  "twenty-ninth",
  "thirtieth",
  "thirty-first",
];
const DAY_MS = 24 * 60 * 60 * 1000;
const number = new Intl.NumberFormat();

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text != null) {
    element.textContent = text;
  }
  return element;
}

// Text and labels are only written when they change: rewriting them every second made the
// browser redraw those parts of the page each time, which showed as a flicker.
function l10n(element, id, args) {
  const current = document.l10n.getAttributes(element);
  if (
    current.id != id ||
    JSON.stringify(current.args ?? null) != JSON.stringify(args ?? null)
  ) {
    document.l10n.setAttributes(element, id, args);
  }
  return element;
}

function setText(element, text) {
  if (element.textContent != text) {
    element.textContent = text;
  }
}

function setHidden(element, hidden) {
  if (element.hidden != hidden) {
    element.hidden = hidden;
  }
}

function setStyle(element, property, value) {
  if (element.style.getPropertyValue(property) != value) {
    element.style.setProperty(property, value);
  }
}

function runCommand(id) {
  NirvaCommands.get(id, browserWindow)?.run(browserWindow);
}

function openPage(url) {
  browserWindow.openTrustedLinkIn(url, "current");
}

function gigabytes(bytes) {
  return (bytes / 1024 ** 3).toFixed(1);
}

function ago(time) {
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const minutes = Math.round((time - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) {
    return format.format(minutes, "minute");
  }
  const hours = Math.round(minutes / 60);
  return Math.abs(hours) < 24
    ? format.format(hours, "hour")
    : format.format(Math.round(hours / 24), "day");
}

// ---------- Clock ----------

function renderClock() {
  const now = new Date();
  setText(
    $("#clock"),
    new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now)
  );
  if (look() == "paper" && navigator.language.startsWith("en")) {
    const weekday = new Intl.DateTimeFormat("en", { weekday: "long" }).format(
      now
    );
    const month = new Intl.DateTimeFormat("en", { month: "long" }).format(now);
    setText(
      $("#date"),
      `${weekday}, the ${ORDINALS[now.getDate() - 1]} of ${month}`
    );
  } else {
    setText(
      $("#date"),
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(now)
    );
  }
}

// ---------- Which widgets show, and where ----------

function isShown(id, data) {
  const chosen = data.widgets[id];
  return typeof chosen == "boolean"
    ? chosen
    : DEFAULT_WIDGETS[look()].includes(id);
}

function renderLayout(data) {
  for (const section of document.querySelectorAll("[data-widget]")) {
    section.hidden = !isShown(section.dataset.widget, data);
  }
  // Cockpit keeps the focus session beside the clock; the other looks keep it in the grid.
  const focusWidget = $('[data-widget="focus"]');
  const home = look() == "cockpit" ? $("#top-slot") : $("#grid");
  if (focusWidget.parentNode != home) {
    if (home.id == "grid") {
      home.insertBefore(focusWidget, $('[data-widget="clips"]'));
    } else {
      home.append(focusWidget);
    }
  }
}

// ---------- Widgets that hold the person's own things ----------

function renderTodo(data) {
  const rows = data.todo.map(item => {
    const row = node("li", "row");
    const label = node("label", "check");
    const box = node("input");
    box.type = "checkbox";
    box.checked = item.done;
    box.addEventListener("change", () => NirvaHome.toggleTodo(item.id));
    label.append(box, node("span", "", item.text));
    label.toggleAttribute("data-done", item.done);
    const remove = l10n(
      node("button", "icon-button remove"),
      "nirva-home-remove"
    );
    remove.type = "button";
    remove.addEventListener("click", () => NirvaHome.removeTodo(item.id));
    row.append(label, remove);
    return row;
  });
  $("#todo").replaceChildren(...rows);
  // An empty list shows where to type; otherwise the plus button opens the field.
  $("#todo-add").hidden = !addingTodo && !!rows.length;
}

let addingTodo = false;

function setAddingTodo(adding) {
  addingTodo = adding;
  $("#todo-add").hidden = !adding && !!NirvaHome.data.todo.length;
  $("#todo-new").setAttribute("aria-expanded", String(adding));
  if (adding) {
    $("#todo-text").focus();
  }
}

function renderNote(data) {
  if (document.activeElement != $("#note")) {
    $("#note").value = data.note;
  }
}

function renderCountdown(data) {
  const { title, date } = data.countdown;
  if (title) {
    $("#countdown-title").removeAttribute("data-l10n-id");
    $("#countdown-title").textContent = title;
  } else {
    l10n($("#countdown-title"), "nirva-home-countdown-title");
  }
  $("#countdown").hidden = !date;
  $("#countdown-set").hidden = !!date;
  if (date) {
    const [year, month, day] = date.split("-").map(Number);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(year, month - 1, day) - today) / DAY_MS);
    $("#countdown-days").textContent = number.format(Math.abs(days));
    l10n(
      $("#countdown-label"),
      days >= 0 ? "nirva-home-countdown-to-go" : "nirva-home-countdown-ago",
      { days: Math.abs(days) }
    );
  }
}

function renderLinks(data) {
  const items = data.links.map(link => {
    const item = node("li");
    const anchor = node("a", "link");
    anchor.href = link.url;
    anchor.title = link.title;
    const icon = node("img");
    icon.src = `page-icon:${link.url}`;
    icon.alt = "";
    anchor.append(icon, node("span", "link-title", link.title));
    anchor.addEventListener("click", event => {
      event.preventDefault();
      openPage(link.url);
    });
    const remove = l10n(
      node("button", "icon-button remove"),
      "nirva-home-remove"
    );
    remove.type = "button";
    remove.addEventListener("click", () => NirvaHome.removeLink(link.id));
    item.append(anchor, remove);
    return item;
  });
  $("#links").replaceChildren(...items);
}

// ---------- Focus session ----------

function renderFocus() {
  const session = NirvaHome.focus;
  const seconds = Math.ceil(session.remainingMs / 1000);
  setText(
    $("#focus-time"),
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
  );
  const left = session.remainingMs / session.totalMs;
  const around = 2 * Math.PI * 20;
  setStyle($("#focus-ring"), "stroke-dasharray", `${around * left} ${around}`);
  setStyle($("#focus-line"), "width", `${left * 100}%`);
  const started = session.remainingMs < session.totalMs;
  let label = "nirva-home-focus-start";
  if (session.running) {
    label = "nirva-home-focus-pause";
  } else if (started) {
    label = "nirva-home-focus-resume";
  }
  l10n($("#focus-toggle"), label);
  setHidden($("#focus-reset"), session.running || !started);
  setHidden($("#focus-locking"), !session.locking);
}

// ---------- Widgets that report on the browser ----------

async function renderClips() {
  const clips = await NirvaHome.clips();
  const rows = clips.map(clip => {
    const row = node("li", "row");
    const text = node("div", "two-lines");
    text.append(
      node("span", "strong", clip.text.split("\n")[0] || clip.title),
      node("span", "quiet", `${clip.title} · ${ago(clip.updatedAt)}`)
    );
    const dot = node("span", "dot");
    dot.toggleAttribute("data-fresh", Date.now() - clip.updatedAt < DAY_MS);
    dot.setAttribute("aria-hidden", "true");
    row.append(text, dot);
    row.addEventListener("click", () => runCommand("live-clips-open"));
    return row;
  });
  $("#clips").replaceChildren(...rows);
  // With two clips the card is full; the button moves to the heading line.
  $("#clips-open").hidden = rows.length > 1;
  $("#clips-open").classList.toggle("accent", !rows.length);
  l10n(
    $("#clips-open"),
    rows.length ? "nirva-home-clips-open" : "nirva-home-clips-empty"
  );
}

function renderReading() {
  const rows = NirvaHome.reading.slice(0, 4).map(item => {
    const row = node("li", "row progress");
    const anchor = node("a", "row-link");
    anchor.href = item.url;
    anchor.append(
      node("span", "one-line", item.title),
      node("span", "quiet", `${item.percent}%`)
    );
    anchor.addEventListener("click", event => {
      event.preventDefault();
      openPage(item.url);
    });
    const bar = node("span", "progress-line");
    bar.style.width = `${item.percent}%`;
    const remove = l10n(
      node("button", "icon-button remove"),
      "nirva-home-remove"
    );
    remove.type = "button";
    remove.addEventListener("click", () => NirvaHome.removeReading(item.url));
    row.append(anchor, bar, remove);
    return row;
  });
  $("#reading").replaceChildren(...rows);
  $("#reading-empty").hidden = !!rows.length;
}

async function renderStats() {
  const stats = await NirvaHome.stats();
  l10n($("#stat-tabs"), "nirva-home-stat-tabs", {
    tabs: stats.tabs,
    asleep: stats.asleep,
  });
  l10n($("#stat-memory"), "nirva-home-stat-memory", {
    used: gigabytes(stats.memory),
  });
  l10n($("#memory-value"), "nirva-home-memory-value", {
    used: gigabytes(stats.memory),
    total: Math.round(stats.totalMemory / 1024 ** 3),
  });
  $("#memory-bar").style.width = stats.totalMemory
    ? `${Math.min(100, (stats.memory / stats.totalMemory) * 100)}%`
    : "0";
  $("#energy-empty").hidden = !!stats.energy.length;
  const most = stats.energy[0]?.bytes || 1;
  $("#energy").replaceChildren(
    ...stats.energy.map((tab, index) => {
      const row = node("li", "row progress");
      row.toggleAttribute("data-heaviest", index == 0);
      const bar = node("span", "progress-line");
      bar.style.width = `${(tab.bytes / most) * 100}%`;
      row.append(
        node("span", "one-line", tab.title),
        l10n(node("span", "quiet"), "nirva-home-megabytes", {
          megabytes: Math.round(tab.bytes / 1024 ** 2),
        }),
        bar
      );
      return row;
    })
  );
  try {
    const battery = await navigator.getBattery();
    const percent = Math.round(battery.level * 100);
    $("#battery").hidden = false;
    $("#battery-value").textContent = `${percent}%`;
    $("#battery-bar").style.width = `${percent}%`;
    $("#stat-battery").textContent = `${percent}%`;
  } catch (_error) {
    $("#battery").hidden = true;
  }
}

async function renderPrivacy() {
  const today = await NirvaHome.privacyToday();
  $("#privacy-trackers").textContent = number.format(today.trackers);
  $("#privacy-fingerprinters").textContent = number.format(
    today.fingerprinters
  );
  $("#privacy-burners").textContent = number.format(today.burnersWiped);
  $("#privacy-strict").textContent = number.format(today.strictSites);
}

async function renderSessions() {
  const time = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const makeStop = (label, tabs, windows, action, now) => {
    const item = node("div", "stop");
    item.toggleAttribute("data-now", !!now);
    const button = l10n(node("button", "text-button"), action);
    button.type = "button";
    button.addEventListener("click", () => runCommand("time-travel"));
    item.append(
      label,
      node("span", "stop-dot"),
      l10n(node("div", "stop-title"), "nirva-home-session-tabs", { tabs }),
      l10n(node("div", "quiet"), "nirva-home-session-windows", { windows }),
      button
    );
    return item;
  };
  const stops = (await NirvaHome.sessions()).map(session =>
    makeStop(
      node("div", "stop-time", time.format(session.createdAt)),
      session.tabCount,
      session.windowCount,
      "nirva-home-session-restore"
    )
  );
  const windows = new Set();
  let tabs = 0;
  for (const win of Services.wm.getEnumerator("navigator:browser")) {
    if (!win.closed && win.gBrowser) {
      windows.add(win);
      tabs += win.gBrowser.tabs.length;
    }
  }
  stops.push(
    makeStop(
      l10n(node("div", "stop-time"), "nirva-home-session-now"),
      tabs,
      windows.size,
      "nirva-home-session-timeline",
      true
    )
  );
  $("#sessions").replaceChildren(...stops);
}

function renderWorkspaces() {
  const active = NirvaWorkspaces.getActive(browserWindow);
  $("#workspaces").replaceChildren(
    ...NirvaWorkspaces.list.map(workspace => {
      const button = node("button", "strip-workspace", workspace.name);
      button.type = "button";
      button.toggleAttribute("data-active", workspace.id == active);
      button.addEventListener("click", () =>
        NirvaWorkspaces.switchTo(browserWindow, workspace.id)
      );
      return button;
    })
  );
}

// ---------- Edit home ----------

function renderEditor(data) {
  $("#editor-widgets").replaceChildren(
    ...HOME_WIDGETS.map(id => {
      const label = node("label", "check");
      const box = node("input");
      box.type = "checkbox";
      box.checked = isShown(id, data);
      box.addEventListener("change", () =>
        NirvaHome.setWidget(id, box.checked)
      );
      label.append(box, l10n(node("span"), `nirva-home-widget-${id}`));
      return label;
    })
  );
  for (const [selector, value] of [
    ["#editor-countdown-title", data.countdown.title],
    ["#editor-countdown-date", data.countdown.date],
    ["#editor-focus-sites", data.focusSites.join("\n")],
  ]) {
    if (document.activeElement != $(selector)) {
      $(selector).value = value;
    }
  }
}

function setEditing(editing) {
  root.toggleAttribute("data-editing", editing);
  $("#editor").hidden = !editing;
  $("#edit").setAttribute("aria-expanded", String(editing));
  l10n($("#edit"), editing ? "nirva-home-edit-done" : "nirva-home-edit");
  if (editing) {
    $("#editor").scrollIntoView({ block: "nearest" });
  } else {
    $("#link-form").hidden = true;
  }
}

function render() {
  const data = NirvaHome.data;
  renderLayout(data);
  renderClock();
  renderTodo(data);
  renderNote(data);
  renderCountdown(data);
  renderLinks(data);
  renderFocus();
  renderReading();
  renderEditor(data);
  renderWorkspaces();
  renderClips();
  renderStats();
  renderPrivacy();
  renderSessions();
}

$("#todo-new").addEventListener("click", () => setAddingTodo(!addingTodo));
$("#todo-text").addEventListener("keydown", event => {
  if (event.key == "Escape" && NirvaHome.data.todo.length) {
    setAddingTodo(false);
    $("#todo-new").focus();
  }
});
$("#todo-add").addEventListener("submit", event => {
  event.preventDefault();
  if (NirvaHome.addTodo($("#todo-text").value)) {
    $("#todo-text").value = "";
  }
});
$("#note").addEventListener("change", () =>
  NirvaHome.setNote($("#note").value)
);
$("#focus-toggle").addEventListener("click", () =>
  NirvaHome.focus.running ? NirvaHome.pauseFocus() : NirvaHome.startFocus()
);
$("#focus-reset").addEventListener("click", () => NirvaHome.resetFocus());
$("#clips-open").addEventListener("click", () => runCommand("live-clips-open"));
$("#countdown-set").addEventListener("click", () => {
  setEditing(true);
  $("#editor-countdown-title").focus();
});
$("#command").addEventListener("click", () =>
  NirvaCommandBar.open(browserWindow)
);
$("#edit").addEventListener("click", () =>
  setEditing(!root.hasAttribute("data-editing"))
);
$("#link-add").addEventListener("click", () => {
  $("#link-form").hidden = !$("#link-form").hidden;
  if (!$("#link-form").hidden) {
    $("#link-url").focus();
  }
});
$("#link-form").addEventListener("submit", event => {
  event.preventDefault();
  const added = NirvaHome.addLink($("#link-url").value, $("#link-title").value);
  $("#link-error").hidden = added;
  if (added) {
    $("#link-url").value = "";
    $("#link-title").value = "";
    $("#link-form").hidden = true;
  }
});
const saveCountdown = () =>
  NirvaHome.setCountdown(
    $("#editor-countdown-title").value,
    $("#editor-countdown-date").value
  );
$("#editor-countdown-title").addEventListener("change", saveCountdown);
$("#editor-countdown-date").addEventListener("change", saveCountdown);
$("#editor-focus-sites").addEventListener("change", () =>
  NirvaHome.setFocusSites($("#editor-focus-sites").value)
);
$("#editor-clear-reading").addEventListener("click", () =>
  NirvaHome.clearReading()
);
$("#editor-studio").addEventListener("click", () => runCommand("theme-studio"));

const observer = { observe: render };
const topics = [
  HOME_CHANGE_TOPIC,
  WORKSPACES_CHANGED_TOPIC,
  "nirva-live-clips-changed",
  "nirva-burner-wiped",
  "nirva-trust-changed",
];
for (const topic of topics) {
  Services.obs.addObserver(observer, topic);
}
browserWindow.addEventListener("NirvaWorkspaceChanged", renderWorkspaces);
new MutationObserver(render).observe(root, {
  attributes: true,
  attributeFilter: ["data-nirva-look"],
});
const second = setInterval(() => {
  renderClock();
  renderFocus();
}, 1000);
const slow = setInterval(() => {
  if (!document.hidden) {
    renderStats();
    renderPrivacy();
    renderSessions();
  }
}, 20000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    render();
  }
});
// The chosen wallpaper, accent and corners cover the whole home page, not only the toolbar.
const THEME_PREFS = [
  "nirva.theme.enabled",
  "nirva.theme.settings",
  "nirva.theme.preview",
  "nirva.look",
  "nirva.mode",
  "nirva.motion.style",
  "nirva.lite.enabled",
];
const applyTheme = () => NirvaTheme.applyToWindow(window);
for (const pref of THEME_PREFS) {
  Services.prefs.addObserver(pref, applyTheme);
}
applyTheme();

window.addEventListener("unload", () => {
  for (const pref of THEME_PREFS) {
    Services.prefs.removeObserver(pref, applyTheme);
  }
  clearInterval(second);
  clearInterval(slow);
  for (const topic of topics) {
    Services.obs.removeObserver(observer, topic);
  }
  browserWindow.removeEventListener("NirvaWorkspaceChanged", renderWorkspaces);
});

render();
setEditing(location.hash == "#edit");
