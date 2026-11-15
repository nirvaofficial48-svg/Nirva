# Nirva specification

Public-launch scope and priority are defined by `Nirva_First_Public_Launch_Feature_Plan.md`.
This file retains the older implementation notes and feature IDs used by `PROGRESS.md`; when
scope or priority differs, follow the launch plan.

Each feature has an ID. "Done when" is the test the owner will apply by hand. "Hint" names the
Firefox part to build on. Hints were written without the source open, so confirm each one with a
targeted search before relying on it.

General rules for every feature:

- It is reachable from the command bar (T1) and has a preference `nirva.<feature>.enabled`.
- It works in all three looks, and in bright and dark for Glass and Paper.
- Its data stays on the computer. Nothing is uploaded.
- The default screen stays calm: features appear when called, not as permanent buttons.

## S. Shell and design

**S1 Looks.** Three looks: Glass, Cockpit, Paper. Glass and Paper each have bright and dark;
Cockpit is dark only. A mode setting offers Bright, Dark, and Match my computer. Done when:
switching look or mode restyles the whole interface instantly with no restart, and no element
keeps colours from the previous look. Hint: set `data-nirva-look` and `data-nirva-mode` on the
root of every browser window and style only through the variables in `design/tokens.css`.

**S2 First-launch chooser.** On the first run of a new profile, a full-window page shows the three
looks as previews, the mode choice, an import button (X2), and Continue. The chosen look and mode
become the default for that profile. For Cockpit the mode choice is disabled and reads "Dark
only". Done when: it appears once, the choice is applied before the first normal window opens, and
it never appears again unless the owner resets it from Theme studio. Design: `designs/Welcome.html`.

**S3 Island toolbar.** Back, forward, address, privacy receipt button, split view, in one floating
pill centred over the page, not a full-width bar. It shrinks to a 3 px line when the page is
scrolled down and returns on scroll up, pointer near the top edge, or Ctrl+L. Done when: the page
runs edge to edge under it, text under it stays readable, and it never covers a page's own fixed
header controls for more than the scroll-up moment. Design: `designs/Main.html`.

**S4 Sidebar and workspaces.** Vertical tabs in a left sidebar: workspace switcher, pinned sites,
open tabs, and New tab, Tab canvas and Time travel at the bottom. It collapses to an icon rail.
Burner and asleep tabs are labelled. Hint: Firefox has native vertical tabs and a sidebar
(`sidebar.verticalTabs`); extend them.

**S5 Adaptive tint.** The sidebar and island take a soft tint derived from the current page's
theme colour or dominant header colour. The tint must keep text contrast at 4.5:1 or better. It
can be turned off per look.

**S6 Theme studio.** A settings page with a live preview: look, mode, accent colour, blur amount,
corner roundness, density, fonts, wallpaper. Themes save to and load from a single `.nirvatheme`
file (JSON). Done when: every control changes the live browser as it moves, and an exported theme
re-imports identically on another machine.

**S7 Movable layout.** Tabs on the left, right, top, or bottom. Every toolbar button can be
dragged to another place or removed. Hint: Firefox's Customize mode (`CustomizableUI`).

**S8 Motion control.** One setting with three styles: Springy, Smooth, Minimal, plus a speed
slider. All animations read the shared tokens. With the system "reduce motion" setting or Lite
mode on, movement is replaced by short fades.

**S9 Looks per workspace.** Each workspace can have its own look, mode, accent, wallpaper and
home widgets.

**S10 Shortcuts and gestures.** A settings page listing every command, where any command can be
given a key combination or a trackpad or mouse gesture. Conflicts are shown before saving.

**S11 Menu editor.** Hide, reorder or add items in the page right-click menu, the tab menu and the
main menu. A reset button restores defaults.

**S12 Macro buttons.** The owner builds a toolbar button that runs a list of commands in order
(for example: open three sites in split view and start a focus session). Macros are also commands.

**S13 Scenes.** Rules that change look, mode, workspace and focus rules by time of day or day of
week. Example: after 21:00 switch to Paper dark and block the sites on the focus list.

**S14 Lite mode.** For old computers: no blur, no wallpaper animation, fades instead of movement,
and tabs sleep after 5 minutes. Offered automatically on first run when the machine has 4 GB of
memory or less, or 2 cores or fewer.

## H. Home screen

**H1 Home grid.** The new-tab page. Widgets sit on a 12-column grid, can be dragged and resized,
and span several pages. An Edit home mode shows the grid. Layout is saved per workspace. Designs:
`designs/Home.html`, `HomeDark.html`, `Paper.html`, `PaperDark.html`, `Cockpit.html`. Hint:
replace `about:newtab` and `about:home` with our own page in `browser/components/nirva/home/`.

