# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Command bar

nirva-commandbar-label = Command or search
nirva-commandbar-placeholder = Type a command, a page, or a search
nirva-commandbar-shortcut = Ctrl K
nirva-commandbar-shortcut-mac = ⌘ K
nirva-commandbar-empty = Nothing found

## What kind of result a row is

nirva-commandbar-kind-command = Command
nirva-commandbar-kind-tab = Open tab
nirva-commandbar-kind-bookmark = Bookmark
nirva-commandbar-kind-history = History
nirva-commandbar-kind-page = Page text
nirva-commandbar-kind-web = Web
# Variables:
#   $date (String): the date a page was last visited.
nirva-commandbar-page-source-live = Visited { $date }
# $date (String) - The date the copy was saved.
nirva-commandbar-page-source-saved = Saved copy · { $date }

# Variables:
#   $query (String): what the owner typed.
nirva-commandbar-search-web = Search the web for “{ $query }”
# Variables:
#   $url (String): the address the owner typed.
nirva-commandbar-open-address = Go to { $url }

## Commands: browser basics

nirva-command-new-tab = New tab
nirva-command-new-window = New window
nirva-command-new-private-window = New private window
nirva-command-close-tab = Close tab
nirva-command-reopen-tab = Reopen closed tab
nirva-command-reload = Reload page
nirva-command-find = Find in page
nirva-command-print = Print page
nirva-command-bookmark-page = Bookmark this page
nirva-command-reader-view = Reader view
nirva-command-full-screen = Full screen
nirva-command-zoom-in = Zoom in
nirva-command-zoom-out = Zoom out
nirva-command-zoom-reset = Reset zoom
nirva-command-mute-tab = Mute or unmute tab
nirva-command-history = Show history
nirva-command-bookmarks = Show bookmarks
nirva-command-downloads = Show downloads
nirva-command-settings = Settings
nirva-command-extensions = Extensions and themes
nirva-command-menu = Open the main menu
nirva-command-about = About { -brand-short-name }

## Commands: privacy

nirva-command-privacy-settings = Privacy and security settings
nirva-command-clear-data = Clear browsing data
nirva-command-read-search = Read-Everything Search
nirva-command-live-clips = Manage Live Clips
nirva-command-live-clips-capture = Clip a page region

## Commands: looks

nirva-command-look-glass = Look: Glass
nirva-command-look-cockpit = Look: Cockpit
nirva-command-look-paper = Look: Paper
nirva-command-mode-bright = Appearance: Bright
nirva-command-mode-dark = Appearance: Dark
nirva-command-mode-system = Appearance: Match my computer

## Commands: sidebar and workspaces

nirva-command-sidebar-toggle = Collapse or expand the sidebar
nirva-command-sidebar-autohide-on = Hide the sidebar until the pointer reaches the edge
nirva-command-sidebar-autohide-off = Always show the sidebar
nirva-command-workspace-new = New workspace
nirva-command-workspace-rename = Rename this workspace
nirva-command-workspace-delete = Delete this workspace
# Variables:
#   $name (String): the name of a workspace.
nirva-command-workspace-switch = Go to workspace { $name }

## Commands: island toolbar and first-launch chooser

nirva-command-island-focus = Edit the address
nirva-command-welcome-open = Welcome guide: look, privacy and import from another browser
nirva-command-welcome-reset = Show the look chooser at the next start

## Commands: motion and Lite mode

nirva-command-motion-springy = Motion: Springy
nirva-command-motion-smooth = Motion: Smooth
nirva-command-motion-minimal = Motion: Minimal
# Variables:
#   $percent (Number): animation speed in percent, for example 150.
nirva-command-motion-speed = Animation speed: { $percent }%
nirva-command-spring-physics-toggle = Toggle Spring Physics
nirva-command-morph-toggle = Toggle Link-to-Tab Morph
nirva-command-workspace-slide-toggle = Toggle Workspace Slide
nirva-command-page-transitions-toggle = Toggle Page Transitions
nirva-command-burn-away-toggle = Toggle Burn-Away Close
nirva-command-tab-stacks-toggle = Toggle Tab Stacks Fan
nirva-command-split-snap-toggle = Toggle Split Snap
nirva-command-lite-on = Turn on Lite mode
nirva-command-lite-off = Turn off Lite mode

## NIRVA: Theme Studio command labels.

nirva-command-theme-studio = Open Theme Studio
nirva-command-theme-reset = Reset appearance to Nirva defaults

## NIRVA: Time Travel command label.

nirva-command-time-travel = Open Time Travel

## NIRVA: Personal Web Library command labels.

nirva-command-library = Open Library
nirva-command-library-save = Save this page to Library
nirva-command-library-highlight = Highlight selected text
nirva-command-library-note = Add a note to selected text
nirva-command-burner-new = New burner tab
nirva-command-burner-reopen = Reopen this page in a burner tab
nirva-command-burner-close-all = Close all burner tabs and erase their data
nirva-command-burner-about = About burner tabs
nirva-command-trust-strict = Trust dial: Strict for this site
nirva-command-trust-balanced = Trust dial: Balanced for this site
nirva-command-trust-trusted = Trust dial: Trusted for this site
nirva-command-home-open = Open home
nirva-command-home-edit = Edit home
nirva-command-receipt = Privacy Receipt
nirva-command-receipt-show = Show this page’s privacy receipt
nirva-command-remix-open = Page Remix
nirva-command-remix-edit = Remix this site
nirva-command-remix-hide = Hide an element on this page
nirva-command-remix-text-larger = Remix: larger text on this site
nirva-command-remix-text-smaller = Remix: smaller text on this site
nirva-command-remix-off = Turn off remix on this page
nirva-command-remix-on = Turn remix back on for this page
nirva-command-remix-reset = Reset remix for this page

## Commands: intelligent tab rules

nirva-command-tabrules-open = Tab rules
nirva-command-tabrules-pause = Pause tab rules
nirva-command-tabrules-resume = Resume tab rules
nirva-command-tabrules-add-here = Always open this site in this workspace

## Automatic Link Cleaner

nirva-command-frames-off = Show white boxes behind frames on dark pages
nirva-command-frames-on = Hide white boxes behind frames on dark pages
nirva-command-memory-off = Turn off memory saver
nirva-command-memory-on = Turn on memory saver (unused tabs sleep after 30 minutes)
nirva-command-memory-sleep-now = Put all other tabs to sleep now
nirva-command-linkcleaner-original = Load the original link, before cleaning
nirva-command-linkcleaner-site-off = Stop cleaning links to this site
nirva-command-linkcleaner-site-on = Clean links to this site again
nirva-command-linkcleaner-off = Turn off link cleaning
nirva-command-linkcleaner-on = Turn on link cleaning

## Macros

nirva-command-macros-open = Macros
nirva-command-macros-stop = Stop the running macro
# $name (String) - The macro's name.
nirva-command-macro-run = Run macro: { $name }

## Profiles

nirva-command-profiles-switch = Switch profile
nirva-command-profiles-new = Add a profile for another person or account

## Split view

nirva-command-split-choose = Split view: choose two to four tabs to show together
nirva-command-split-recent-2 = Split view with the last tab used
nirva-command-split-recent-4 = Split view: the four most recent tabs in a grid
nirva-command-split-arrange = Arrange this split view
nirva-command-split-even = Split view: even sizes
nirva-command-split-separate = Separate this split view
nirva-command-split-off = Turn off Nirva split layouts
nirva-command-split-on = Turn on Nirva split layouts
