/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Geometry for a split view of two to four panes. A layout is a small tree: each node lays
 * its children out in a row or a column and holds their shares of the space, which always
 * add up to 1. Pane rectangles are computed in whole pixels with a fixed gap between them,
 * so neighbouring edges line up exactly. No DOM here: the window code draws the result.
 */

export const MIN_PANES = 2;
export const MAX_PANES = 4;

/** The shapes offered for each pane count, the first being the default. */
export const SHAPES = {
  2: ["cols", "rows"],
  3: ["main-left", "cols", "main-top"],
  4: ["grid", "main-left", "cols", "main-top"],
};

export const MIN_PANE_WIDTH = 200;
export const MIN_PANE_HEIGHT = 140;
export const SNAP_DISTANCE = 12;
const SNAP_POINTS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];

const even = n => Array.from({ length: n }, () => 1 / n);
const range = (from, to) =>
  Array.from({ length: to - from }, (_, i) => from + i);
const sum = list => list.reduce((a, b) => a + b, 0);

function makeTree(shape, count) {
  switch (shape) {
    case "rows":
      return { dir: "col", sizes: even(count), kids: range(0, count) };
    case "main-left":
      return {
        dir: "row",
        sizes: [0.5, 0.5],
        kids: [
          0,
          { dir: "col", sizes: even(count - 1), kids: range(1, count) },
        ],
      };
    case "main-top":
      return {
        dir: "col",
        sizes: [0.5, 0.5],
        kids: [
          0,
          { dir: "row", sizes: even(count - 1), kids: range(1, count) },
        ],
      };
    case "grid":
      // Reading order: top left, top right, bottom left, bottom right. The two columns
      // share one set of row sizes, so the middle line runs straight across.
      return {
        dir: "row",
        sizes: [0.5, 0.5],
        link: true,
        kids: [
          { dir: "col", sizes: [0.5, 0.5], kids: [0, 2] },
          { dir: "col", sizes: [0.5, 0.5], kids: [1, 3] },
        ],
      };
    default:
      return { dir: "row", sizes: even(count), kids: range(0, count) };
  }
}

function eachNode(node, fn) {
  fn(node);
  for (const kid of node.kids) {
    if (typeof kid == "object") {
      eachNode(kid, fn);
    }
  }
}

function validSizes(sizes, length) {
  return (
    Array.isArray(sizes) &&
    sizes.length == length &&
    sizes.every(s => Number.isFinite(s) && s > 0) &&
    Math.abs(sum(sizes) - 1) < 0.001
  );
}

/** The panes of one split view and their shares of the space. */
export class SplitLayout {
  /**
   * @param {number} count number of panes, 2 to 4
   * @param {string} [shape] one of SHAPES[count]; the default shape otherwise
   */
  constructor(count, shape) {
    this.setShape(count, shape);
  }

  static clampCount(count) {
    return Math.min(MAX_PANES, Math.max(MIN_PANES, count | 0));
  }

  static defaultShape(count) {
    return SHAPES[SplitLayout.clampCount(count)][0];
  }

  setShape(count, shape) {
    this.count = SplitLayout.clampCount(count);
    this.shape = SHAPES[this.count].includes(shape)
      ? shape
      : SplitLayout.defaultShape(this.count);
    this.tree = makeTree(this.shape, this.count);
  }

  toJSON() {
    const sizes = [];
    eachNode(this.tree, node => sizes.push([...node.sizes]));
    return { count: this.count, shape: this.shape, sizes };
  }

  /**
   * Rebuilds a saved layout. Saved sizes are used only when they still fit the shape.
   *
   * @param {object} data what toJSON returned
   * @param {number} count the number of panes now
   */
  static fromJSON(data, count) {
    const layout = new SplitLayout(count, data?.shape);
    if (
      data?.count == layout.count &&
      data.shape == layout.shape &&
      Array.isArray(data.sizes)
    ) {
      const nodes = [];
      eachNode(layout.tree, node => nodes.push(node));
      if (
        data.sizes.length == nodes.length &&
        nodes.every((node, i) => validSizes(data.sizes[i], node.sizes.length))
      ) {
        nodes.forEach((node, i) => (node.sizes = [...data.sizes[i]]));
      }
    }
    return layout;
  }

  /** Gives every pane in each row or column the same share. */
  equalize() {
    eachNode(this.tree, node => (node.sizes = even(node.kids.length)));
  }

  /**
   * Pixel rectangles for the panes, the dividers between them and the crossing points
   * where two dividers meet (a 2 by 2 grid has one).
   *
   * @param {{width: number, height: number, gap: number}} metrics
   */
  compute(metrics) {
    const out = { panes: [], dividers: [], crosses: [], nodes: new Map() };
    const rect = { x: 0, y: 0, w: metrics.width, h: metrics.height };
    this.#walk(this.tree, rect, "", out, metrics.gap, null, null);
    if (this.tree.link) {
      const linked = out.dividers.filter(d => d.linked);
      for (const outer of out.dividers.filter(d => d.path == "")) {
        for (const inner of linked) {
          out.crosses.push({
            x: outer.x + outer.w / 2,
            y: inner.y + inner.h / 2,
            ids: [outer.id, inner.id],
          });
        }
      }
    }
    return out;
  }

  #walk(node, rect, path, out, gap, parent, link) {
    const n = node.kids.length;
    const across = node.dir == "row";
    const length = across ? rect.w : rect.h;
    const origin = across ? rect.x : rect.y;
    const avail = Math.max(0, length - gap * (n - 1));
    out.nodes.set(path, { node, rect, avail, origin, parent });

