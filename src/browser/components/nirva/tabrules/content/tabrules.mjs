/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { NirvaTabRules, SLEEP_MINUTE_CHOICES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/tabrules/NirvaTabRules.sys.mjs"
);
const { NirvaWorkspaces, WORKSPACES_CHANGED_TOPIC } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs"
  );

const CHANGE_TOPIC = "nirva-tabrules-changed";
const $ = selector => document.querySelector(selector);

function node(tag, className, l10nId, l10nArgs) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (l10nId) {
    document.l10n.setAttributes(element, l10nId, l10nArgs);
  }
  return element;
}

function workspaceSelect(selected) {
  const select = node("select");
  for (const workspace of NirvaWorkspaces.list) {
    const option = node("option");
    option.value = workspace.id;
    option.textContent = workspace.name;
    option.selected = workspace.id == selected;
    select.append(option);
  }
  return select;
}

function renderRules() {
  const known = new Set(NirvaWorkspaces.list.map(w => w.id));
  const rows = NirvaTabRules.rules.map(rule => {
    const row = node("li", "row");
    row.dataset.id = rule.id;
    const site = node("span", "row-main");
    site.textContent = rule.host;
    const select = workspaceSelect(rule.workspace);
    document.l10n.setAttributes(select, "nirva-tabrules-add-workspace");
    if (!known.has(rule.workspace)) {
      // Its workspace was removed; the rule waits until another is chosen.
      select.prepend(node("option", "", "nirva-tabrules-workspace-gone"));
      select.selectedIndex = 0;
    }
    select.addEventListener("change", () =>
      NirvaTabRules.setRuleWorkspace(rule.id, select.value)
    );
    const label = node("label", "check");
    const box = node("input");
    box.type = "checkbox";
    box.checked = rule.enabled;
    box.addEventListener("change", () =>
      NirvaTabRules.setRuleEnabled(rule.id, box.checked)
    );
    label.append(box, node("span", "", "nirva-tabrules-rule-on"));
    const remove = node("button", "quiet-button", "nirva-tabrules-remove");
    remove.type = "button";
    remove.addEventListener("click", () => NirvaTabRules.removeRule(rule.id));
    row.append(site, select, label, remove);
    return row;
  });
  $("#rules").replaceChildren(...rows);
  $("#rules-empty").hidden = !!rows.length;
}

function renderLog() {
  const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
  const rows = NirvaTabRules.log.map(entry => {
    const row = node("li", "row");
    row.append(
      node("span", "row-main", "nirva-tabrules-log-entry", {
        site: entry.host,
        from: entry.fromName,
        to: entry.toName,
        time: time.format(entry.time),
      })
    );
    if (entry.undone) {
      row.append(node("span", "quiet", "nirva-tabrules-log-undone"));
    } else if (entry.canUndo) {
      const undo = node("button", "quiet-button", "nirva-tabrules-undo");
      undo.type = "button";
      undo.addEventListener("click", () => NirvaTabRules.undo(entry.id));
      row.append(undo);
    }
    return row;
  });
  $("#log").replaceChildren(...rows);
  $("#log-empty").hidden = !!rows.length;
}

function render() {
  const { paused } = NirvaTabRules;
  document.l10n.setAttributes(
    $("#pause"),
    paused ? "nirva-tabrules-resume" : "nirva-tabrules-pause-all"
  );
  $("#paused-note").hidden = !paused && NirvaWorkspaces.enabled;
  if (!$("#paused-note").hidden) {
    document.l10n.setAttributes(
      $("#paused-note"),
      paused ? "nirva-tabrules-paused-note" : "nirva-tabrules-no-workspaces"
    );
  }
  renderRules();
  const chosen = $("#add-workspace").value;
  $("#add-workspace").replaceChildren(...workspaceSelect(chosen).children);
  $("#add-workspace").value = chosen || NirvaWorkspaces.list[0].id;
  $("#suggest-sleep").checked = NirvaTabRules.suggestSleep;
  $("#sleep-minutes").disabled = !NirvaTabRules.suggestSleep;
  $("#sleep-minutes").replaceChildren(
    ...SLEEP_MINUTE_CHOICES.map(minutes => {
      const option = node("option", "", "nirva-tabrules-sleep-after", {
        minutes,
      });
      option.value = minutes;
      option.selected = minutes == NirvaTabRules.sleepMinutes;
      return option;
    })
  );
  renderLog();
}

$("#pause").addEventListener("click", () => {
  NirvaTabRules.paused = !NirvaTabRules.paused;
});
$("#add").addEventListener("submit", event => {
  event.preventDefault();
  const added = NirvaTabRules.addRule(
    $("#add-site").value,
    $("#add-workspace").value
  );
  $("#add-error").hidden = !!added;
  if (added) {
    $("#add-site").value = "";
  } else {
    document.l10n.setAttributes($("#add-error"), "nirva-tabrules-add-error");
  }
});
$("#suggest-sleep").addEventListener("change", event => {
  NirvaTabRules.suggestSleep = event.target.checked;
});
$("#sleep-minutes").addEventListener("change", event => {
  NirvaTabRules.sleepMinutes = event.target.value;
});

const observer = { observe: render };
Services.obs.addObserver(observer, CHANGE_TOPIC);
Services.obs.addObserver(observer, WORKSPACES_CHANGED_TOPIC);
window.addEventListener("unload", () => {
  Services.obs.removeObserver(observer, CHANGE_TOPIC);
  Services.obs.removeObserver(observer, WORKSPACES_CHANGED_TOPIC);
});
render();
