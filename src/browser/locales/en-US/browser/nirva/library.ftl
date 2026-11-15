# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

nirva-library-title = Library
nirva-library-eyebrow = Pages you keep, with your own notes
nirva-library-intro = Save a page to read it later, even offline, and keep your highlights and notes beside it. On any page press Ctrl K and choose “Save this page to Library”, or select some text and choose “Highlight selected text”.
nirva-library-private-window = The Library is not available in private windows. Nothing from a private window is saved.
nirva-library-privacy-title = Stored on this device
nirva-library-privacy-copy = Saved copies, highlights and notes stay in this { -brand-short-name } profile and are never uploaded. A copy keeps the page’s text, images and styles as they looked when you saved it; scripts, form entries and hidden form fields are left out, and some pages will not look exactly like the original. Private windows, Burner tabs, sign-in and payment pages are never saved.
# $pages (Number) - Pages in the library. $copies (Number) - Pages that have a saved copy.
# $size (String) - Disk space the saved copies use, already formatted with its unit.
nirva-library-usage = Pages: { $pages } · Saved copies: { $copies } · Space used: { $size }
nirva-library-export-all = Export everything
nirva-library-delete-all = Delete everything
nirva-library-delete-all-confirm = Delete every saved copy, highlight and note in your Library? This cannot be undone.
nirva-library-list-label = Your collection
nirva-library-list-title = Saved pages and notes
# $count (Number) - How many pages are listed.
nirva-library-count = { $count ->
    [one] 1 page
   *[other] { $count } pages
}
nirva-library-search-label = Search
nirva-library-search =
    .placeholder = Titles, notes, highlights and saved text
nirva-library-tag-filter-label = Tag
nirva-library-tag-all = All tags
nirva-library-empty-title = Nothing saved yet
nirva-library-empty-copy = Open a page, press Ctrl K, and choose “Save this page to Library”. To keep a passage, select it, then right-click and choose “Highlight Selection”.
nirva-library-no-results = Nothing in your Library matches this search.

## One page in the list

# $date (String) - When the copy was saved, as a formatted date and time.
# $size (String) - The size of the saved copy, already formatted with its unit.
nirva-library-copy-saved = Copy saved { $date } · { $size }
# $skipped (Number) - Images, fonts or styles that could not be included in the copy.
nirva-library-copy-partial = { $skipped ->
    [one] 1 image or font could not be included in this copy.
   *[other] { $skipped } images or fonts could not be included in this copy.
}
nirva-library-no-copy = Highlights and notes only. No saved copy.
nirva-library-tags-label = Tags
nirva-library-tags-input =
    .placeholder = Separate tags with commas
nirva-library-page-note-label = Note about this page
# $count (Number) - How many highlights this page has.
nirva-library-highlights-heading = { $count ->
    [one] 1 highlight
   *[other] { $count } highlights
}
nirva-library-annotation-note-label = Note
nirva-library-remove-highlight = Remove
nirva-library-open-copy = Open saved copy
nirva-library-open-live = Open live page
nirva-library-export-copy = Export copy
nirva-library-remove-copy = Remove copy
nirva-library-delete-page = Delete
# $title (String) - The title of the page being deleted.
nirva-library-delete-page-confirm = Delete “{ $title }” from your Library, with its saved copy, highlights and notes?
# $title (String) - The title of the page whose saved copy is being removed.
nirva-library-remove-copy-confirm = Remove the saved copy of “{ $title }”? Your highlights and notes are kept.

## Messages shown on the Library page after an action

nirva-library-status-note-saved = Note saved.
nirva-library-status-tags-saved = Tags saved.
# $title (String) - The title of the page that was deleted.
nirva-library-status-deleted = Deleted “{ $title }”.
nirva-library-status-copy-removed = Saved copy removed. Highlights and notes are kept.
nirva-library-status-highlight-removed = Highlight removed.
nirva-library-status-copy-exported = Copy exported.
# $copies (Number) - How many saved copies were written to the chosen folder.
nirva-library-status-exported = { $copies ->
    [one] Exported 1 saved copy with your notes to a “Nirva Library” folder.
   *[other] Exported { $copies } saved copies with your notes to a “Nirva Library” folder.
}
nirva-library-status-export-failed = The export could not be written. Choose another folder and try again.
nirva-library-status-cleared = Your Library is empty.
nirva-library-export-copy-title = Export saved copy
nirva-library-export-all-title = Choose where to export your Library

## Messages shown above a page

nirva-library-notice-saved = Saved to your Library. The copy stays on this device.
nirva-library-notice-open-library =
    .label = Open Library
    .accesskey = O
nirva-library-notice-not-supported = This page cannot be kept in the Library. Private windows, Burner tabs, sign-in and payment pages are left out.
nirva-library-notice-unsupported = { -brand-short-name } could not save a copy of this page.
nirva-library-notice-too-large = This page is too large to save as one copy.
nirva-library-notice-select-first = Select some text on the page first.
nirva-library-notice-selection-too-long = That selection is too long to highlight. Select a shorter passage.
nirva-library-notice-selection-unsupported = { -brand-short-name } could not highlight that selection.
# $host (String) - The website the copy was saved from, for example "example.com".
# $date (String) - When the copy was saved, as a formatted date and time.
nirva-library-copy-notice = Saved copy of { $host }, saved { $date }
nirva-library-copy-notice-open-live =
    .label = Open live page
    .accesskey = O

## Items in the page context menu

nirva-library-context-highlight =
    .label = Highlight Selection
    .accesskey = H
nirva-library-context-note =
    .label = Add Note to Selection
    .accesskey = d
nirva-library-context-remove =
    .label = Remove Highlight
    .accesskey = v
