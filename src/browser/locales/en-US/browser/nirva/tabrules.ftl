# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Messages shown in the browser window when a rule acts

# Variables:
#   $site (String): a site name, for example example.com.
#   $workspace (String): the name of the workspace the tab moved to.
nirva-tabrules-moved = A tab rule moved the { $site } tab to { $workspace }.
nirva-tabrules-undo = Undo
nirva-tabrules-pause = Pause tab rules
# Variables:
#   $count (Number): how many tabs have not been used.
#   $minutes (Number): the waiting time in minutes.
nirva-tabrules-sleep-offer =
    { $count ->
        [one] { $count } tab has not been used for { $minutes } minutes. Put it to sleep to free memory? It wakes when you select it.
       *[other] { $count } tabs have not been used for { $minutes } minutes. Put them to sleep to free memory? They wake when you select them.
    }
nirva-tabrules-sleep-accept = Put to sleep

## The Tab rules page

nirva-tabrules-title = Tab rules
nirva-tabrules-eyebrow = Tabs
nirva-tabrules-intro = A few simple rules that keep tabs where you want them. Every automatic move is announced, listed below, and can be undone.
nirva-tabrules-pause-all = Pause all rules
nirva-tabrules-resume = Resume rules
nirva-tabrules-paused-note = Tab rules are paused. Nothing is moved and nothing is suggested until you resume them.
nirva-tabrules-no-workspaces = Workspaces are switched off, so tabs are not moved.
nirva-tabrules-sites-title = Open a site in a workspace
nirva-tabrules-sites-copy = When a tab opens a page on the site, it moves to the workspace you chose. Parts of the site, such as mail.example.com for example.com, are included.
nirva-tabrules-sites-empty = No rules yet.
nirva-tabrules-add-site =
    .placeholder = example.com
    .aria-label = Site
nirva-tabrules-add-workspace =
    .aria-label = Workspace
nirva-tabrules-add = Add rule
nirva-tabrules-add-error = Enter a site name such as example.com.
nirva-tabrules-rule-on = On
nirva-tabrules-remove = Remove
nirva-tabrules-workspace-gone = Choose a workspace
nirva-tabrules-sleep-title = Sleep suggestions
nirva-tabrules-sleep-copy = A sleeping tab stays in the sidebar but uses almost no memory, and wakes when you select it. { -brand-short-name } only suggests it; nothing sleeps unless you agree. Tabs playing sound, pinned tabs and the tab in front are never suggested.
nirva-tabrules-sleep-enable = Suggest sleep for tabs not used for
nirva-tabrules-sleep-minutes =
    .aria-label = Waiting time
# Variables:
#   $minutes (Number): the waiting time in minutes.
nirva-tabrules-sleep-after =
    { $minutes ->
        [30] 30 minutes
        [60] 1 hour
        [120] 2 hours
       *[other] 4 hours
    }
nirva-tabrules-log-title = Recent automatic moves
nirva-tabrules-log-empty = Nothing has been moved in this session.
# Variables:
#   $site (String): a site name.
#   $from (String): the workspace the tab was in.
#   $to (String): the workspace the tab moved to.
#   $time (String): the time of day, already formatted.
nirva-tabrules-log-entry = { $time }: { $site } moved from { $from } to { $to }
nirva-tabrules-log-undone = Undone
