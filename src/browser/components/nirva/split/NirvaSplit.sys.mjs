/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  MAX_PANES,
  SHAPES,
  SplitLayout,
} from "moz-src:///browser/components/nirva/split/NirvaSplitLayout.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NirvaCommands:
    "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs",
  SessionStore:
    "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs",
});

const PREF_ENABLED = "nirva.split.enabled";
const PREF_SNAP = "nirva.splitsnap.enabled";
const SESSION_KEY = "nirva-split";
const HTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_ICON = "chrome://global/skin/icons/defaultFavicon.svg";
const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;
const CHIP_WIDTH = 56;
const CHIP_HEIGHT = 34;

/**
 * @param {Document} doc
 * @param {string} tag
 * @param {object} [props] attributes; `l10n` sets the Fluent id and `className` the class
 */
function el(doc, tag, props = {}) {
  const node = doc.createElementNS(HTML_NS, tag);
  for (const [key, value] of Object.entries(props)) {
    if (key == "l10n") {
      doc.l10n.setAttributes(node, ...[value].flat());
    } else if (key == "className") {
      node.className = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  return node;
}

/**
 * The split icon drawn in designs/Main.html.
 *
 * @param {Document} doc
 */
function splitIcon(doc) {
  const svg = doc.createElementNS(SVG_NS, "svg");
  for (const [name, value] of Object.entries({
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.5,
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  })) {
    svg.setAttribute(name, value);
  }
  const rect = doc.createElementNS(SVG_NS, "rect");
  for (const [name, value] of Object.entries({
    x: 3,
    y: 5,
    width: 18,
    height: 14,
    rx: 3,
  })) {
    rect.setAttribute(name, value);
  }
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M12 5v14");
  svg.append(rect, path);
  return svg;
}

/**
 * An arrow pointing up, 16 px line icon.
 *
 * @param {Document} doc
 */
function arrowUpIcon(doc) {
  const svg = splitIcon(doc);
  svg.replaceChildren();
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M12 19V5M6 11l6-6 6 6");
  path.setAttribute("stroke-linecap", "round");
  svg.append(path);
  return svg;
}

function place(node, rect) {
  node.style.left = `${rect.x}px`;
  node.style.top = `${rect.y}px`;
  node.style.width = `${rect.w}px`;
  node.style.height = `${rect.h}px`;
}

/**
 * Split view for two to four tabs (SPEC T3, magnetic snap A8). Firefox's own split view
 * keeps which tabs belong together and restores them with the session; this module lays
 * the panes out (NirvaSplitLayout), draws the dividers, and offers the ways in: a button
 * on each sidebar tab, the island button, the layout tray and the command bar.
 */
export const NirvaSplit = {
  _initialized: false,
  _windows: new WeakMap(),
  _models: new WeakMap(),

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.prefs.addObserver(PREF_ENABLED, this);
    this._registerCommands();
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (win.gBrowserInit?.delayedStartupFinished) {
        this.initWindow(win);
      }
    }
  },

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  set enabled(value) {
    Services.prefs.setBoolPref(PREF_ENABLED, !!value);
  },

  get snapping() {
    return Services.prefs.getBoolPref(PREF_SNAP, true);
  },

  observe(subject, topic) {
    if (topic == "browser-delayed-startup-finished") {
      this.initWindow(subject);
    } else if (topic == "nsPref:changed") {
      for (const win of Services.wm.getEnumerator("navigator:browser")) {
        if (this._windows.has(win)) {
          this._updateRoot(win);
          this.closePanel(win);
          this.apply(win);
        }
      }
    }
  },

  /**
   * @param {Window} win a browser window that has finished starting
   */
  initWindow(win) {
    const doc = win.document;
    if (this._windows.has(win) || !win.gBrowser) {
      return;
    }
    win.MozXULElement.insertFTLIfNeeded("browser/nirva/split.ftl");
    const { gBrowser } = win;

    const overlay = el(doc, "div", {
      id: "nirva-split-overlay",
      hidden: "true",
    });
    const panelNode = el(doc, "div", {
      id: "nirva-split-panel",
      role: "dialog",
      hidden: "true",
      "aria-labelledby": "nirva-split-title",
    });
    doc.getElementById("browser").after(overlay);
    // A real pop-up, so a click anywhere else (also inside a page) closes it, as menus do.
    const popup = doc.createXULElement("panel");
    popup.id = "nirva-split-popup";
    popup.setAttribute("noautofocus", "true");
    popup.append(panelNode);
    doc.getElementById("mainPopupSet").append(popup);
    popup.addEventListener("popuphidden", event => {
      if (event.target === popup) {
        state.panel = null;
        panelNode.replaceChildren();
        state.button?.removeAttribute("open");
      }
    });
    popup.addEventListener("popupshown", () =>
      panelNode.querySelector(".nirva-split-row-main")?.focus()
    );

    const state = {
      overlay,
      panelNode,
      popup,
      panel: null,
      pressedWhileOpen: false,
      button: null,
      drag: null,
      frame: 0,
      styled: new Set(),
    };
    this._windows.set(win, state);
    this._updateRoot(win);
    this._addIslandButton(win);
    this._addMenuItems(win);

    const container = gBrowser.tabContainer;
    for (const tab of gBrowser.tabs) {
      this._decorateTab(tab);
    }
    container.addEventListener("TabOpen", e => {
      this._decorateTab(e.target);
      this._renderPanel(win);
    });
    container.addEventListener("TabClose", e =>
      this._onTabClose(win, e.target)
    );
    for (const type of [
      "TabSelect",
      "TabSplitViewActivate",
      "TabSplitViewDeactivate",
      "SplitViewTabChange",
      "SplitViewRemoved",
    ]) {
      container.addEventListener(type, () => this._schedule(win));
    }
    panelNode.addEventListener("keydown", event => {
      if (event.key == "Enter" && !event.target.closest?.("button")) {
        event.preventDefault();
        this.applyPanel(win);
      }
    });

    const resize = new win.ResizeObserver(() => this._schedule(win));
    resize.observe(gBrowser.tabpanels);
    win.addEventListener("resize", () => this._schedule(win));
    // The page card slides when the island comes or goes on websites; the dividers follow.
    doc
      .getElementById("tabbrowser-tabbox")
      ?.addEventListener("transitionend", () => this._schedule(win));

    // The menu button at the foot of a page in a split opens this panel, not Firefox's menu.
    gBrowser.tabpanels.addEventListener(
      "command",
      event => {
        const footer = event.target.closest?.("split-view-footer");
        if (
          !this.enabled ||
          !footer ||
          event.target.localName != "toolbarbutton"
        ) {
          return;
        }
        event.stopPropagation();
        const panelEl = footer.closest(".split-view-panel");
        const tab = gBrowser.tabs.find(t => t.linkedPanel == panelEl?.id);
        this.openPanel(win, { tab, anchor: event.target });
      },
      true
    );

    this.apply(win);
  },

  _updateRoot(win) {
    win.document.documentElement.toggleAttribute(
      "nirva-split-on",
      this.enabled
    );
  },

  _addIslandButton(win) {
    const doc = win.document;
    const container = doc.querySelector("#urlbar .urlbar-input-container");
    if (!container) {
      return;
    }
    const button = el(doc, "button", {
      id: "nirva-split-button",
      type: "button",
      l10n: "nirva-split-island-button",
    });
    button.append(splitIcon(doc));
    button.addEventListener("mousedown", () => {
      this._windows.get(win).pressedWhileOpen = !!this._windows.get(win).panel;
    });
    button.addEventListener("click", () => this.toggle(win));
    container.append(button);
    this._windows.get(win).button = button;
  },

  _decorateTab(tab) {
    if (tab.querySelector(".nirva-split-tab-button")) {
      return;
    }
    const close = tab.querySelector(".tab-close-button");
    if (!close) {
      return;
    }
    const doc = tab.ownerDocument;
    const button = el(doc, "button", {
      className: "nirva-split-tab-button",
      type: "button",
      tabindex: "-1",
      draggable: "false",
      l10n: "nirva-split-tab-button",
    });
    button.append(splitIcon(doc));
    const stop = event => {
      event.stopPropagation();
      if (event.type != "click") {
        event.preventDefault();
      }
    };
    button.addEventListener("mousedown", stop);
    button.addEventListener("dblclick", stop);
    button.addEventListener("click", event => {
      stop(event);
      const win = doc.defaultView;
      this.startFromTab(win, tab);
    });
    close.before(button);
  },

  // ---------- Layout model per split view ----------

  /**
   * The layout and the pane order of one Firefox split view, rebuilt from the session on
   * first use and kept in step when tabs join or leave.
   *
   * @param {MozTabSplitViewWrapper} wrapper
   */
  modelFor(wrapper) {
    const tabs = wrapper.tabs;
    let model = this._models.get(wrapper);
    if (!model) {
      model = this._restore(wrapper, tabs);
      this._models.set(wrapper, model);
    }
    const slots = model.slots.filter(tab => tabs.includes(tab));
    for (const tab of tabs) {
      if (!slots.includes(tab)) {
        slots.push(tab);
      }
    }
    model.slots = slots;
    const count = Math.min(MAX_PANES, Math.max(2, slots.length));
    if (model.layout.count != count) {
      model.layout = new SplitLayout(count, model.layout.shape);
    }
    return model;
  },

  _restore(wrapper, tabs) {
    const saved = tabs.map(tab => {
      try {
        return JSON.parse(
          lazy.SessionStore.getCustomTabValue(tab, SESSION_KEY) || "null"
        );
      } catch (_error) {
        return null;
      }
    });
    const usable =
      saved.every(data => data?.id == wrapper.splitViewId) &&
      saved[0]?.layout?.count == tabs.length;
    if (!usable) {
      return { layout: new SplitLayout(tabs.length), slots: [...tabs] };
    }
    const slots = [...tabs].sort(
      (a, b) => saved[tabs.indexOf(a)].slot - saved[tabs.indexOf(b)].slot
    );
    return {
      layout: SplitLayout.fromJSON(saved[0].layout, tabs.length),
      slots,
    };
  },

  _save(wrapper) {
    const model = this._models.get(wrapper);
    if (!model) {
      return;
    }
    const layout = model.layout.toJSON();
    model.slots.forEach((tab, slot) => {
      try {
        lazy.SessionStore.setCustomTabValue(
          tab,
          SESSION_KEY,
          JSON.stringify({ id: wrapper.splitViewId, slot, layout })
        );
      } catch (_error) {}
    });
  },

  /**
   * The split view shown in this window, when Nirva lays it out.
   *
   * @param {Window} win
   */
  activeWrapper(win) {
    const wrapper = win.gBrowser?.selectedTab?.splitview;
    return this.enabled && wrapper?.tabs.length >= 2 ? wrapper : null;
  },

  _metrics(win) {
    const panels = win.gBrowser.tabpanels;
    const box = panels.getBoundingClientRect();
    const gap =
      parseFloat(
        win.getComputedStyle(panels).getPropertyValue("--nirva-split-gap")
      ) || 12;
    return {
      box,
      width: Math.round(box.width),
      height: Math.round(box.height),
      gap,
    };
  },

  _schedule(win) {
    const state = this._windows.get(win);
    if (!state || state.frame) {
      return;
    }
    state.frame = win.requestAnimationFrame(() => {
      state.frame = 0;
      this.apply(win);
    });
  },

  /**
   * Places the panes and dividers of the shown split view, or removes them.
   *
   * @param {Window} win
   */
  apply(win) {
    const state = this._windows.get(win);
    if (!state) {
      return;
    }
    const { gBrowser, document: doc } = win;
    const panels = gBrowser.tabpanels;
    const wrapper = this.activeWrapper(win);
    state.button?.toggleAttribute("active", !!wrapper);
    if (!wrapper) {
      this._clearPanes(win);
      return;
    }
    const model = this.modelFor(wrapper);
    const metrics = this._metrics(win);
    const geometry = model.layout.compute(metrics);
    panels.setAttribute("nirva-split", model.layout.shape);
    panels.setAttribute("nirva-split-count", String(model.layout.count));

    const styled = new Set();
    model.slots.forEach((tab, slot) => {
      const panel = doc.getElementById(tab.linkedPanel);
      const rect = geometry.panes[slot];
      if (panel && rect) {
        place(panel, rect);
        panel.setAttribute("nirva-split-slot", String(slot));
        styled.add(panel);
      }
    });
    for (const panel of state.styled) {
      if (!styled.has(panel)) {
        this._unplace(panel);
      }
    }
    state.styled = styled;
    state.wrapper = wrapper;
    this._drawDividers(win, metrics, geometry);
  },

  _unplace(panel) {
    for (const prop of ["left", "top", "width", "height"]) {
      panel.style.removeProperty(prop);
    }
    panel.removeAttribute("nirva-split-slot");
  },

  _clearPanes(win) {
    const state = this._windows.get(win);
    const panels = win.gBrowser.tabpanels;
    panels.removeAttribute("nirva-split");
    panels.removeAttribute("nirva-split-count");
    for (const panel of state.styled) {
      this._unplace(panel);
    }
    state.styled = new Set();
    state.overlay.hidden = true;
    state.overlay.replaceChildren();
  },

  // ---------- Dividers ----------

  _drawDividers(win, metrics, geometry) {
    const state = this._windows.get(win);
    const doc = win.document;
    const overlay = state.overlay;
    place(overlay, {
      x: Math.round(metrics.box.left),
      y: Math.round(metrics.box.top),
      w: metrics.width,
      h: metrics.height,
    });
    overlay.hidden = false;

    const wanted = new Set();
    for (const divider of geometry.dividers) {
      const key = `d${divider.id}`;
      wanted.add(key);
      let node = [...overlay.children].find(n => n.dataset.key == key);
      if (!node) {
        node = el(doc, "div", {
          className: "nirva-split-divider",
          role: "separator",
          tabindex: "0",
          l10n: "nirva-split-divider",
        });
        node.dataset.key = key;
        node.append(el(doc, "div", { className: "nirva-split-grip" }));
        this._wireHandle(win, node, () => [node.dataset.id]);
        overlay.append(node);
      }
      node.dataset.id = divider.id;
      node.dataset.axis = divider.axis;
      node.setAttribute(
        "aria-orientation",
        divider.axis == "x" ? "vertical" : "horizontal"
      );
      place(node, divider);
    }
    for (const cross of geometry.crosses) {
      const key = `c${cross.ids.join("|")}`;
      wanted.add(key);
      let node = [...overlay.children].find(n => n.dataset.key == key);
      if (!node) {
        node = el(doc, "div", {
          className: "nirva-split-cross",
          role: "separator",
          tabindex: "0",
          l10n: "nirva-split-cross",
        });
        node.dataset.key = key;
        this._wireHandle(win, node, () => cross.ids);
        overlay.append(node);
      }
      node.style.left = `${cross.x}px`;
      node.style.top = `${cross.y}px`;
    }
    for (const node of [...overlay.children]) {
      if (!wanted.has(node.dataset.key)) {
        node.remove();
      }
    }
  },

  _wireHandle(win, node, idsOf) {
    const state = this._windows.get(win);
    node.addEventListener("pointerdown", event => {
      if (event.button != 0) {
        return;
      }
      const wrapper = this.activeWrapper(win);
      if (!wrapper) {
        return;
      }
      event.preventDefault();
      node.setPointerCapture(event.pointerId);
      node.toggleAttribute("dragging", true);
      win.document.documentElement.setAttribute(
        "nirva-split-dragging",
        node.dataset.axis ?? "xy"
      );
      state.drag = {
        node,
        ids: idsOf(),
        wrapper,
        x: event.clientX,
        y: event.clientY,
      };
    });
    node.addEventListener("pointermove", event => {
      const drag = state.drag;
      if (!drag || drag.node !== node) {
        return;
      }
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (!drag.frame) {
        drag.frame = win.requestAnimationFrame(() => {
          drag.frame = 0;
          this._dragTo(win, drag);
        });
      }
    });
    const end = () => {
      const drag = state.drag;
      if (!drag || drag.node !== node) {
        return;
      }
      if (drag.frame) {
        win.cancelAnimationFrame(drag.frame);
        this._dragTo(win, drag);
      }
      state.drag = null;
      node.removeAttribute("dragging");
      node.removeAttribute("snapped");
      win.document.documentElement.removeAttribute("nirva-split-dragging");
      this._save(drag.wrapper);
      this.apply(win);
    };
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
    node.addEventListener("lostpointercapture", end);
    node.addEventListener("dblclick", () => {
      const wrapper = this.activeWrapper(win);
      if (wrapper) {
        const { layout } = this.modelFor(wrapper);
        idsOf().forEach(id => layout.equalizeAt(id));
        this.apply(win);
        this._save(wrapper);
      }
    });
    node.addEventListener("keydown", event =>
      this._onHandleKey(win, event, idsOf())
    );
  },

  _dragTo(win, drag) {
    const { layout } = this.modelFor(drag.wrapper);
    const metrics = this._metrics(win);
    let snapped = false;
    for (const id of drag.ids) {
      const divider = layout.compute(metrics).dividers.find(d => d.id == id);
      if (!divider) {
        continue;
      }
      const position =
        divider.axis == "x"
          ? drag.x - metrics.box.left
          : drag.y - metrics.box.top;
      const result = layout.moveDivider(id, position, metrics, {
        snap: this.snapping,
      });
      snapped ||= result.snapped !== null;
    }
    drag.node.toggleAttribute("snapped", snapped);
    this.apply(win);
  },

  _onHandleKey(win, event, ids) {
    const wrapper = this.activeWrapper(win);
    if (!wrapper) {
      return;
    }
    const { layout } = this.modelFor(wrapper);
    const metrics = this._metrics(win);
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const moves = {
      ArrowLeft: ["x", -step],
      ArrowRight: ["x", step],
      ArrowUp: ["y", -step],
      ArrowDown: ["y", step],
    };
    if (event.key == "Enter" || event.key == " ") {
      ids.forEach(id => layout.equalizeAt(id));
    } else if (moves[event.key]) {
      const [axis, delta] = moves[event.key];
      const rtl = win.document.dir == "rtl" && axis == "x" ? -1 : 1;
      let moved = false;
      for (const id of ids) {
        const divider = layout.compute(metrics).dividers.find(d => d.id == id);
        if (divider?.axis == axis) {
          moved = layout.nudge(id, delta * rtl, metrics).moved || moved;
        }
      }
      if (!moved) {
        return;
      }
    } else {
      return;
    }
    event.preventDefault();
    this.apply(win);
    this._save(wrapper);
  },

  // ---------- Ways in ----------

  _eligible(tab, wrapper = null) {
    return (
      !!tab &&
      !tab.pinned &&
      !tab.hidden &&
      !tab.closing &&
      (!tab.splitview || tab.splitview === wrapper)
    );
  },

  /**
   * The button on a sidebar tab: opens straight away when two to four tabs are selected
   * together, and otherwise opens the split panel beside the tab with it ticked.
   *
   * @param {Window} win
   * @param {MozTabbrowserTab} tab
   */
  startFromTab(win, tab) {
    if (!this.enabled) {
      return;
    }
    const chosen = win.gBrowser.selectedTabs.filter(t => this._eligible(t));
    if (!tab.splitview && chosen.length >= 2 && chosen.includes(tab)) {
      const tabs = [tab, ...chosen.filter(t => t !== tab)].slice(0, MAX_PANES);
      this.openSplit(win, tabs);
      return;
    }
    this.openPanel(win, { tab, anchor: tab });
  },

  /**
   * The island button: opens or closes the split panel for the tab in front.
   *
   * @param {Window} win
   */
  toggle(win) {
    const state = this._windows.get(win);
    // Pressing the button while the panel is open closes it (as for any menu); the click
    // that follows must not open it again.
    const wasOpen = state.pressedWhileOpen;
    state.pressedWhileOpen = false;
    if (state.panel) {
      this.closePanel(win);
    } else if (!wasOpen) {
      this.openPanel(win, { anchor: state.button });
    }
  },

  /**
   * Shows the given tabs together at once.
   *
   * @param {Window} win
   * @param {MozTabbrowserTab[]} tabs two to four tabs; the first one becomes pane 1
   * @param {string} [shape]
   */
  openSplit(win, tabs, shape) {
    const { gBrowser } = win;
    tabs = tabs.filter(t => this._eligible(t)).slice(0, MAX_PANES);
    if (tabs.length < 2) {
      return null;
    }
    const wrapper = gBrowser.addTabSplitView(tabs, { insertBefore: tabs[0] });
    if (!wrapper) {
      return null;
    }
    this._models.set(wrapper, {
      layout: new SplitLayout(tabs.length, shape),
      slots: [...tabs],
    });
    if (gBrowser.selectedTab.splitview !== wrapper) {
      gBrowser.selectedTab = tabs[0];
    }
    this._save(wrapper);
    this.apply(win);
    return wrapper;
  },

  /**
   * Adds tabs to an existing split and puts the panes in the given order and shape.
   *
   * @param {Window} win
   * @param {MozTabSplitViewWrapper} wrapper
   * @param {MozTabbrowserTab[]} tabs every tab the split should hold, in pane order
   * @param {string} [shape]
   */
  rearrange(win, wrapper, tabs, shape) {
    tabs = tabs.slice(0, MAX_PANES);
    if (tabs.length < 2) {
      this.separate(win, wrapper);
      return;
    }
    for (const tab of wrapper.tabs.filter(t => !tabs.includes(t))) {
      this.takeOut(win, tab);
    }
    const added = tabs.filter(t => !wrapper.tabs.includes(t));
    if (added.length) {
      wrapper.addTabs(added);
    }
    const model = this.modelFor(wrapper);
    const sameLayout =
      model.layout.count == tabs.length && model.layout.shape == shape;
    model.slots = tabs.filter(t => t.splitview === wrapper);
    if (!sameLayout) {
      model.layout = new SplitLayout(model.slots.length, shape);
    }
    if (win.gBrowser.selectedTab.splitview !== wrapper) {
      win.gBrowser.selectedTab = model.slots[0];
    }
    this._save(wrapper);
    this.apply(win);
  },

  // ---------- Arranging ----------

  evenSizes(win) {
    const wrapper = this.activeWrapper(win);
    if (wrapper) {
      this.modelFor(wrapper).layout.equalize();
      this.apply(win);
      this._save(wrapper);
    }
  },

  /**
   * Moves one tab out of its split; the rest stay together.
   *
   * @param {Window} win
   * @param {MozTabbrowserTab} tab
   */
  takeOut(win, tab) {
    const wrapper = tab?.splitview;
    if (!wrapper) {
      return;
    }
    const { gBrowser } = win;
    if (tab.selected) {
      const other = wrapper.tabs.find(t => t !== tab);
      if (other && wrapper.tabs.length > 2) {
        gBrowser.selectedTab = other;
      }
    }
    gBrowser.handleTabMove(tab, () => wrapper.after(tab));
    try {
      lazy.SessionStore.deleteCustomTabValue(tab, SESSION_KEY);
    } catch (_error) {}
    this._schedule(win);
  },

  /**
   * Ends a split: its tabs become ordinary tabs again.
   *
   * @param {Window} win
   * @param {MozTabSplitViewWrapper} [wrapper] the split in front when not given
   */
  separate(win, wrapper = win.gBrowser.selectedTab?.splitview) {
    if (wrapper) {
      this.closePanel(win);
      wrapper.unsplitTabs();
    }
  },

  // ---------- The split panel ----------

  /**
   * Opens the split panel: every open tab to tick (up to four), the layout choices and the
   * actions, in one small rectangle beside what opened it.
   *
   * @param {Window} win
   * @param {object} [options]
   * @param {MozTabbrowserTab} [options.tab] the tab it is about; the tab in front otherwise
   * @param {Element} [options.anchor] what to open beside
   */
  openPanel(win, { tab = null, anchor = null } = {}) {
    const state = this._windows.get(win);
    if (!state || !this.enabled) {
      return;
    }
    const { gBrowser } = win;
    tab ??= gBrowser.selectedTab;
    const wrapper = tab.splitview?.tabs.length >= 2 ? tab.splitview : null;
    if (wrapper && gBrowser.selectedTab.splitview !== wrapper) {
      gBrowser.selectedTab = tab;
    }
    let draft = [];
    let shape;
    if (wrapper) {
      const model = this.modelFor(wrapper);
      draft = model.slots.slice(0, MAX_PANES);
      shape = model.layout.shape;
    } else {
      if (this._eligible(tab)) {
        draft.push(tab);
      }
      shape = SplitLayout.defaultShape(2);
    }
    state.panel = {
      wrapper,
      draft,
      original: [...draft],
      shape,
      originalShape: shape,
      shapeChosen: false,
      anchor,
    };
    state.button?.setAttribute("open", "true");
    this._renderPanel(win);
    state.panelNode.hidden = false;
    this._openPopup(win);
  },

  closePanel(win) {
    const state = this._windows.get(win);
    if (!state?.panel) {
      return;
    }
    state.panel = null;
    state.panelNode.replaceChildren();
    state.button?.removeAttribute("open");
    state.popup.hidePopup();
  },

  isPanelOpen(win) {
    return !!this._windows.get(win)?.panel;
  },

  _changed(panel) {
    return (
      panel.shape != panel.originalShape ||
      panel.draft.length != panel.original.length ||
      panel.draft.some((tab, i) => tab !== panel.original[i])
    );
  },

  _toggleDraft(win, tab) {
    const panel = this._windows.get(win).panel;
    const at = panel.draft.indexOf(tab);
    if (at >= 0) {
      panel.draft.splice(at, 1);
    } else if (panel.draft.length < MAX_PANES) {
      panel.draft.push(tab);
    } else {
      return;
    }
    const count = Math.max(2, panel.draft.length);
    if (!panel.shapeChosen || !SHAPES[count].includes(panel.shape)) {
      panel.shape = SplitLayout.defaultShape(count);
    }
    this._renderPanel(win, tab);
  },

  _moveUp(win, index) {
    const panel = this._windows.get(win).panel;
    if (index > 0) {
      const list = panel.draft;
      [list[index - 1], list[index]] = [list[index], list[index - 1]];
      this._renderPanel(win, list[index - 1]);
    }
  },

  _setDraftShape(win, shape) {
    const panel = this._windows.get(win).panel;
    panel.shape = shape;
    panel.shapeChosen = true;
    this._renderPanel(win);
  },

  /**
   * Opens, changes or ends the split as ticked in the panel.
   *
   * @param {Window} win
   */
  applyPanel(win) {
    const panel = this._windows.get(win)?.panel;
    if (!panel) {
      return;
    }
    const { wrapper, draft, shape } = panel;
    this.closePanel(win);
    if (wrapper?.isConnected && wrapper.tabs.length >= 2) {
      this.rearrange(win, wrapper, draft, shape);
    } else if (draft.length >= 2) {
      this.openSplit(win, draft, shape);
    }
  },

  _renderPanel(win, focusTab = null) {
    const state = this._windows.get(win);
    const panel = state.panel;
    const doc = win.document;
    const node = state.panelNode;
    if (!panel) {
      return;
    }
    const { gBrowser } = win;
    const count = Math.max(2, panel.draft.length);

    const head = el(doc, "div", { className: "nirva-split-head" });
    const title = el(doc, "span", {
      id: "nirva-split-title",
      className: "nirva-split-eyebrow",
      l10n: "nirva-split-eyebrow",
    });
    const tally = el(doc, "span", {
      className: "nirva-split-tally",
      "aria-live": "polite",
      l10n: ["nirva-split-tally", { count: panel.draft.length }],
    });
    head.append(title, tally);

    const list = el(doc, "div", {
      className: "nirva-split-list",
      role: "group",
      l10n: "nirva-split-list",
    });
    const full = panel.draft.length >= MAX_PANES;
    for (const tab of gBrowser.visibleTabs) {
      if (!this._eligible(tab, panel.wrapper)) {
        continue;
      }
      const position = panel.draft.indexOf(tab);
      const row = el(doc, "div", { className: "nirva-split-row" });
      row.toggleAttribute("checked", position >= 0);
      const main = el(doc, "button", {
        className: "nirva-split-row-main",
        type: "button",
        role: "checkbox",
        "aria-checked": String(position >= 0),
      });
      main.disabled = full && position < 0;
      const mark = el(doc, "span", { className: "nirva-split-mark" });
      mark.textContent = position >= 0 ? String(position + 1) : "";
      const icon = el(doc, "img", {
        className: "nirva-split-row-icon",
        alt: "",
        src: tab.getAttribute("image") || DEFAULT_ICON,
      });
      const label = el(doc, "span", { className: "nirva-split-row-label" });
      label.textContent = tab.label;
      main.append(mark, icon, label);
      main.addEventListener("click", () => this._toggleDraft(win, tab));
      row.append(main);
      if (position > 0) {
        const up = el(doc, "button", {
          className: "nirva-split-up",
          type: "button",
          l10n: ["nirva-split-move-up", { place: position }],
        });
        up.append(arrowUpIcon(doc));
        up.addEventListener("click", () => this._moveUp(win, position));
        row.append(up);
      }
      list.append(row);
      if (tab === focusTab) {
        win.requestAnimationFrame(() => main.focus());
      }
    }

    const layoutLabel = el(doc, "span", {
      className: "nirva-split-eyebrow",
      l10n: "nirva-split-layout",
    });
    const shapes = el(doc, "div", {
      className: "nirva-split-shapes",
      role: "radiogroup",
    });
    for (const shape of SHAPES[count]) {
      const chip = el(doc, "button", {
        className: "nirva-split-shape",
        type: "button",
        role: "radio",
        "aria-checked": String(shape == panel.shape),
        l10n: `nirva-split-shape-${shape}`,
      });
      chip.dataset.shape = shape;
      const mini = el(doc, "span", { className: "nirva-split-mini" });
      const geometry = new SplitLayout(count, shape).compute({
        width: CHIP_WIDTH,
        height: CHIP_HEIGHT,
        gap: 3,
      });
      geometry.panes.forEach((rect, i) => {
        const cell = el(doc, "span", { className: "nirva-split-mini-pane" });
        cell.textContent = String(i + 1);
        place(cell, rect);
        mini.append(cell);
      });
      chip.append(mini);
      chip.addEventListener("click", () => this._setDraftShape(win, shape));
      shapes.append(chip);
    }

    const actions = el(doc, "div", { className: "nirva-split-actions" });
    const action = (l10n, run, { primary = false, disabled = false } = {}) => {
      const button = el(doc, "button", {
        className: "nirva-split-action",
        type: "button",
        l10n,
      });
      button.dataset.action = l10n.replace("nirva-split-", "");
      button.toggleAttribute("primary", primary);
      button.disabled = disabled;
      button.addEventListener("click", run);
      actions.append(button);
      return button;
    };
    const spacer = () =>
      actions.append(el(doc, "span", { className: "nirva-split-spacer" }));
    if (panel.wrapper) {
      action("nirva-split-even", () => {
        this.evenSizes(win);
        this.closePanel(win);
      });
      action("nirva-split-separate", () => this.separate(win, panel.wrapper));
      spacer();
      if (this._changed(panel)) {
        action("nirva-split-apply", () => this.applyPanel(win), {
          primary: true,
        });
      } else {
        action("nirva-split-done", () => this.closePanel(win), {
          primary: true,
        });
      }
    } else {
      action("nirva-split-cancel", () => this.closePanel(win));
      spacer();
      action("nirva-split-open", () => this.applyPanel(win), {
        primary: true,
        disabled: panel.draft.length < 2,
      });
    }

    const scroll = node.querySelector(".nirva-split-list")?.scrollTop ?? 0;
    node.replaceChildren(head, list, layoutLabel, shapes, actions);
    list.scrollTop = scroll;
  },

  /**
   * Opens the pop-up beside its anchor: right of a tab, under a button, above a footer.
   *
   * @param {Window} win
   */
  _openPopup(win) {
    const state = this._windows.get(win);
    const anchor = state.panel?.anchor;
    const rect = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
    const gap = 8;
    if (rect?.width && anchor.closest?.(".tabbrowser-tab")) {
      state.popup.openPopup(anchor, "end_before", gap, 0);
    } else if (rect?.width && anchor.closest?.("split-view-footer")) {
      state.popup.openPopup(anchor, "before_end", 0, -gap);
    } else if (rect?.width) {
      state.popup.openPopup(anchor, "after_end", 0, gap);
    } else {
      const box = win.gBrowser.tabpanels.getBoundingClientRect();
      state.popup.openPopup(
        win.gBrowser.tabpanels,
        "overlap",
        Math.round((box.width - 320) / 2),
        gap * 2
      );
    }
  },

  _onTabClose(win, tab) {
    const panel = this._windows.get(win)?.panel;
    if (!panel) {
      return;
    }
    panel.draft = panel.draft.filter(t => t !== tab);
    panel.original = panel.original.filter(t => t !== tab);
    this._renderPanel(win);
  },

  // ---------- Firefox's own split menus ----------

  /**
   * The tab menu holds one Nirva item in place of Firefox's split items.
   *
   * @param {Window} win
   * @param {Event} event popupshowing of the tab context menu
   */
  _onTabMenu(win, event) {
    if (event.target !== event.currentTarget) {
      return;
    }
    const item = win.document.getElementById("context_nirvaSplit");
    const tab = win.TabContextMenu?.contextTab;
    if (!item) {
      return;
    }
    item.hidden = !this.enabled || !tab || tab.pinned;
    win.document.l10n.setAttributes(
      item,
      tab?.splitview ? "nirva-split-context-arrange" : "nirva-split-context"
    );
  },

  /**
   * "Open link in split view" in the page menu: the link joins the split of the page it
   * was on when there is room, otherwise it makes a split of two with that page.
   *
   * @param {Window} win
   */
  _openLinkInSplit(win) {
    const menu = win.gContextMenu;
    const { gBrowser } = win;
    const from = menu && gBrowser.getTabForBrowser(menu.browser);
    if (!from) {
      return;
    }
    const params = menu._openLinkInParameters({
      userContextId: from.userContextId,
      ...menu._getGlobalHistoryOptions(),
      inBackground: false,
      resolveOnNewTabCreated: browser => {
        const linkTab = gBrowser.getTabForBrowser(browser);
        if (!linkTab) {
          return;
        }
        const wrapper = from.splitview;
        if (wrapper && wrapper.tabs.length < MAX_PANES) {
          const model = this.modelFor(wrapper);
          this.rearrange(
            win,
            wrapper,
            [...model.slots, linkTab],
            model.layout.shape
          );
        } else {
          this.openSplit(win, [from, linkTab]);
        }
        gBrowser.selectedTab = linkTab;
      },
    });
    win.openLinkIn(menu.linkURL, "tab", params);
  },

  _addMenuItems(win) {
    const doc = win.document;
    const tabMenu = doc.getElementById("tabContextMenu");
    const firefoxItem = doc.getElementById("context_moveTabToSplitView");
    if (tabMenu && firefoxItem && !doc.getElementById("context_nirvaSplit")) {
      const item = doc.createXULElement("menuitem");
      item.id = "context_nirvaSplit";
      doc.l10n.setAttributes(item, "nirva-split-context");
      item.addEventListener("command", () => {
        const tab = win.TabContextMenu?.contextTab;
        this.openPanel(win, { tab, anchor: tab });
      });
      firefoxItem.before(item);
      tabMenu.addEventListener("popupshowing", e => this._onTabMenu(win, e));
    }
    const pageMenu = doc.getElementById("contentAreaContextMenu");
    const linkItem = doc.getElementById("context-openlinkinsplitview");
    if (
      pageMenu &&
      linkItem &&
      !doc.getElementById("context-nirva-openlinksplit")
    ) {
      const item = doc.createXULElement("menuitem");
      item.id = "context-nirva-openlinksplit";
      doc.l10n.setAttributes(item, "nirva-split-open-link");
      item.addEventListener("command", () => this._openLinkInSplit(win));
      linkItem.after(item);
      pageMenu.addEventListener("popupshowing", event => {
        if (event.target === pageMenu) {
          item.hidden = !this.enabled || linkItem.hidden;
        }
      });
    }
  },

  // ---------- Commands ----------

  _recentTabs(win) {
    const { gBrowser } = win;
    return gBrowser.visibleTabs
      .filter(t => t !== gBrowser.selectedTab && this._eligible(t))
      .sort((a, b) => b.lastAccessed - a.lastAccessed);
  },

  _registerCommands() {
    const canStart = win =>
      this.enabled &&
      !win.gBrowser.selectedTab.splitview &&
      this._eligible(win.gBrowser.selectedTab);
    const inSplit = win => this.enabled && !!this.activeWrapper(win);
    for (const command of [
      {
        id: "split-choose",
        l10nId: "nirva-command-split-choose",
        keywords: "split view side by side tabs together screen tile grid",
        isAvailable: canStart,
        run: win => this.openPanel(win),
      },
      {
        id: "split-recent-2",
        l10nId: "nirva-command-split-recent-2",
        keywords: "split view side by side last tab two",
        isAvailable: win => canStart(win) && this._recentTabs(win).length >= 1,
        run: win =>
          this.openSplit(win, [
            win.gBrowser.selectedTab,
            this._recentTabs(win)[0],
          ]),
      },
      {
        id: "split-recent-4",
        l10nId: "nirva-command-split-recent-4",
        keywords: "split view grid four tabs recent quad",
        isAvailable: win => canStart(win) && this._recentTabs(win).length >= 3,
        run: win =>
          this.openSplit(
            win,
            [win.gBrowser.selectedTab, ...this._recentTabs(win).slice(0, 3)],
            "grid"
          ),
      },
      {
        id: "split-arrange",
        l10nId: "nirva-command-split-arrange",
        keywords: "split view layout arrange resize swap",
        isAvailable: inSplit,
        run: win => this.openPanel(win),
      },
      {
        id: "split-even",
        l10nId: "nirva-command-split-even",
        keywords: "split view even equal sizes reset",
        isAvailable: inSplit,
        run: win => this.evenSizes(win),
      },
      {
        id: "split-separate",
        l10nId: "nirva-command-split-separate",
        keywords: "split view separate unsplit close end",
        isAvailable: win =>
          this.enabled && !!win.gBrowser.selectedTab.splitview,
        run: win => this.separate(win),
      },
      {
        id: "split-off",
        l10nId: "nirva-command-split-off",
        keywords: "split view layouts turn off disable",
        isAvailable: () => this.enabled,
        run: () => (this.enabled = false),
      },
      {
        id: "split-on",
        l10nId: "nirva-command-split-on",
        keywords: "split view layouts turn on enable",
        isAvailable: () => !this.enabled,
        run: () => (this.enabled = true),
      },
    ]) {
      lazy.NirvaCommands.register({ feature: "split", ...command });
    }
  },
};