**H2 Live wallpaper.** Glass: slow-moving soft light shapes that drift and react slightly to the
pointer, colours shifting through the day. Also: the owner's own image or video. It pauses when
the window is not visible, and is static in Lite mode.

**H3 Built-in widgets.** Search, clock and date, weather, to-do list, sticky note, countdown,
focus timer (blocks a chosen site list while running), music controls for the playing tab, memory
and battery, news feeds (RSS), market prices, GitHub activity, quick-links dock, continue reading,
privacy today. Weather, prices and GitHub need a network source: each asks the owner to choose
one and stays empty until he does.

**H4 Live clips.** The owner selects a region of any page; it becomes a widget that reloads that
page in the background on a schedule and shows the same region. Clips load with the blocker on
and in an isolated container.

**H5 Widget kit.** A widget is a folder with `widget.json`, HTML, CSS and JavaScript, running in a
sandboxed frame with a small documented API (storage, size, theme tokens). Widgets load from a
local folder. Include one documented example.

**H6 Time travel ribbon.** On the Cockpit home, and as an optional widget elsewhere: past sessions
on one horizontal line ending at Now, each with Restore. See T7.

## T. Tabs and workflow

**T1 Command bar.** Ctrl+K opens one input that searches commands, open tabs, bookmarks, history,
pages read (T16) and the web. Results appear within 50 ms for local sources. Enter runs the first
result. Every feature registers its commands here.

**T2 Peek.** Holding a link (or Shift+click) opens it in a floating preview over the page. Escape
closes it; a button promotes it to a tab or a split pane.

**T3 Linked split view.** Two to four pages side by side in one tab area, with draggable dividers.
An optional link makes them scroll together by proportion. Hint: Firefox shipped split view in
version 150; extend it.

**T4 Tab canvas.** A zoomable board showing every tab as a live thumbnail. Tabs can be dragged
into named groups. Clicking a thumbnail goes to that tab.

**T5 Session recipes.** Save the current arrangement of tabs, groups, split views and workspace
under a name; reopen it with one command.

**T6 Tab rules.** "When, then" rules: when a tab's address matches a pattern or has been idle for
a period, then group it, move it to a workspace, pin it, put it to sleep or close it. Closed-by-rule
tabs stay recoverable in Time travel.

**T7 Time travel.** The browser records a snapshot of all windows, tabs, groups and scroll
positions every 10 minutes and at every window close, kept for 30 days by default. A timeline
lets the owner scrub to any snapshot and restore all of it or single tabs. Hint: `SessionStore`.

**T8 Workspaces with separate logins.** Each workspace has its own cookies and logins, so two
accounts of one site work side by side. Hint: contextual identities (containers).

**T9 Tab energy meter.** A panel listing each tab's memory and recent processor use, with a
Sleep action, plus automatic sleeping of heavy idle tabs. Tabs playing media, sharing the screen,
or holding unsaved form input never sleep. Hint: `about:processes` data and tab unloading.

**T10 Web apps.** Any site can be installed as its own window with its own icon in the system
launcher. Check whether the Firefox version in use already ships this before building it.

**T11 Universal media bar.** A small bar for whichever tab is playing: play, pause, seek, speed
from 0.25x to 4x, picture-in-picture. It works for any HTML5 video or audio.

**T12 Page remix.** A picker lets the owner click any element on a page to hide it, or change its
font, size or colours. Changes are saved per site and applied on every visit. A per-site list
allows undoing each one.

**T13 Page notes.** Select text to highlight it or attach a note. Highlights and notes reappear on
return visits, are listed in a sidebar panel, and are searchable from the command bar.

**T14 Permanent copies.** Save the current page, with its images and styles, as one file in a
local library. A saved copy opens offline and shows the date it was saved.

**T15 Change watch.** Watch a whole page or a selected region. The browser rechecks on a schedule
and notifies when it changes, showing old and new side by side with differences highlighted.

**T16 Read-everything search.** The readable text of every visited page is indexed locally. The
command bar and address bar find pages by any remembered phrase. Private windows and burner tabs
are never indexed. The index can be cleared by site or by date. Hint: SQLite full-text search
(FTS5) in the profile folder, text taken from the reader-mode extractor.

**T17 Dark mode for every site.** Sites without their own dark theme are given one. A per-site
switch turns it off where it renders badly.

**T18 Site profiles.** One panel per site: zoom, font, dark mode, each permission, autoplay,
JavaScript, cookies, which extensions may run, the trust dial (P7), compatibility switch (X1).

**T19 Extensions per site.** Part of T18: each extension can be set to run on all sites, only
listed sites, or all except listed sites.

