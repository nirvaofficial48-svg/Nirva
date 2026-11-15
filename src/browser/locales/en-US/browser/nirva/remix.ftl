# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

nirva-remix-title = Page Remix
nirva-remix-eyebrow = Websites, adjusted to suit you
nirva-remix-intro = Hide the parts of a page that distract you and set the font, text size and line spacing you prefer. Your changes return on every visit. On any page press Ctrl K and choose “Remix this site” or “Hide an element on this page”.
nirva-remix-note-title = What a remix can do
nirva-remix-note-copy = A remix only changes how a page looks on this device. It is stored in this { -brand-short-name } profile and nothing is sent to the site. Sign-in and payment pages are never remixed, and sign-in forms, consent prompts, pop-up dialogs and a page’s main content cannot be hidden. Reset returns a site to its original look in one step.
nirva-remix-list-label = Your remixes
nirva-remix-list-title = Sites and pages
# $count (Number) - How many remixes are saved.
nirva-remix-count = { $count ->
    [one] 1 remix
   *[other] { $count } remixes
}
nirva-remix-empty-title = No remixes yet
nirva-remix-empty-copy = Open a page, right-click something you do not want to see and choose “Hide This Element”, or press Ctrl K and choose “Remix this site”.
nirva-remix-for-site = Applies to every page on this site
nirva-remix-for-page = Applies to this page only
nirva-remix-draft = Not remixed yet. Change a setting below to begin.
nirva-remix-enabled = Remix on
nirva-remix-open-site = Open site
nirva-remix-reset = Reset
nirva-remix-reset-all = Reset all remixes
nirva-remix-reset-all-confirm = Remove every remix and return all sites to their original look?
nirva-remix-reset-all-done = All remixes were removed.
# $site (String) - The site or page address whose remix was removed.
nirva-remix-reset-done = { $site } is back to its original look.
nirva-remix-scope-label = Applies to
nirva-remix-scope-site = Every page on this site
nirva-remix-scope-page = This page only
nirva-remix-font-label = Font
nirva-remix-font-site = Site’s own font
nirva-remix-font-serif = Serif
nirva-remix-font-sans = Sans-serif
nirva-remix-font-mono = Monospace
nirva-remix-size-label = Text size
nirva-remix-size-site = Site’s own size
# $value (Number) - Text size as a percentage of the site's own size, for example 125.
nirva-remix-size-option = { $value }%
nirva-remix-spacing-label = Line spacing
nirva-remix-spacing-site = Site’s own spacing
# $value (Number) - Line height as a multiple of the text size, for example 1.6.
nirva-remix-spacing-option = { $value } lines
# $count (Number) - How many page elements this remix hides.
nirva-remix-hidden-heading = { $count ->
    [one] 1 hidden element
   *[other] { $count } hidden elements
}
nirva-remix-hidden-empty = Nothing is hidden. Right-click part of the page and choose “Hide This Element”.
nirva-remix-show-again = Show again
nirva-remix-shown-again = The element is visible again.
nirva-remix-saved = Remix saved.
nirva-remix-save-error = That change could not be saved.
nirva-remix-turned-on = Remix turned on.
nirva-remix-turned-off = Remix turned off. The page shows its original look.
nirva-remix-private-window = Page Remix is unavailable in a private window.
nirva-remix-context-hide =
    .label = Hide This Element
nirva-remix-picker-prompt = Click the part of the page to hide. Esc to cancel.
nirva-remix-chip = Remixed by you
nirva-remix-hidden = Hidden on this site from now on.
nirva-remix-undo = Undo
nirva-remix-protected = That part cannot be hidden. Sign-in forms, consent prompts, dialogs and the main content stay visible.
nirva-remix-unsupported = Nirva could not hide that element. Try a different part of the page.
nirva-remix-not-supported = This page cannot be remixed. Use a regular tab on a web page that is not a sign-in or payment page.
nirva-tab-label-remixed = Remixed
