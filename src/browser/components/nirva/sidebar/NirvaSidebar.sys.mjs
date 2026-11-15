/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  NirvaWorkspaces,
  WORKSPACES_CHANGED_TOPIC,
} from "moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs";

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";
import { FLAME_PATH } from "moz-src:///browser/components/nirva/burner/NirvaBurner.sys.mjs";

const lazy = {};
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["browser/nirva/sidebar.ftl"], true)
);

const PREF_ENABLED = "nirva.sidebar.enabled";
const PREF_WORKSPACES_ENABLED = "nirva.workspaces.enabled";
const PREF_AUTOHIDE = "nirva.autohide.enabled";
// A full-size tab row: the 44 px target and 1 px above and below.
const FULL_ROW = 46;
// How long the pointer may be away before the hidden sidebar slides back out.
const AUTOHIDE_CLOSE_DELAY = 350;
const OPEN_MENUS =
  "#tabContextMenu, #sidebar-context-menu, #toolbar-context-menu, #nirva-workspace-menu";
const HTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";
const SHADOW_STYLE = "chrome://browser/skin/nirva/sidebar-main.css";

/**
 * The Nirva sidebar: Firefox's vertical tabs, restyled from the design tokens, with the
 * workspace switcher on top. Styling lives in browser/themes/shared/nirva/sidebar.css and is
 * switched on by the nirva-sidebar attribute on the window root.
 */
