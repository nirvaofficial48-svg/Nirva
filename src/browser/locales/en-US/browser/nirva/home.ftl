# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## The home screen: the page shown in a new tab and at start-up

nirva-home-title = Home
nirva-home-remove =
    .aria-label = Remove
    .title = Remove
nirva-home-edit = Edit home
nirva-home-edit-done = Done
nirva-home-command = Type a command, a page you read, or a search
# The keyboard shortcut that opens the command bar.
nirva-home-command-key = Ctrl K

## Widgets

nirva-home-todo-title = Today
nirva-home-todo-new =
    .aria-label = Add a task
    .title = Add a task
nirva-home-todo-add =
    .placeholder = Add a task
    .aria-label = Add a task
nirva-home-focus-title = Focus
nirva-home-focus-start = Start session
nirva-home-focus-pause = Pause session
nirva-home-focus-resume = Resume session
nirva-home-focus-reset = Reset
nirva-home-focus-locking = Distracting sites are locked
nirva-home-focus-done = Your focus session has finished.
# Variables:
#   $site (String): a site name, for example example.com.
nirva-home-focus-locked = { $site } is locked until your focus session ends.
nirva-home-focus-end = End session
nirva-home-clips-title = Live clips
nirva-home-clips-open = Manage live clips
nirva-home-clips-empty = No clips yet. Set one up
nirva-home-note-title = Note
nirva-home-note =
    .placeholder = Anything you jot here stays on this computer.
    .aria-label = Note
nirva-home-countdown-title = Countdown
nirva-home-countdown-set = Set a date
# Variables:
#   $days (Number): how many days remain.
nirva-home-countdown-to-go =
    { $days ->
        [one] day to go
       *[other] days to go
    }
# Variables:
#   $days (Number): how many days have passed.
nirva-home-countdown-ago =
    { $days ->
        [one] day ago
       *[other] days ago
    }
nirva-home-computer-title = This computer
nirva-home-memory = Browser memory
# Variables:
#   $used (String): gigabytes the browser is using, for example 3.1.
#   $total (Number): gigabytes of memory in the computer.
nirva-home-memory-value = { $used } of { $total } GB
nirva-home-battery = Battery
nirva-home-reading-title = Continue reading
nirva-home-reading-empty = Long articles you leave part-way appear here.
nirva-home-energy-title = Tab energy
nirva-home-energy-empty = Website tabs and the memory they use appear here.
# Variables:
#   $megabytes (Number): memory used, in megabytes.
nirva-home-megabytes = { $megabytes } MB
nirva-home-privacy-title = Privacy today
nirva-home-privacy-trackers = Trackers blocked
nirva-home-privacy-fingerprinters = Fingerprinters blocked
nirva-home-privacy-burners = Burner tabs wiped
nirva-home-privacy-strict = Sites set to strict

## The strip and the time travel line on the Cockpit home

# Variables:
#   $tabs (Number): open tabs.
#   $asleep (Number): how many of them are asleep.
nirva-home-stat-tabs =
    { $tabs ->
        [one] { $tabs } tab
       *[other] { $tabs } tabs
    } · { $asleep } asleep
# Variables:
#   $used (String): gigabytes the browser is using.
nirva-home-stat-memory = { $used } GB
nirva-home-ribbon =
    .aria-label = Time travel
nirva-home-session-now = Now
# Variables:
#   $tabs (Number): tabs in the session.
nirva-home-session-tabs =
    { $tabs ->
        [one] { $tabs } tab
       *[other] { $tabs } tabs
    }
# Variables:
#   $windows (Number): windows in the session.
nirva-home-session-windows =
    { $windows ->
        [one] One window
       *[other] { $windows } windows
    }
nirva-home-session-restore = Restore
nirva-home-session-timeline = Open timeline

## Quick links

nirva-home-links =
    .aria-label = Quick links
nirva-home-link-add =
    .aria-label = Add quick link
    .title = Add quick link
nirva-home-link-url =
    .placeholder = example.com
    .aria-label = Address
nirva-home-link-title =
    .placeholder = Name (optional)
    .aria-label = Name
nirva-home-link-save = Add
nirva-home-link-error = Enter a web address such as example.com.

## Edit home

nirva-home-editor-title = Edit home
nirva-home-editor-widgets = Show on this page
nirva-home-widget-todo = Today (to-do list)
nirva-home-widget-focus = Focus session
nirva-home-widget-clips = Live clips
nirva-home-widget-note = Note
nirva-home-widget-countdown = Countdown
nirva-home-widget-computer = This computer
nirva-home-widget-reading = Continue reading
nirva-home-widget-energy = Tab energy
nirva-home-widget-privacy = Privacy today
nirva-home-widget-ribbon = Time travel line
nirva-home-editor-countdown = Countdown
nirva-home-editor-countdown-title =
    .placeholder = What are you counting down to?
    .aria-label = Event name
nirva-home-editor-countdown-date =
    .aria-label = Event date
nirva-home-editor-focus = Sites to lock during a focus session
nirva-home-editor-focus-copy = While a session runs, these sites send you back here. One site per line.
nirva-home-editor-focus-sites =
    .placeholder = example.com
    .aria-label = Sites to lock
nirva-home-editor-more = More
nirva-home-editor-clear-reading = Clear “Continue reading”
nirva-home-editor-studio = Open Theme Studio
