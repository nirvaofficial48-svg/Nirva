# NIRVA --- First Public Launch Feature Plan

**Document type:** Product scope and launch specification\
**Scope:** 13 core feature additions + 2 premium motion experiences\
**Product direction:** A personal web environment that remembers,
adapts, and belongs to the user.

------------------------------------------------------------------------

## 1. Launch vision

Nirva should not launch as a browser that simply advertises a large
number of features. It should launch as a coherent, memorable experience
built around a few capabilities that work exceptionally well together.

**Core promise:**\
\> **Nirva --- The browser that remembers.**

The first public release should make the web feel like a personal
environment: browsing can be revisited, information can be found again,
useful content can stay accessible, and the interface can adapt to the
user's working style.

This plan covers **13 core additions** and **2 optional premium motion
experiences**. Existing work in Nirva versions 1.0--1.8 remains part of
the product and is not repeated here.

## 2. The 13 core launch additions

### Flagship experiences

#### 1. 30-Day Time Travel

**Priority:** P0 --- Launch-critical

Let users revisit and restore earlier browsing states from a timeline
covering up to 30 days.

**Launch requirements** - Browse a chronological timeline of saved
browser states. - Preview a past state before restoring it. - Restore
tabs, windows, workspaces, and relevant session context. - Preserve the
current state before a restore, so users can recover from an accidental
rollback. - Provide clear controls for retention, storage use, and
deletion.

**Important boundaries** - Treat this as session and browsing-context
restoration, not a promise to reconstruct every website exactly as it
appeared. - Do not silently overwrite current work. - Use compact,
incremental snapshots, deduplication, compression, and storage limits. -
Do not capture passwords, form contents, or sensitive page data by
default.

**Success measure:** Users can reliably find and restore a previous
browsing session without losing their current work.

#### 2. Read-Everything Search

**Priority:** P0 --- Launch-critical

Search the text of eligible pages the user has visited or saved, rather
than relying only on URLs and page titles.

**Launch requirements** - Search page titles, URLs, and indexed text. -
Show matching passages with a clear source and visit/save context. -
Open the original page or a locally saved copy where available. -
Support indexing exclusions, pause, retention controls, and deletion. -
Keep indexing local by default.

**Important boundaries** - Exclude private browsing and sensitive
categories by default. - Provide controls for domains and individual
pages. - Make clear when a result comes from a saved snapshot versus a
live page.

**Success measure:** A user can find a page from a remembered phrase
even when they cannot remember its website or title.

#### 3. Live Clips

**Priority:** P0 --- Launch-critical

Allow users to select a supported region or element of a webpage and
keep it available as a persistent, refreshable clip.

**Launch requirements** - Create a clip from a selected page region
where technically supported. - Display clips in a dedicated panel,
dashboard, or workspace. - Refresh clips on demand and, where
appropriate, on a user-configured schedule. - Show the source page and
last-updated time. - Let users pause, edit, remove, and manage clips.

**Important boundaries** - Some websites will block or break region
extraction; communicate unsupported cases clearly. - Respect site
permissions, authentication boundaries, and user privacy. - Avoid
aggressive background refreshes; provide sensible limits and controls.

**Success measure:** Users can monitor selected information without
repeatedly navigating back to the source page.

#### 4. Personal Web Library + Page Memory

**Priority:** P0 --- Launch-critical

Combine the Permanent Web Library and Universal Page Memory into one
integrated experience. Save useful pages and preserve the user's
highlights, notes, and annotations alongside them.

**Launch requirements** - Save pages for later and offline access where
technically possible. - Preserve relevant page content and resources in
a local archive. - Add highlights, notes, and annotations. - Keep a
clear connection to the original source URL. - Search and organise saved
material. - Provide deletion, export, and storage-management controls.

**Important boundaries** - Do not promise perfect archival fidelity for
every dynamic or authenticated website. - Clearly distinguish saved
content from the current live page. - Do not save passwords, payment
details, or private form data.

**Success measure:** Users can return to important material and their
own notes even when the original page changes or is unavailable.

#### 5. Page Remix

**Priority:** P1 --- High-value launch feature

Let users make persistent, personal adjustments to supported websites so
pages better fit their preferences.

**Launch requirements** - Hide distracting or unwanted page elements. -
Adjust typography, spacing, and selected visual properties. - Save a
remix per site or page. - Enable, disable, edit, and reset remixes
easily. - Make it clear when a page has been modified by the user.

**Important boundaries** - Start with a dependable set of supported
modifications rather than promising arbitrary redesign of every
website. - Provide a one-click reset. - Ensure remixes do not interfere
with security indicators, consent controls, or essential site
functionality.

**Success measure:** Users can make frequently visited websites more
comfortable and focused, with changes persisting across visits.

### Privacy and user control

#### 6. Privacy Receipt

**Priority:** P1 --- High-value launch feature

Show understandable, evidence-based information about privacy
protections applied during browsing.

