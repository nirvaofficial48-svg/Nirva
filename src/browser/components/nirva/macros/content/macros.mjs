/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { NirvaMacros, MACROS_CHANGED_TOPIC, MAX_STEPS } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/nirva/macros/NirvaMacros.sys.mjs"
  );

const $ = selector => document.querySelector(selector);
const chromeWindow = window.browsingContext.topChromeWindow;

// The macro being edited: its id (null for a new one), name and steps.
let draft = { id: null, name: "", steps: [] };

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

function button(l10nId, onClick, l10nArgs) {
  const element = node("button", "quiet-button", l10nId, l10nArgs);
  element.type = "button";
  element.addEventListener("click", onClick);
  return element;
}

function showError(id) {
  const error = $("#error");
  error.hidden = !id;
  if (id) {
    document.l10n.setAttributes(error, id);
  }
}

function renderMacros() {
  const rows = NirvaMacros.macros.map(macro => {
    const row = node("li", "row");
    row.dataset.id = macro.id;
    const main = node("span", "row-main");
    const label = node("span", "macro-name");
    label.textContent = macro.name;
    main.append(
      label,
      node("span", "row-sub", "nirva-macros-step-count", {
        count: macro.steps.length,
      })
    );
    row.append(
      main,
      button(
        "nirva-macros-run",
        () => NirvaMacros.run(chromeWindow, macro.id),
        {
          name: macro.name,
        }
      ),
      button("nirva-macros-edit", () => edit(macro), { name: macro.name }),
      button(
        "nirva-macros-delete",
        async () => {
          const question = await document.l10n.formatValue(
            "nirva-macros-delete-confirm",
            { name: macro.name }
          );
          // eslint-disable-next-line no-alert
          if (window.confirm(question)) {
            NirvaMacros.remove(macro.id);
            if (draft.id == macro.id) {
              edit(null);
            }
          }
        },
        { name: macro.name }
      )
    );
    return row;
  });
  $("#macros").replaceChildren(...rows);
  $("#macros-empty").hidden = !!rows.length;
}

function renderChoices() {
  const select = $("#choice");
  const current = select.value;
  const options = NirvaMacros.choices(chromeWindow).map(choice => {
    const option = node("option");
    option.value = choice.key;
    option.textContent = choice.title;
    option.selected = choice.key == current;
    return option;
  });
  select.replaceChildren(...options);
  $("#url").hidden = select.value != "open";
}

function renderSteps() {
  const count = draft.steps.length;
  const rows = draft.steps.map((step, index) => {
    const row = node("li", "row step");
    const main = node("span", "row-main");
    main.append(
      node("span", "row-sub", "nirva-macros-step-number", { step: index + 1 })
    );
    const title = node("span", "step-title");
    title.textContent = NirvaMacros.titleOf(step, chromeWindow);
    main.append(title);
    row.append(main);
    if (NirvaMacros.isConsequential(step)) {
      row.append(node("span", "asks-first", "nirva-macros-asks-first"));
    }
    const move = (from, to) => {
      draft.steps.splice(to, 0, ...draft.steps.splice(from, 1));
      renderSteps();
    };
    const up = button("nirva-macros-step-up", () => move(index, index - 1), {
      step: index + 1,
    });
    up.disabled = index == 0;
    const down = button(
      "nirva-macros-step-down",
      () => move(index, index + 1),
      { step: index + 1 }
    );
    down.disabled = index == count - 1;
    const remove = button(
      "nirva-macros-step-remove",
      () => {
        draft.steps.splice(index, 1);
        renderSteps();
      },
      { step: index + 1 }
    );
    row.append(up, down, remove);
    return row;
  });
  $("#steps").replaceChildren(...rows);
  $("#steps-empty").hidden = !!count;
  $("#add button").disabled = count >= MAX_STEPS;
}

function edit(macro) {
  draft = macro
    ? { id: macro.id, name: macro.name, steps: structuredClone(macro.steps) }
    : { id: null, name: "", steps: [] };
  document.l10n.setAttributes(
    $("#editor-heading"),
    macro ? "nirva-macros-editor-edit" : "nirva-macros-editor-new"
  );
  $("#name").value = draft.name;
  showError(null);
  renderSteps();
}

$("#choice").addEventListener("change", () => {
  $("#url").hidden = $("#choice").value != "open";
  if (!$("#url").hidden) {
    $("#url").focus();
  }
});

$("#add").addEventListener("submit", event => {
  event.preventDefault();
  const choice = NirvaMacros.choices(chromeWindow).find(
    c => c.key == $("#choice").value
  );
  if (!choice) {
    return;
  }
  const step = { ...choice.step, label: choice.title };
  if (step.type == "open") {
    const uri = NirvaMacros.siteURI($("#url").value);
    if (!uri) {
      showError("nirva-macros-error-address");
      return;
    }
    step.url = uri.spec;
    $("#url").value = "";
  }
  showError(null);
  draft.steps.push(step);
  renderSteps();
});

$("#save").addEventListener("click", () => {
  try {
    NirvaMacros.save({
      id: draft.id,
      name: $("#name").value,
      steps: draft.steps,
    });
    edit(null);
  } catch (e) {
    showError(e.message.startsWith("nirva-macros-") ? e.message : null);
  }
});

$("#cancel").addEventListener("click", () => edit(null));
$("#new").addEventListener("click", () => {
  edit(null);
  $("#name").focus();
});

const observer = {
  observe() {
    renderMacros();
    renderChoices();
    renderSteps();
  },
};
Services.obs.addObserver(observer, MACROS_CHANGED_TOPIC);
window.addEventListener("unload", () => {
  Services.obs.removeObserver(observer, MACROS_CHANGED_TOPIC);
});

edit(null);
renderMacros();
renderChoices();
