/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { NirvaReceipt, RECEIPT_ROWS } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/receipt/NirvaReceipt.sys.mjs"
);

const CHANGE_TOPIC = "nirva-receipt-changed";
const $ = selector => document.querySelector(selector);
const number = new Intl.NumberFormat();

async function renderTotals() {
  const totals = await NirvaReceipt.totals();
  $("#totals").hidden = !totals;
  $("#totals-missing").hidden = !!totals;
  if (!totals) {
    return;
  }
  for (const row of document.querySelectorAll("#totals tbody tr")) {
    row.querySelector(".week").textContent = number.format(
      totals.week[row.dataset.kind]
    );
    row.querySelector(".month").textContent = number.format(
      totals.month[row.dataset.kind]
    );
  }
  if (totals.since) {
    document.l10n.setAttributes($("#totals-since"), "nirva-receipt-since", {
      date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(totals.since)
      ),
    });
  }
}

function renderSites() {
  const sites = NirvaReceipt.sessionSites();
  $("#sites").hidden = !sites.length;
  $("#sites-empty").hidden = !!sites.length;
  $("#clear-session").disabled = !sites.length;
  $("#sites tbody").replaceChildren(
    ...sites.map(site => {
      const row = document.createElement("tr");
      const host = document.createElement("th");
      host.scope = "row";
      host.textContent = site.host;
      row.append(host);
      for (const kind of RECEIPT_ROWS) {
        const cell = document.createElement("td");
        cell.textContent = number.format(site[kind]);
        row.append(cell);
      }
      return row;
    })
  );
}

$("#clear-session").addEventListener("click", () =>
  NirvaReceipt.clearSession()
);
Services.obs.addObserver(renderSites, CHANGE_TOPIC);
window.addEventListener(
  "unload",
  () => Services.obs.removeObserver(renderSites, CHANGE_TOPIC),
  { once: true }
);
renderSites();
await renderTotals();