**Launch requirements** - Report measurable events such as known
trackers blocked and third-party requests or cookies handled by the
browser's protection systems. - Explain what each metric means. -
Provide a per-site view and a clear privacy summary. - Avoid exaggerated
or unverifiable claims.

**Important boundary:** Do not claim to detect or prevent every form of
tracking or fingerprinting.

#### 7. Burner Tabs

**Priority:** P1 --- High-value launch feature

Provide temporary, isolated browsing sessions that discard their locally
stored session data when closed, within clearly defined technical
limits.

**Launch requirements** - Make temporary status obvious. - Isolate
relevant cookies and site storage from normal browsing. - Clear the
temporary session's stored data when it closes. - Explain what is and is
not erased.

**Important boundary:** Do not describe Burner Tabs as anonymity or
protection against network operators, websites, malware, or device-level
monitoring.

#### 8. Trust Dial

**Priority:** P1 --- High-value launch feature

Provide understandable per-site privacy and permission controls in one
place.

**Launch requirements** - Show important site permissions and protection
status. - Offer clear, safe presets where appropriate. - Allow users to
inspect and change individual permissions. - Explain when a setting may
affect site functionality.

**Important boundary:** The dial must reflect actual browser controls
and states, not create a misleading numerical security score.

#### 9. Automatic Link Cleaner

**Priority:** P2 --- Useful supporting feature

Remove recognised tracking parameters from links when safe to do so.

**Launch requirements** - Use a maintained list of known tracking
parameters. - Preserve parameters required for the destination to
work. - Provide an option to disable cleaning for a site or link. -
Avoid breaking referral, login, payment, or other essential flows.

**Success measure:** Common tracking parameters are removed without
disrupting navigation.

### Productivity

#### 10. Intelligent Tab Rules

**Priority:** P1 --- High-value launch feature

Offer simple, understandable rules for organising and managing tabs.

**Launch requirements** - Allow rules based on domains, user-selected
groups, or workspace context. - Support actions such as grouping,
moving, and suggesting tabs for sleeping. - Make automatic actions
visible and reversible. - Provide a clear pause/disable control.

**Launch boundary:** Start with a small set of reliable rules. Avoid an
elaborate automation language in the first release.

#### 11. Macro Buttons

**Priority:** P2 --- Useful supporting feature

Let users run a saved sequence of supported browser actions from one
button or command.

**Launch requirements** - Provide a small set of useful browser
actions. - Let users create, name, edit, and delete simple macros. -
Preview or confirm consequential actions. - Make failures visible and
provide a way to stop execution.

**Launch boundary:** Keep the first version focused on browser actions.
Do not attempt unrestricted scripting or arbitrary control of websites.

### Visual identity

#### 12. Three Interface Identities: Glass, Cockpit, and Paper

**Priority:** P0 --- Launch-critical brand experience

Make the three identities feel like distinct, coherent ways to use
Nirva.

-   **Glass:** Ambient, translucent, visually expressive.
-   **Cockpit:** Dense, technical, information-focused.
-   **Paper:** Calm, editorial, reading-focused.

**Launch requirements** - Apply each identity consistently across core
browser surfaces. - Keep controls, labels, and navigation familiar
across identities. - Respect accessibility, contrast, and reduced-motion
preferences. - Ensure the visual system does not compromise performance.

#### 13. Theme Studio

**Priority:** P1 --- High-value launch feature

Give users a simple way to customise the appearance of Nirva within a
coherent design system.

**Launch requirements** - Offer curated themes and controlled
customisation. - Centralise colours, typography, and appearance
tokens. - Preview changes before applying them. - Provide reset and
accessible contrast safeguards. - Make themes work consistently across
Glass, Cockpit, and Paper.

**Launch boundary:** Prioritise quality and consistency over unlimited
low-level interface rearrangement.

------------------------------------------------------------------------

## 3. Two premium motion experiences

These are **visual polish**, not additional flagship product pillars.
Include them only after the core browser interactions are stable and
performance-tested.

### 14. Spring Physics

**Priority:** P2 --- Premium polish

Use subtle spring-like motion for selected interactions such as dragging
tabs, rearranging items, and opening or closing panels.

**Guidelines** - Motion should communicate position, hierarchy, and
state. - Keep animations short and restrained. - Avoid continuous motion
and unnecessary bounce. - Respect reduced-motion settings. - Do not
animate large numbers of elements simultaneously.

### 15. Link-to-Tab Morph

**Priority:** P2 --- Optional signature polish

When a user opens a link in a new tab, use a brief transition that
visually connects the source link to the new tab.

**Guidelines** - Keep the transition subtle and fast. - Never delay
navigation or make the browser feel slower. - Disable or simplify it on
low-performance devices and when reduced motion is enabled. - Treat it
as a delightful finishing detail, not a reason to postpone launch.

------------------------------------------------------------------------

