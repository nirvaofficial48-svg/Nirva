# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## The island button and its panel

# $count (Number) - Tracker and fingerprinter sites blocked on the current page.
nirva-receipt-button =
    .aria-label = { $count ->
        [0] Privacy receipt: nothing blocked on this page
        [one] Privacy receipt: 1 site blocked on this page
       *[other] Privacy receipt: { $count } sites blocked on this page
    }
    .title = Privacy receipt
nirva-receipt-panel =
    .aria-label = Privacy receipt
nirva-receipt-eyebrow = Privacy receipt
# $count (Number) - Tracker and fingerprinter sites blocked on the current page.
nirva-receipt-headline = { $count ->
    [one] 1 site blocked on this page
   *[other] { $count } sites blocked on this page
}
nirva-receipt-headline-none = No known trackers seen on this page
nirva-receipt-headline-off = Protection is off for this site
nirva-receipt-label-trackers = Tracker sites blocked
nirva-receipt-label-fingerprinters = Fingerprinter sites blocked
nirva-receipt-label-cookies = Sites with cookies restricted
nirva-receipt-label-loaded = Known trackers that loaded
nirva-receipt-row-trackers =
    .title = { nirva-receipt-meaning-trackers }
nirva-receipt-row-fingerprinters =
    .title = { nirva-receipt-meaning-fingerprinters }
nirva-receipt-row-cookies =
    .title = { nirva-receipt-meaning-cookies }
nirva-receipt-row-loaded =
    .title = { nirva-receipt-meaning-loaded }
nirva-receipt-none-seen = None seen
nirva-receipt-note = These numbers count sites that the browser’s protection lists recognised on this page. No browser can detect every kind of tracking.
nirva-receipt-details = What the numbers mean
nirva-receipt-burner = Reopen as burner tab

## The Privacy Receipt page

nirva-receipt-title = Privacy Receipt
nirva-receipt-page-eyebrow = What protection did, in numbers
nirva-receipt-intro = A receipt shows what { -brand-short-name }’s protection systems recorded while you browsed. For the page in front, select the shield in the address bar.
nirva-receipt-limits-title = What a receipt can tell you
nirva-receipt-limits-copy = Every number here comes from the browser’s own log of what it blocked or restricted, using lists of known trackers and fingerprinters. It is a record of those events, not a promise. New or unlisted trackers, and techniques the lists do not cover, are not counted and may not be blocked.
nirva-receipt-totals-label = Recent totals
nirva-receipt-totals-title = Blocked in the last weeks
# $date (String) - The first day for which totals exist, as a formatted date.
nirva-receipt-since = Recorded since { $date }
nirva-receipt-totals-missing = Totals are not being recorded in this profile.
nirva-receipt-column-kind = Kind
nirva-receipt-column-week = Last 7 days
nirva-receipt-column-month = Last 30 days
nirva-receipt-total-trackers = Tracker requests blocked
nirva-receipt-total-fingerprinters = Fingerprinter requests blocked
nirva-receipt-total-cookies = Tracking cookies blocked
nirva-receipt-meaning-label = Reading a receipt
nirva-receipt-meaning-title = What the numbers mean
nirva-receipt-meaning-trackers = Other sites on the page that are on the list of known trackers, and whose content was stopped from loading. This includes advertising, social media and cryptomining trackers.
nirva-receipt-meaning-fingerprinters = Sites known for recognising a device by its settings, stopped from loading, and pages stopped from using suspicious fingerprinting techniques.
nirva-receipt-meaning-cookies = Other sites on the page whose cookies were blocked, or kept in a separate store for this site so they cannot follow you to other sites.
nirva-receipt-meaning-loaded = Sites on the tracker list that were still allowed to load, usually because blocking them would break the page, or because protection is off for the site.
nirva-receipt-sites-label = This session
nirva-receipt-sites-title = By site
nirva-receipt-sites-copy = The latest receipt for each site visited since the browser started. This list is kept in memory only, leaves out private windows, and is gone when the browser closes.
nirva-receipt-sites-empty = No web pages have been visited yet in this session.
nirva-receipt-column-site = Site
nirva-receipt-clear-session = Clear this list