## Q. Search

**Q1 Instant address bar.** Local results (tabs, bookmarks, history, pages read) appear as the
owner types, before any network request. Search suggestions from the web are off by default.

**Q2 Search shortcuts.** A short prefix sends the query to one site: `yt cats`, `w photon`. The
owner can add his own. Hint: Firefox search engine keywords.

**Q3 Result stepping.** On a search results page, a key opens the first result in a side pane;
the up and down keys move through results without leaving the results page.

**Q4 Site bans.** A list of domains hidden from the results of any supported search engine. A
"hide this site" action on each result adds to it.

## P. Privacy and security

**P1 Hardened defaults.** Telemetry, studies, sponsored content and crash-report uploads are off.
Tracking protection is strict. HTTPS-only mode is on. Keep Firefox's own security updates and
safe-browsing protection working.

**P2 Ad and tracker blocker.** A full-strength blocker is installed and on by default. Hint: ship
uBlock Origin as a built-in extension through `policies.json`; check its licence terms for bundling.

**P3 Privacy receipt.** The shield button on the island shows a count. Its panel lists, for this
page: trackers blocked, fingerprinting attempts stopped, cookies isolated, and third-party
companies contacted. Design: `designs/Main.html`. Hint: the content blocking log of the tab.

**P4 Burner tabs.** A tab in its own temporary container. Closing it deletes its cookies, storage,
cache and history entries. Nothing from it enters T7 or T16.

**P5 Decoy permissions.** When a site asks for location, camera, microphone or contacts, the
owner can answer with a decoy: a chosen fake location, a blank camera, silence. The site sees a
normal grant. This may need engine changes; investigate and report before building.

**P6 Lookalike alarm.** A warning page before loading a domain that imitates a well-known one
through look-alike characters or one-letter changes, compared against the owner's own history
and bookmarks.

**P7 Trust dial.** A three-step slider per site. Strict: no JavaScript, no third-party requests,
no cookies kept. Balanced: the defaults. Trusted: protections relaxed for sites that break.

**P8 Locked tabs.** Chosen tabs or whole workspaces show a blurred cover until the owner unlocks
them with the system's own authentication (Touch ID on macOS, the login prompt elsewhere).

**P9 Link cleaner.** Tracking parameters are removed from links when opened and when copied.

**P10 Panic key.** One shortcut hides every window behind a neutral page and locks them as in P8.

**P11 Per-tab routing.** A tab or workspace can be sent through a proxy the owner configures
(SOCKS or HTTP, including a local Tor or VPN proxy) while other tabs connect directly.

**P12 Banner killer.** Cookie banners are rejected automatically where possible and hidden
otherwise; newsletter pop-ups are hidden. Hint: Firefox has cookie banner handling; extend it.

**P13 No built-in AI.** Firefox's AI features are disabled and hidden. Nirva adds none.

## A. Animations

All take timing from `design/tokens.css`, run at the display's refresh rate, finish within 200 ms,
and follow S8.

- **A1 Link-to-tab morph.** A new tab grows from the link that opened it; closing shrinks it back.
- **A2 Spring physics.** Dragged tabs have weight; neighbours flow aside and settle.
- **A3 Light-sweep loading.** A line of accent colour runs along the island's lower edge while a
  page loads. No spinner.
- **A4 Burn-away close.** A burner tab dissolves from the edges as its data is wiped.
- **A5 Workspace slide.** Switching workspace slides the content with slight parallax.
- **A6 Page transitions.** A short crossfade between pages instead of a white flash.
- **A7 Tab stacks.** A group of tabs fans open like a hand of cards.
- **A8 Magnetic split view.** Dividers snap to halves and thirds with a small settle.

## X. Platform

**X1 Compatibility switch.** Per site, present the browser as Chrome (user-agent and related
hints) for sites that refuse or break on Firefox.

**X2 Import.** One step brings bookmarks, passwords, history and open tabs from Chrome, Edge,
Safari or Firefox, then lists the extensions found there with a link to the Firefox version of
each where one exists. Hint: Firefox's migration wizard.

**X3 Installers and updates.** A `.dmg` for macOS, an installer for Windows, and an AppImage or
tarball for Linux, with automatic updates from GitHub releases.

**X4 Branding.** The name Nirva and the icons in `branding/` everywhere; no Firefox name or logo
in the shipped product. Generate the PNG, `.ico` and `.icns` sizes from `branding/nirva-icon.svg`.

**X5 Cloud builds.** See PROGRESS 0.4.

**X6 Firefox updates.** A documented routine to move the fork to each new Firefox release within
a week of it shipping, so its security fixes are kept.