## 4. Features deliberately deferred

These are not rejected permanently. They should move to later releases
unless implementation is already complete and stable.

  -----------------------------------------------------------------------
  Feature                             Reason to defer
  ----------------------------------- -----------------------------------
  Tab Canvas                          Interesting, but not essential to
                                      the launch promise

  Change Watch                        Useful, but adds monitoring and
                                      scheduling complexity

  Smart Scenes                        More automation logic and
                                      configuration

  Universal Media Bar                 Helpful convenience, not a core
                                      differentiator

  Four-Page Workspace                 Competitive feature; not central to
                                      Nirva's identity

  Peek                                Useful convenience, lower launch
                                      impact

  Web Apps                            Available in other browsers and
                                      operating-system workflows

  Search Result Stepping              Relatively minor convenience

  Panic Key                           Useful for some users, but not
                                      launch-defining

  Per-Tab Proxy Routing               Significant networking, DNS,
                                      WebRTC, and leak-testing burden

  Locked Workspaces                   Requires careful authentication and
                                      security design

  Adaptive Interface Tint             Visual enhancement, not essential

  Fully Movable Interface             High customisation complexity

  Magnetic Split View                 Defer bespoke interaction polish
                                      unless existing split view needs it

  Cookie Banner Killer                Website-specific reliability and
                                      consent-handling risks

  Lookalike Alarm                     Explicitly excluded from the launch
                                      scope
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 5. First-run experience

The first launch should demonstrate Nirva rather than confront new users
with a wall of settings.

Suggested flow:

1.  **Welcome:** Introduce the idea that Nirva remembers and adapts.
2.  **Choose an identity:** Glass, Cockpit, or Paper.
3.  **Experience Time Travel:** Show a safe sample timeline and explain
    restoration.
4.  **Try Read-Everything Search:** Demonstrate finding a page from a
    phrase.
5.  **See Live Clips:** Show how a selected webpage region becomes a
    useful panel.
6.  **Understand privacy:** Explain local storage, exclusions, and
    optional external connections in plain language.
7.  **Start browsing:** Arrive at a clean, personalised browser.

The user should be able to skip the tour and change every choice later.

## 6. Launch quality gates

Do not ship a flagship feature just because its interface is complete.
It should pass its reliability and performance gates.

### Performance

-   Measure cold start, new-tab time, tab switching, memory use, and CPU
    use.
-   Test with realistic numbers of tabs and workspaces.
-   Ensure indexing, snapshots, clips, and animations do not make
    ordinary browsing feel slower.
-   Provide controls to pause or limit background work.

### Data integrity

-   Test crash recovery and interrupted writes.
-   Test snapshot restoration without destroying the current session.
-   Test library export, deletion, and storage limits.
-   Make retention and deletion behaviour understandable.

### Privacy and security

-   Keep personal browsing memory local by default.
-   Exclude private browsing and sensitive data from indexing and
    snapshots by default.
-   Document optional external network requests.
-   Test permissions and isolation rather than relying on visual
    indicators.
-   Avoid absolute claims such as "nothing is ever transmitted" unless
    technically true in every supported configuration.

### Accessibility and motion

-   Maintain readable contrast and keyboard access.
-   Use adequately sized interactive targets.
-   Respect operating-system reduced-motion preferences.
-   Ensure animations never block navigation or essential actions.

### Release readiness

-   Sign installers and update packages.
-   Test upgrades, rollback, and clean installation.
-   Establish a rapid process for integrating upstream Firefox security
    fixes.
-   Publish known limitations and a clear way to report bugs.

------------------------------------------------------------------------

## 7. Launch messaging

### Main positioning

**Nirva --- The browser that remembers.**

### Supporting messages

-   **Time Travel:** Your browsing has a rewind button.
-   **Read-Everything Search:** Find what you remember reading.
-   **Live Clips:** Keep the parts of the web that matter close.
-   **Web Library + Page Memory:** Keep what you learn, with your own
    notes.
-   **Three Identities:** Choose how you want the web to feel.

### Suggested launch statement

Nirva is a personal web environment built around memory, control, and a
more adaptable browsing experience. Revisit your browsing, find
information across eligible pages you've read, keep useful web content
close, and shape the interface around the way you work.

Avoid claiming that individual features are entirely unprecedented. The
stronger and more defensible claim is that Nirva brings these
experiences together in one integrated, Firefox-based browser.

------------------------------------------------------------------------

## 8. Final scope summary

  Scope                                                                                   Count
  ------------------------------------------ --------------------------------------------------
  Core launch additions                                                                  **13**
  Premium motion experiences                                                              **2**
  Total planned additions in this document                                               **15**
  Explicitly excluded                                                           Lookalike Alarm
  Existing work                                Nirva versions 1.0--1.8, as previously confirmed

**Recommended principle:** Launch fewer things exceptionally well. The
memorable part should be the experience of using Nirva---not the length
of its feature list.
