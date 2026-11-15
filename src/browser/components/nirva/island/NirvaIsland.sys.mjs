/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const lazy = {};
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["browser/nirva/island.ftl"], true)
);

const PREF_ENABLED = "nirva.island.enabled";
const PREF_LINGER = "nirva.island.lingerMs";
const HTML_NS = "http://www.w3.org/1999/xhtml";
// The island's lower edge: 32 px from the top plus its 48 px height (designs/Main.html).
const REVEAL_ZONE = 80;

/**
 * The island toolbar (S3): Firefox's navigation toolbar drawn as a floating pill centred over
 * the page. It shrinks to a thin line when the page is scrolled down and returns on scrolling
 * up, when the pointer nears the top edge, or when the address is focused. While a page
 * loads, a line of accent colour sweeps along its lower edge (A3).
 *
 * On websites it is compact and tucks away so the page has the whole window: it shows the
 * address for a moment on arrival, then the page card slides up into its place. The pointer
 * at the top edge, scrolling back to the top of the page, or Ctrl+L bring it back, and the page
 * card slides down to make room, so the island never covers the site.
 *
 * The look is in browser/themes/shared/nirva/island.css and hangs off these attributes on the
 * window root: nirva-island, nirva-island-collapsed, nirva-island-loading.
 */
export const NirvaIsland = {
  _initialized: false,
  _windows: new WeakMap(),

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    ChromeUtils.registerWindowActor("NirvaIsland", {
      parent: {
        esModuleURI:
          "moz-src:///browser/components/nirva/island/NirvaIslandParent.sys.mjs",
      },
      child: {
        esModuleURI:
          "moz-src:///browser/components/nirva/island/NirvaIslandChild.sys.mjs",
        events: { scroll: { capture: true } },
      },
      messageManagerGroups: ["browsers"],
      // The page side only reports "top", "down" or "up", and the window side accepts
      // nothing else, so a misbehaving page can do no more than move the island.
      safeForUntrustedWebProcess: true,
    });
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.prefs.addObserver(PREF_ENABLED, this);
    NirvaCommands.register({
      id: "island-focus",
      feature: "island",
      l10nId: "nirva-command-island-focus",
      keywords: "url location address bar toolbar",
      run: win => {
        this.expand(win);
        win.gURLBar.select();
      },
    });
  },

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  observe(subject, topic) {
    if (topic == "browser-delayed-startup-finished") {
      this.initWindow(subject);
    } else if (topic == "nsPref:changed") {
      for (const win of Services.wm.getEnumerator("navigator:browser")) {
        if (!win.closed && this._windows.has(win)) {
          this._applyEnabled(win);
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
    const state = { lingerTimer: null, pointerInside: false };
    this._windows.set(win, state);
    const toolbox = doc.getElementById("navigator-toolbox");
    const html = (tag, id) => {
      const el = doc.createElementNS(HTML_NS, tag);
      el.id = id;
      return el;
    };

    // The loading sweep: a clipped track along the island's lower edge with one moving line.
    const sweep = html("div", "nirva-island-sweep");
    sweep.setAttribute("aria-hidden", "true");
    sweep.append(doc.createElementNS(HTML_NS, "span"));
    toolbox.append(sweep);

    // The thin line the island shrinks to. Clicking it brings the island back.
    const line = html("button", "nirva-island-line");
    line.setAttribute(
      "aria-label",
      lazy.l10n.formatValueSync("nirva-island-line-label")
    );
    line.addEventListener("click", () => this.expand(win));
    toolbox.after(line);

    // The address at rest: site name in medium weight, the rest quieter, centred.
    const address = html("div", "nirva-island-address");
    address.setAttribute("aria-hidden", "true");
    address.append(
      Object.assign(doc.createElementNS(HTML_NS, "span"), {
        className: "nirva-address-site",
      }),
      Object.assign(doc.createElementNS(HTML_NS, "span"), {
        className: "nirva-address-rest",
      })
    );
    doc.querySelector("#urlbar .urlbar-input-box").append(address);

    // The top row of the sidebar holds the collapse button the design shows there.
    const top = html("div", "nirva-sidebar-top");
    const collapse = html("button", "nirva-sidebar-collapse");
    collapse.addEventListener("click", () =>
      win.SidebarController.handleToolbarButtonClick()
    );
    top.append(collapse);
    doc.getElementById("vertical-tabs").prepend(top);
    const sidebarMain = doc.querySelector("sidebar-main");
    const labelCollapse = () => {
      const label = lazy.l10n.formatValueSync(
        sidebarMain?.hasAttribute("expanded")
          ? "nirva-sidebar-collapse-label"
          : "nirva-sidebar-expand-label"
      );
      collapse.setAttribute("aria-label", label);
      collapse.title = label;
    };
    labelCollapse();
    if (sidebarMain) {
      new win.MutationObserver(labelCollapse).observe(sidebarMain, {
        attributes: true,
        attributeFilter: ["expanded"],
      });
    }

    // Keep the island centred over the page area, whatever the sidebar does.
    const tabbox = doc.getElementById("tabbrowser-tabbox");
    const place = () => {
      const rect = tabbox.getBoundingClientRect();
      const root = doc.documentElement;
      root.style.setProperty(
        "--nirva-island-center",
        `${rect.x + rect.width / 2}px`
      );
      root.style.setProperty("--nirva-content-width", `${rect.width}px`);
    };
    new win.ResizeObserver(place).observe(tabbox);
    win.addEventListener("resize", place);
    place();

    const { gBrowser } = win;
    const refresh = () => {
      this._updateLoading(win);
      this._updateAddress(win);
    };
    // A split view starting or ending changes whether the island may float.
    for (const type of [
      "TabSplitViewActivate",
      "TabSplitViewDeactivate",
      "SplitViewRemoved",
    ]) {
      gBrowser.tabContainer.addEventListener(type, () =>
        this._updateDocked(win)
      );
    }
    gBrowser.tabContainer.addEventListener("TabSelect", () => {
      refresh();
      this.expand(win, { linger: this._isDocked(win) });
      this._arrive(win);
    });
    gBrowser.tabContainer.addEventListener("TabAttrModified", event => {
      if (event.target.selected && event.detail.changed.includes("busy")) {
        this._updateLoading(win);
      }
    });
    gBrowser.addProgressListener({
      onLocationChange: (progress, request, uri, flags) => {
        if (!progress.isTopLevel) {
          return;
        }
        this._updateAddress(win);
        if (
          !(flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT)
        ) {
          // A new page starts at its top. On a website the address shows for a moment.
          this.expand(win, { linger: this._isDocked(win) });
        }
      },
    });

    // The pointer near the top edge of the page brings the island back.
    // Listening on the whole window covers the page and the thin line alike.
    win.addEventListener(
      "mousemove",
      event => {
        if (
          this.isCollapsed(win) &&
          event.clientY <= REVEAL_ZONE &&
          event.clientX >= tabbox.getBoundingClientRect().x
        ) {
          this.expand(win, { linger: true });
        }
      },
      true
    );
    toolbox.addEventListener("mouseenter", () => {
      state.pointerInside = true;
      win.clearTimeout(state.lingerTimer);
    });
    toolbox.addEventListener("mouseleave", () => {
      state.pointerInside = false;
      if (state.lingering) {
        this._linger(win);
      }
    });
    // Ctrl+L, or any other way of focusing the address.
    toolbox.addEventListener("focusin", () => this.expand(win));
    // Once the address is left on a website, the island tucks away again after a moment.
    toolbox.addEventListener("focusout", () => {
      win.setTimeout(() => {
        if (this._isDocked(win) && !this.isCollapsed(win)) {
          state.lingering = true;
          this._linger(win);
        }
      }, 0);
    });

    this._applyEnabled(win);
    refresh();
  },

  _applyEnabled(win) {
    const root = win.document.documentElement;
    root.toggleAttribute("nirva-island", this.enabled);
    if (!this.enabled) {
      root.removeAttribute("nirva-island-collapsed");
    }
  },

  _isDocked(win) {
    return win.document.documentElement.hasAttribute("nirva-island-docked");
  },

  /**
   * Sets the collapsed state. On websites the page card moves when the island comes or goes;
   * it is laid out once at its new place and then slides there from where it was, moving
   * only by transform so the site is not redrawn during the slide.
   *
   * @param {Window} win
   * @param {boolean} value
   */
  _setCollapsed(win, value) {
    const doc = win.document;
    const root = doc.documentElement;
    if (root.hasAttribute("nirva-island-collapsed") == value) {
      return;
    }
    const tabbox = doc.getElementById("tabbrowser-tabbox");
    const slide =
      this._isDocked(win) &&
      parseFloat(
        win.getComputedStyle(root).getPropertyValue("--nirva-motion-move")
      ) > 0;
    const before = slide ? tabbox.getBoundingClientRect().top : 0;
    root.toggleAttribute("nirva-island-collapsed", value);
    if (!slide) {
      return;
    }
    const delta = before - tabbox.getBoundingClientRect().top;
    if (Math.abs(delta) < 1) {
      return;
    }
    tabbox.style.transition = "none";
    tabbox.style.translate = `0 ${delta}px`;
    tabbox.getBoundingClientRect();
    tabbox.style.removeProperty("transition");
    tabbox.style.removeProperty("translate");
  },

  isCollapsed(win) {
    return win.document.documentElement.hasAttribute("nirva-island-collapsed");
  },

  /**
   * True while the island must not shrink: the owner is using it.
   *
   * @param {Window} win
   */
  _isBusy(win) {
    const doc = win.document;
    const toolbox = doc.getElementById("navigator-toolbox");
    return (
      this._windows.get(win)?.pointerInside ||
      toolbox.contains(doc.activeElement) ||
      !!toolbox.querySelector("[open='true'], [open=''], [popover-open]") ||
      doc.documentElement.hasAttribute("customizing")
    );
  },

  /**
   * Shrinks the island to its thin line.
   *
   * @param {Window} win
   * @returns {boolean} whether it shrank
   */
  collapse(win) {
    if (!this.enabled || this._isBusy(win)) {
      return false;
    }
    win.clearTimeout(this._windows.get(win).lingerTimer);
    this._setCollapsed(win, true);
    return true;
  },

  /**
   * Brings the island back.
   *
   * @param {Window} win
   * @param {object} [options]
   * @param {boolean} [options.linger] shrink again after a moment if the page is not at its
   *   top and the owner is not using the island
   */
  expand(win, { linger = false } = {}) {
    const state = this._windows.get(win);
    if (!state) {
      return;
    }
    win.clearTimeout(state.lingerTimer);
    this._setCollapsed(win, false);
    state.lingering = linger;
    if (linger) {
      this._linger(win);
    }
  },

  _linger(win) {
    const state = this._windows.get(win);
    win.clearTimeout(state.lingerTimer);
    state.lingerTimer = win.setTimeout(
      () => {
        if (!state.lingering) {
          return;
        }
        if (this.collapse(win)) {
          state.lingering = false;
        } else if (this._isDocked(win) && !state.pointerInside) {
          // On a website, try again once the address or its menus are no longer in use.
          this._linger(win);
        }
      },
      Services.prefs.getIntPref(PREF_LINGER, 2000)
    );
  },

  /**
   * Called when the page in the selected tab is scrolled.
   *
   * @param {Window} win
   * @param {"top"|"down"|"up"} scrollState
   */
  onPageScroll(win, scrollState) {
    if (!this._windows.has(win)) {
      return;
    }
    if (!["top", "down", "up"].includes(scrollState)) {
      return;
    }
    if (scrollState == "down") {
      this.collapse(win);
    } else if (this._isDocked(win)) {
      // On a website only reaching the top brings it back, and it then stays: mid-page the
      // page card would move under the reader's eyes.
      if (scrollState == "top") {
        this.expand(win);
      }
    } else {
      // At the top the island stays. After scrolling up it shows for a moment only, so it
      // does not sit on a page's own fixed header.
      this.expand(win, { linger: scrollState == "up" });
    }
  },

  _updateLoading(win) {
    win.document.documentElement.toggleAttribute(
      "nirva-island-loading",
      win.gBrowser.selectedTab.hasAttribute("busy")
    );
  },

  /**
   * Splits an address into the site and the rest, for display.
   *
   * @param {nsIURI} uri
   * @returns {{site: string, rest: string}} both empty when there is nothing worth showing
   */
  splitAddress(uri) {
    if (
      !uri ||
      ["about:blank", "about:newtab", "about:home"].includes(uri.spec)
    ) {
      return { site: "", rest: "" };
    }
    if (uri.schemeIs("http") || uri.schemeIs("https")) {
      let rest = uri.displayPrePath.endsWith(uri.displayHostPort)
        ? uri.displaySpec.slice(uri.displayPrePath.length)
        : uri.pathQueryRef;
      if (rest == "/") {
        rest = "";
      }
      return { site: uri.displayHostPort, rest };
    }
    return { site: uri.displaySpec, rest: "" };
  },

  /**
   * Plays the island's short float-in, as when a tab comes to the front.
   *
   * @param {Window} win
   * @returns {Promise<string[]>} the animations that ran, once they have finished
   */
  _arrive(win) {
    const state = this._windows.get(win);
    const root = win.document.documentElement;
    root.removeAttribute("nirva-island-arrive");
    const arrival = new Promise(resolve =>
      win.requestAnimationFrame(() =>
        win.requestAnimationFrame(async () => {
          if (!this.enabled) {
            resolve([]);
            return;
          }
          root.setAttribute("nirva-island-arrive", "");
          const animations = win.document
            .getElementById("navigator-toolbox")
            .getAnimations()
            .filter(a => a.animationName == "nirva-island-arrive");
          await Promise.allSettled(animations.map(a => a.finished));
          if (state?.arrival == arrival) {
            root.removeAttribute("nirva-island-arrive");
          }
          resolve(animations.map(a => a.animationName));
        })
      )
    );
    if (state) {
      state.arrival = arrival;
    }
    return arrival;
  },

  /**
   * On websites the island sits in its own strip above the page instead of over it; start
   * pages keep it floating over their own design. A split view counts as a website even
   * when the page in front is a start page: a floating island would cover the other panes.
   *
   * @param {Window} win
   */
  _updateDocked(win) {
    const root = win.document.documentElement;
    const { gBrowser } = win;
    const docked =
      this.enabled &&
      (!!gBrowser.selectedTab?.splitview ||
        !win.isInitialPage?.(gBrowser.currentURI));
    if (docked != root.hasAttribute("nirva-island-docked")) {
      root.toggleAttribute("nirva-island-docked", docked);
      this.expand(win, { linger: docked });
    }
  },

  _updateAddress(win) {
    this._updateDocked(win);
    const doc = win.document;
    const address = doc.getElementById("nirva-island-address");
    const uri = win.gBrowser.currentURI;
    // Start pages, such as a new burner tab's explainer, show no address.
    const { site, rest } = win.isInitialPage?.(uri)
      ? { site: "", rest: "" }
      : this.splitAddress(uri);
    address.children[0].textContent = site;
    address.children[1].textContent = rest;
    doc.getElementById("urlbar").toggleAttribute("nirva-has-address", !!site);
  },
};