    const edges = [];
    let share = 0;
    for (let i = 0; i < n; i++) {
      const start = origin + Math.round(share * avail) + i * gap;
      share += node.sizes[i];
      const end =
        i == n - 1
          ? origin + length
          : origin + Math.round(share * avail) + i * gap;
      edges.push([start, end]);
      const kidRect = across
        ? { x: start, y: rect.y, w: end - start, h: rect.h }
        : { x: rect.x, y: start, w: rect.w, h: end - start };
      const kid = node.kids[i];
      if (typeof kid == "number") {
        out.panes[kid] = kidRect;
      } else {
        const kidPath = path ? `${path}.${i}` : `${i}`;
        const kidLink = node.link ? { first: i == 0, span: rect } : null;
        this.#walk(kid, kidRect, kidPath, out, gap, node, kidLink);
      }
    }

    if (link && !link.first) {
      return;
    }
    for (let i = 0; i < n - 1; i++) {
      const at = edges[i][1];
      const span = link ? link.span : rect;
      out.dividers.push({
        id: `${path}:${i}`,
        path,
        index: i,
        axis: across ? "x" : "y",
        linked: !!link,
        center: at + gap / 2,
        ...(across
          ? { x: at, y: span.y, w: gap, h: span.h }
          : { x: span.x, y: at, w: span.w, h: gap }),
      });
    }
  }

  #minAlong(kid, axis, gap) {
    if (typeof kid == "number") {
      return axis == "x" ? MIN_PANE_WIDTH : MIN_PANE_HEIGHT;
    }
    const mins = kid.kids.map(k => this.#minAlong(k, axis, gap));
    const sameAxis = (kid.dir == "row") == (axis == "x");
    return sameAxis
      ? sum(mins) + gap * (kid.kids.length - 1)
      : Math.max(...mins);
  }

  /**
   * Moves one divider so its centre sits at `position` (pixels along its axis, measured
   * like the rectangles from compute). Panes never get smaller than the minimum size.
   *
   * @param {string} id a divider id from compute()
   * @param {number} position
   * @param {{width: number, height: number, gap: number}} metrics
   * @param {object} [options]
   * @param {boolean} [options.snap] pull to halves, thirds, quarters and even shares
   * @returns {{moved: boolean, snapped: number|null}}
   */
  moveDivider(id, position, metrics, { snap = false } = {}) {
    const [path, indexText] = id.split(":");
    const index = Number(indexText);
    const info = this.compute(metrics).nodes.get(path);
    if (!info || info.avail <= 0 || !(index >= 0)) {
      return { moved: false, snapped: null };
    }
    const { node, avail, origin } = info;
    if (index >= node.kids.length - 1) {
      return { moved: false, snapped: null };
    }
    const axis = node.dir == "row" ? "x" : "y";
    const gap = metrics.gap;
    const before = sum(node.sizes.slice(0, index));
    const after = before + node.sizes[index] + node.sizes[index + 1];
    const low = before + this.#minAlong(node.kids[index], axis, gap) / avail;
    const high =
      after - this.#minAlong(node.kids[index + 1], axis, gap) / avail;
    if (low > high) {
      return { moved: false, snapped: null };
    }
    let cut = (position - gap / 2 - index * gap - origin) / avail;
    cut = Math.min(high, Math.max(low, cut));

    let snapped = null;
    if (snap) {
      const n = node.kids.length;
      const targets = new Set([...SNAP_POINTS, ...range(1, n).map(k => k / n)]);
      let best = SNAP_DISTANCE / avail;
      for (const target of targets) {
        const distance = Math.abs(cut - target);
        if (distance <= best && target >= low && target <= high) {
          best = distance;
          snapped = target;
        }
      }
      if (snapped !== null) {
        cut = snapped;
      }
    }

    node.sizes[index] = cut - before;
    node.sizes[index + 1] = after - cut;
    if (info.parent?.link) {
      for (const sibling of info.parent.kids) {
        if (typeof sibling == "object" && sibling !== node) {
          sibling.sizes = [...node.sizes];
        }
      }
    }
    return { moved: true, snapped };
  }

  /**
   * Moves a divider by a number of pixels (keyboard use).
   *
   * @param {string} id a divider id from compute()
   * @param {number} delta pixels, negative to move left or up
   * @param {{width: number, height: number, gap: number}} metrics
   */
  nudge(id, delta, metrics) {
    const divider = this.compute(metrics).dividers.find(d => d.id == id);
    if (!divider) {
      return { moved: false, snapped: null };
    }
    return this.moveDivider(id, divider.center + delta, metrics);
  }

  /**
   * Gives the panes on both sides of one divider even shares within their row or column.
   *
   * @param {string} id a divider id from compute()
   */
  equalizeAt(id) {
    const [path] = id.split(":");
    const node = this.#nodeAt(path);
    if (!node) {
      return;
    }
    node.sizes = even(node.kids.length);
    const parent = path ? this.#parentOf(path) : null;
    if (parent?.link) {
      for (const sibling of parent.kids) {
        if (typeof sibling == "object") {
          sibling.sizes = [...node.sizes];
        }
      }
    }
  }

  #nodeAt(path) {
    let node = this.tree;
    for (const step of path ? path.split(".") : []) {
      node = node?.kids[Number(step)];
    }
    return typeof node == "object" ? node : null;
  }

  #parentOf(path) {
    const steps = path.split(".");
    steps.pop();
    return this.#nodeAt(steps.join("."));
  }
}