export const NirvaSidebar = {
  _initialized: false,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.obs.addObserver(this, WORKSPACES_CHANGED_TOPIC);
    Services.prefs.addObserver(PREF_ENABLED, this);
    Services.prefs.addObserver(PREF_WORKSPACES_ENABLED, this);
    Services.prefs.addObserver(PREF_AUTOHIDE, this);
    this._registerCommands();
  },

  _registerCommands() {
    const workspacesOn = () => this.enabled && NirvaWorkspaces.enabled;
    NirvaCommands.registerAll([
      {
        id: "sidebar-toggle",
        feature: "sidebar",
        l10nId: "nirva-command-sidebar-toggle",
        keywords: "tabs rail hide show",
        run: win => win.SidebarController.handleToolbarButtonClick(),
      },
      {
        id: "sidebar-autohide-on",
        feature: "autohide",
        l10nId: "nirva-command-sidebar-autohide-on",
        keywords: "tabs sidebar hide hover full screen edge",
        run: () => Services.prefs.setBoolPref(PREF_AUTOHIDE, true),
        isAvailable: () => this.enabled && !this.autoHide,
      },
      {
        id: "sidebar-autohide-off",
        feature: "autohide",
        l10nId: "nirva-command-sidebar-autohide-off",
        keywords: "tabs sidebar pin keep show always",
        run: () => Services.prefs.setBoolPref(PREF_AUTOHIDE, false),
        isAvailable: () => this.enabled && this.autoHide,
      },
      {
        id: "workspace-new",
        feature: "workspaces",
        l10nId: "nirva-command-workspace-new",
        keywords: "create add space",
        run: win => this._newWorkspace(win),
        isAvailable: workspacesOn,
      },
      {
        id: "workspace-rename",
        feature: "workspaces",
        l10nId: "nirva-command-workspace-rename",
        keywords: "name space",
        run: win => this._renameWorkspace(win, NirvaWorkspaces.getActive(win)),
        isAvailable: workspacesOn,
      },
      {
        id: "workspace-delete",
        feature: "workspaces",
        l10nId: "nirva-command-workspace-delete",
        keywords: "remove space",
        run: win => NirvaWorkspaces.remove(NirvaWorkspaces.getActive(win)),
        isAvailable: () => workspacesOn() && NirvaWorkspaces.list.length > 1,
      },
    ]);
    // One "Go to workspace" command per workspace other than the one showing.
    NirvaCommands.registerProvider("workspaces", win =>
      workspacesOn()
        ? NirvaWorkspaces.list
            .filter(({ id }) => id != NirvaWorkspaces.getActive(win))
            .map(({ id, name }) => ({
              id: `workspace-switch-${id}`,
              l10nId: "nirva-command-workspace-switch",
              l10nArgs: { name },
              keywords: "switch space",
              run: w => NirvaWorkspaces.switchTo(w, id),
            }))
        : []
    );
  },

  _newWorkspace(win) {
    const name = this._askName(win, "");
    if (name) {
      NirvaWorkspaces.switchTo(win, NirvaWorkspaces.create(name));
    }
  },

  _renameWorkspace(win, id) {
    const current = NirvaWorkspaces.list.find(w => w.id == id)?.name ?? "";
    const name = this._askName(win, current);
    if (name) {
      NirvaWorkspaces.rename(id, name);
    }
  },

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  /** The sidebar stays out of sight until the pointer reaches the window's side edge. */
  get autoHide() {
    return Services.prefs.getBoolPref(PREF_AUTOHIDE, true);
  },

  /**
   * Slides the hidden sidebar in, or schedules it to slide out again once neither the
   * pointer, the keyboard focus nor one of its menus is on it.
   *
   * @param {Window} win
   * @param {boolean} show
   */
  reveal(win, show) {
    const doc = win.document;
    const root = doc.documentElement;
    win.clearTimeout(this._closeTimers.get(win));
    if (show) {
      root.toggleAttribute("nirva-sidebar-shown", this._autoHideOn());
      return;
    }
    this._closeTimers.set(
      win,
      win.setTimeout(() => {
        const container = doc.getElementById("sidebar-container");
        const busy =
          container?.matches(":hover, :focus-within") ||
          [...doc.querySelectorAll(OPEN_MENUS)].some(
            menu => menu.state == "open" || menu.state == "showing"
          );
        if (!busy) {
          root.removeAttribute("nirva-sidebar-shown");
        }
      }, AUTOHIDE_CLOSE_DELAY)
    );
  },

  _closeTimers: new WeakMap(),

  _autoHideOn() {
    return this.enabled && this.autoHide;
  },

  _applyAutoHide(win) {
    const root = win.document.documentElement;
    const on = this._autoHideOn();
    root.toggleAttribute("nirva-sidebar-autohide", on);
    if (!on) {
      root.removeAttribute("nirva-sidebar-shown");
    }
  },

  /**
   * When the tabs no longer fit at full size their rows shrink, and the list scrolls only
   * once that is not enough. Decided from the tab count, not from the list overflowing,
   * so shrinking can never make the list fit and grow back again.
   *
   * @param {Window} win
   */
  _initSqueeze(win) {
    const doc = win.document;
    const tabs = doc.getElementById("tabbrowser-tabs");
    const box = doc.getElementById("tabbrowser-arrowscrollbox");
    if (!tabs || !box) {
      return;
    }
    const update = () => {
      const foot =
        doc.getElementById("tabbrowser-arrowscrollbox-periphery")
          ?.clientHeight ?? 0;
      const room = box.getBoundingClientRect().height - foot;
      tabs.toggleAttribute(
        "nirva-squeezed",
        win.gBrowser.visibleTabs.length * FULL_ROW > room
      );
    };
    for (const type of ["TabOpen", "TabClose", "TabShow", "TabHide"]) {
      win.gBrowser.tabContainer.addEventListener(type, () =>
        win.requestAnimationFrame(update)
      );
    }
    win.addEventListener("resize", update);
    update();
  },

  _initAutoHide(win) {
    const doc = win.document;
    const container = doc.getElementById("sidebar-container");
    // A thin strip along the edge catches the pointer, even over a web page, whose own
    // pointer events never reach this window.
    const edge = doc.createElementNS(HTML_NS, "div");
    edge.id = "nirva-sidebar-edge";
    edge.setAttribute("aria-hidden", "true");
    doc.getElementById("browser").append(edge);
    const show = () => this.reveal(win, true);
    const hide = () => this.reveal(win, false);
    edge.addEventListener("mouseenter", show);
    edge.addEventListener("dragenter", show);
    container.addEventListener("mouseenter", show);
    container.addEventListener("focusin", show);
    container.addEventListener("mouseleave", hide);
    container.addEventListener("focusout", hide);
    doc.addEventListener("popuphidden", event => {
      if (event.target.matches?.(OPEN_MENUS)) {
        hide();
      }
    });
    this._applyAutoHide(win);
  },

  observe(subject, topic) {
    if (topic == "browser-delayed-startup-finished") {
      this.initWindow(subject);
      return;
    }
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (!win.closed && win.document.getElementById("nirva-workspaces")) {
        if (topic == "nsPref:changed") {
          this._applyEnabled(win);
          NirvaWorkspaces.updateWindow(win);
        }
        this.render(win);
      }
    }
  },

  /**
   * @param {Window} win a browser window that has finished starting
   */
  // Buttons at the foot of the sidebar: the Time Travel timeline and a new burner tab.
  _addFootButtons(win) {
    const doc = win.document;
    // They sit below the scrolling tab list, never inside it, so tabs cannot run under them.
    const anchor = doc.getElementById("vertical-tabs-newtab-button");
    if (!anchor || doc.getElementById("nirva-timetravel-button")) {
      return;
    }
    const foot = doc.createElementNS(HTML_NS, "div");
    foot.id = "nirva-tab-foot";
    anchor.before(foot);
    const button = (id, l10nId, command, shapes) => {
      const node = doc.createElementNS(HTML_NS, "button");
      node.id = id;
      node.type = "button";
      node.className = "nirva-foot-button";
      const label = lazy.l10n.formatValueSync(l10nId);
      node.title = label;
      node.setAttribute("aria-label", label);
      const svg = doc.createElementNS(SVG_NS, "svg");
      for (const [name, value] of Object.entries({
        width: 16,
        height: 16,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1.5,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "aria-hidden": "true",
      })) {
        svg.setAttribute(name, value);
      }
      for (const [tag, attributes] of shapes) {
        const shape = doc.createElementNS(SVG_NS, tag);
        for (const [name, value] of Object.entries(attributes)) {
          shape.setAttribute(name, value);
        }
        svg.append(shape);
      }
      node.append(svg);
      node.addEventListener("click", () =>
        NirvaCommands.get(command, win)?.run(win)
      );
      return node;
    };
    foot.append(
      button("nirva-burner-button", "nirva-sidebar-burner", "burner-new", [
        ["path", { d: FLAME_PATH }],
      ]),
      button(
        "nirva-timetravel-button",
        "nirva-sidebar-time-travel",
        "time-travel",
        [
          ["circle", { cx: 12, cy: 12, r: 8.5 }],
          ["path", { d: "M12 7.5V12l3 2" }],
        ]
      )
    );
  },

  initWindow(win) {
    const doc = win.document;
    if (doc.getElementById("nirva-workspaces") || !win.gBrowser) {
      return;
    }
    const root = doc.documentElement;
    for (const label of ["asleep", "burner"]) {
      root.style.setProperty(
        `--nirva-label-${label}`,
        JSON.stringify(lazy.l10n.formatValueSync(`nirva-tab-label-${label}`))
      );
    }

    this._addFootButtons(win);
    const switcher = doc.createElementNS(HTML_NS, "div");
    switcher.id = "nirva-workspaces";
    switcher.setAttribute("role", "tablist");
    switcher.setAttribute(
      "aria-label",
      lazy.l10n.formatValueSync("nirva-workspace-switcher-label")
    );
    switcher.addEventListener("click", event => {
      const id = event.target.closest(".nirva-workspace")?.dataset.id;
      if (id) {
        NirvaWorkspaces.switchTo(win, id);
      }
    });
    switcher.addEventListener("contextmenu", event => {
      event.preventDefault();
      const id = event.target.closest(".nirva-workspace")?.dataset.id;
      this._openMenu(win, id ?? NirvaWorkspaces.getActive(win), event);
    });
    // The island toolbar adds a top row to the sidebar; the switcher goes below it.
    const top = doc.getElementById("nirva-sidebar-top");
    if (top) {
      top.after(switcher);
    } else {
      doc.getElementById("vertical-tabs").prepend(switcher);
    }
    this._buildMenu(win);

    win.addEventListener("NirvaWorkspaceChanged", () => this.render(win));
    this._initAutoHide(win);
    this._initSqueeze(win);
    this._applyEnabled(win);
    NirvaWorkspaces.initWindow(win);
    this.render(win);
  },

  _applyEnabled(win) {
    const doc = win.document;
    doc.documentElement.toggleAttribute("nirva-sidebar", this.enabled);
    this._applyAutoHide(win);
    doc.getElementById("nirva-workspaces").hidden =
      !this.enabled || !NirvaWorkspaces.enabled;
    this._styleLauncher(win);
  },

  /**
   * Firefox's own launcher buttons (history, bookmarks and so on) live inside a closed-off
   * part of the sidebar element, so their styling has to be added from inside it.
   *
   * @param {Window} win
   */
  async _styleLauncher(win) {
    await win.customElements.whenDefined("sidebar-main");
    const shadow = win.document.querySelector("sidebar-main")?.shadowRoot;
    if (!shadow) {
      return;
    }
    let link = shadow.querySelector("link[data-nirva]");
    if (this.enabled && !link) {
      link = win.document.createElementNS(HTML_NS, "link");
      link.rel = "stylesheet";
      link.href = SHADOW_STYLE;
      link.dataset.nirva = "true";
      shadow.append(link);
    } else if (!this.enabled && link) {
      link.remove();
    }
  },

  /**
   * Redraws the workspace switcher of one window.
   *
   * @param {Window} win
   */
  render(win) {
    const doc = win.document;
    const switcher = doc.getElementById("nirva-workspaces");
    if (!switcher) {
      return;
    }
    const active = NirvaWorkspaces.getActive(win);
    const buttons = NirvaWorkspaces.list.map(({ id, name }) => {
      const button = doc.createElementNS(HTML_NS, "button");
      button.className = "nirva-workspace";
      button.dataset.id = id;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(id == active));
      button.title = name;
      const text = doc.createElementNS(HTML_NS, "span");
      text.textContent = name;
      // The collapsed rail has room for one letter only.
      text.dataset.initial = [...name][0]?.toUpperCase() ?? "";
      button.append(text);
      return button;
    });
    switcher.replaceChildren(...buttons);
  },

  _buildMenu(win) {
    const doc = win.document;
    const popup = doc.createXULElement("menupopup");
    popup.id = "nirva-workspace-menu";
    const actions = {
      new: () => this._newWorkspace(win),
      rename: id => this._renameWorkspace(win, id),
      delete: id => NirvaWorkspaces.remove(id),
    };
    for (const action of Object.keys(actions)) {
      const item = doc.createXULElement("menuitem");
      item.id = `nirva-workspace-menu-${action}`;
      item.setAttribute(
        "label",
        lazy.l10n.formatMessagesSync([`nirva-workspace-menu-${action}`])[0]
          .attributes[0].value
      );
      item.addEventListener("command", () => actions[action](popup.dataset.id));
      popup.append(item);
    }
    popup.addEventListener("popupshowing", () => {
      doc.getElementById("nirva-workspace-menu-delete").disabled =
        NirvaWorkspaces.list.length < 2;
    });
    doc.getElementById("mainPopupSet").append(popup);
  },

  _openMenu(win, id, event) {
    const popup = win.document.getElementById("nirva-workspace-menu");
    popup.dataset.id = id;
    popup.openPopupAtScreen(event.screenX, event.screenY, true, event);
  },

  _askName(win, current) {
    const input = { value: current };
    const ok = Services.prompt.prompt(
      win,
      lazy.l10n.formatValueSync("nirva-workspace-name-prompt-title"),
      lazy.l10n.formatValueSync("nirva-workspace-name-prompt-text"),
      input,
      null,
      { value: false }
    );
    return ok ? input.value.trim() : "";
  },
};
