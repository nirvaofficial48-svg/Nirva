# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

nirva-live-clips-title = Live Clips
nirva-live-clips-eyebrow = A small window into the pages you follow
nirva-live-clips-intro = Clip a region from a page and keep its latest text here. Use Ctrl K on a supported page and choose “Clip a page region” to begin.
nirva-live-clips-privacy-title = Private by design
nirva-live-clips-privacy-copy = Clips stay in this { -brand-short-name } profile. Refresh uses a cookie-free request and does not send your browsing referrer, so regions that require a sign-in may not be available. New clips refresh manually unless you choose a schedule.
nirva-live-clips-list-label = Your collection
nirva-live-clips-list-title = Saved regions
nirva-live-clips-empty-title = No clips yet
nirva-live-clips-empty-copy = Open a supported page, press Ctrl K, and choose “Clip a page region.” Move over the region you want, click it, and Nirva will keep its text here.
# $count (Number) - How many clips are saved.
nirva-live-clips-count = { $count ->
    [one] 1 clip
   *[other] { $count } clips
}
nirva-live-clips-pause-all = Pause all schedules
nirva-live-clips-resume-all = Resume all schedules
nirva-live-clips-all-paused = Automatic refreshes are paused. You can still refresh a clip by hand.
nirva-live-clips-all-resumed = Automatic refreshes are resumed.
# $date (String) - When the clip's text was last fetched, as a formatted date and time.
nirva-live-clips-updated = Updated { $date }
nirva-live-clips-schedule-label = Automatic refresh
nirva-live-clips-manual = Manual only
nirva-live-clips-six-hours = Every 6 hours
nirva-live-clips-daily = Every 24 hours
# $date (String) - When the next automatic refresh is due, as a formatted date and time.
nirva-live-clips-next-refresh = Next check { $date }
nirva-live-clips-schedule-paused = This clip’s schedule is paused
nirva-live-clips-schedule-paused-all = All schedules are paused
nirva-live-clips-schedule-manual = Refresh when you choose
nirva-live-clips-refresh = Refresh now
# $title (String) - The name of the clip being refreshed.
nirva-live-clips-refreshing = Refreshing “{ $title }”…
nirva-live-clips-pause-clip = Pause schedule
nirva-live-clips-resume-clip = Resume schedule
nirva-live-clips-edit = Edit
nirva-live-clips-open-source = Open source
nirva-live-clips-remove = Remove
# $title (String) - The name of the clip to remove.
nirva-live-clips-remove-confirm = Remove “{ $title }” from Live Clips?
nirva-live-clips-edit-title-label = Clip name
nirva-live-clips-edit-selector-label = Region selector
nirva-live-clips-save = Save changes
nirva-live-clips-cancel = Cancel
nirva-live-clips-edit-saved = Clip changes saved.
nirva-live-clips-edit-error = Check the selector and try again.
# $title (String) - The name of the clip that was removed.
nirva-live-clips-removed = Removed “{ $title }”.
nirva-live-clips-private-window = Live Clips are unavailable in a private window.
nirva-live-clips-not-supported = This page cannot be clipped. Use a regular tab on a supported web page without private or sign-in data.
nirva-live-clips-region-unsupported = Nirva could not save that region. Try a different part of the page.
nirva-live-clips-created = Clip saved. Manage it on the Live Clips page.
nirva-live-clips-picker-prompt = Move over a region and click to clip it
nirva-live-clips-picker-cancel = Esc to cancel
nirva-live-clips-error-blocked = The page redirected outside its site, so refresh was blocked.
nirva-live-clips-error-missing-region = This region is no longer on the page. Edit its selector or remove the clip.
nirva-live-clips-error-timeout = The page took too long to refresh. Try again later.
nirva-live-clips-error-unsupported = This page or region could not be refreshed. It may require a sign-in or block extraction.

## Making and checking clips

nirva-live-clips-new = New clip
nirva-live-clips-new-from = Clip a region from an open tab
nirva-live-clips-new-none = Open a website in a tab first; sign-in, payment and private pages cannot be clipped.
nirva-live-clips-refresh-all = Refresh all
nirva-live-clips-refreshing-all = Refreshing every clip…
# $changed (Number) - How many clips had new text.
nirva-live-clips-refreshed-all =
    { $changed ->
        [0] Every clip is up to date. Nothing changed.
        [one] Done. 1 clip changed.
       *[other] Done. { $changed } clips changed.
    }
nirva-live-clips-changed = Changed
    .title = This clip has new text. Select to mark it as seen.
nirva-live-clips-previous = What it said before
nirva-live-clips-more = More
