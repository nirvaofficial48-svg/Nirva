# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

nirva-time-travel-title = Time Travel
nirva-time-travel-eyebrow = Browsing memory · 30 days
nirva-time-travel-intro = Preview a saved browsing session, then restore its windows, tabs, and workspaces. Nirva saves your current session first so you can return to it.
nirva-time-travel-controls = Memory controls
nirva-time-travel-retention = Keep snapshots
nirva-time-travel-seven-days = 7 days
nirva-time-travel-fourteen-days = 14 days
nirva-time-travel-thirty-days = 30 days
nirva-time-travel-storage-limit = Storage limit
nirva-time-travel-storage-used = Stored on this device
nirva-time-travel-privacy = Nirva saves page addresses and session context only. It leaves out private and AI windows, cookies, form values, session storage, page contents, and page titles. Sites reopen live and may ask you to sign in. Clearing browser history also clears this timeline.
nirva-time-travel-pause = Pause snapshots
nirva-time-travel-resume = Resume snapshots
nirva-time-travel-clear = Delete all snapshots
nirva-time-travel-history-label = Saved states
nirva-time-travel-history = Timeline
nirva-time-travel-day = Day
nirva-time-travel-preview-label = Before you restore
nirva-time-travel-preview = Session preview
nirva-time-travel-delete = Delete snapshot
nirva-time-travel-restore = Restore this session
nirva-time-travel-restore-tab = Restore tab
nirva-time-travel-empty = No snapshots for this day.
nirva-time-travel-pick-snapshot = Choose a point in time to preview its windows, tabs, and workspaces.
nirva-time-travel-no-history = Your timeline is empty. Nirva will save a snapshot every 10 minutes while recording is on.
nirva-time-travel-save-now = Save a snapshot now
# $index is the position of this saved browser window in the session preview.
nirva-time-travel-window = Window { $index }
# $count is the number of restorable windows in a saved session.
nirva-time-travel-window-count =
    { $count ->
        [one] 1 window
       *[other] { $count } windows
    }
# $count is the number of restorable tabs in a saved session.
nirva-time-travel-tab-count =
    { $count ->
        [one] 1 tab
       *[other] { $count } tabs
    }
nirva-time-travel-no-tabs = No restorable tabs in this window.
nirva-time-travel-no-workspace = Unassigned workspace
nirva-time-travel-reason-startup = At browser start
nirva-time-travel-reason-periodic = 10-minute checkpoint
nirva-time-travel-reason-window-close = Before a window closed
nirva-time-travel-reason-manual = Saved by you
nirva-time-travel-reason-before-restore = Safety copy before restore
nirva-time-travel-confirm-label = Check before continuing
nirva-time-travel-confirm-restore-title = Restore this session?
nirva-time-travel-confirm-restore = Your current session will be saved as a separate snapshot first. Restored sites load live and may show newer content.
nirva-time-travel-confirm-restore-tab-title = Restore this tab?
nirva-time-travel-confirm-restore-tab = Your current session will be saved first. The tab will open in this window with its workspace and container context.
nirva-time-travel-confirm-clear-title = Delete the whole timeline?
nirva-time-travel-confirm-clear = This permanently removes every saved browsing snapshot from this device.
nirva-time-travel-cancel = Cancel
nirva-time-travel-confirm-restore-action = Save current session and restore
nirva-time-travel-confirm-restore-tab-action = Save current session and restore tab
nirva-time-travel-confirm-clear-action = Delete all snapshots
nirva-time-travel-status-restored = The session was restored. Your previous session is saved as a safety snapshot.
nirva-time-travel-status-tab-restored = The tab was restored. Your previous session is saved as a safety snapshot.
nirva-time-travel-status-deleted = Snapshot deleted.
nirva-time-travel-status-cleared = All snapshots deleted.
nirva-time-travel-status-settings = Timeline settings saved.
# $reason is a short error returned by SessionStore or the local store.
nirva-time-travel-status-error = The action could not be completed: { $reason }

## Finding and moving through the timeline

nirva-time-travel-find =
    .placeholder = Find a session by a site you had open
    .aria-label = Find a session by a site you had open
nirva-time-travel-days =
    .aria-label = Days with saved sessions
nirva-time-travel-today = Today
nirva-time-travel-yesterday = Yesterday
# $count (Number) - How many saved sessions the list shows.
nirva-time-travel-list-count =
    { $count ->
        [one] 1 saved session
       *[other] { $count } saved sessions
    }
# $site (String) - The site name that matched the search, such as "github.com".
nirva-time-travel-find-match = Had { $site } open
# $query (String) - What the person typed.
nirva-time-travel-find-none = No saved session had a page matching “{ $query }” open.
# $days (Number) - How long snapshots are kept. $used and $limit are sizes such as "3.2 MB".
nirva-time-travel-settings-summary = On · keeps { $days } days · { $used } of { $limit }
# $days (Number) - How long snapshots are kept. $used and $limit are sizes such as "3.2 MB".
nirva-time-travel-settings-summary-paused = Paused · keeps { $days } days · { $used } of { $limit }
nirva-time-travel-status-saved = Saved this moment to your timeline.
