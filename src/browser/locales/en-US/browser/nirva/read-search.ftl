# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

nirva-read-search-title = Read-Everything Search
nirva-read-search-eyebrow = Browsing memory · on this device
nirva-read-search-intro = Search the words you remember from pages you have visited. Matches include a passage, the page address, and when Nirva last saw it.
nirva-read-search-find-label = Search your reading
nirva-read-search-find = Find a page by its words
nirva-read-search-query-label = Words to find in your pages
nirva-read-search-query-placeholder = Search a phrase, title, or web address
nirva-read-search-search = Search
nirva-read-search-privacy = Page text stays in this { -brand-short-name } profile. Private and Burner tabs, sign-in and payment pages, and pages with secret URL parameters are skipped. You can pause indexing, block a site or page, change how long text is kept, or delete it here.
nirva-read-search-management-label = Read-Everything Search controls
nirva-read-search-empty = No matching pages yet. Visit a page with this phrase, then search again.
# $count (Number) - How many indexed pages match the search.
nirva-read-search-results-count = { $count } matching pages
nirva-read-search-no-results = No pages match those words.
# $date (String) - When the page was last visited.
# $count (Number) - How many times the page was visited.
nirva-read-search-result-visited-context =
    { $count ->
        [one] Visited { $date } · 1 visit
       *[other] Visited { $date } · { $count } visits
    }
# $date (String) - When the copy was saved.
nirva-read-search-result-saved-context = Saved locally on { $date }
# $query (String) - The words the user searched for.
nirva-read-search-result-metadata-match = The title or address matched “{ $query }”.
nirva-read-search-source-live = Live page
nirva-read-search-source-saved = Saved copy
nirva-read-search-open-live = Open live page
nirva-read-search-open-copy = Open saved copy
nirva-read-search-exclude-page = Stop indexing this page
nirva-read-search-forget-page = Forget this page
nirva-read-search-controls-label = Keep your index in your control
nirva-read-search-controls = Index controls
# $count (Number) - How many pages are in the index.
nirva-read-search-page-count = { $count } pages indexed
nirva-read-search-pause = Pause indexing
nirva-read-search-resume = Resume indexing
nirva-read-search-retention = Keep page text for
nirva-read-search-seven-days = 7 days
nirva-read-search-thirty-days = 30 days
nirva-read-search-ninety-days = 90 days
nirva-read-search-delete-before = Delete pages visited before
nirva-read-search-delete-date-action = Delete older pages
nirva-read-search-domain-label = Never index this site
nirva-read-search-domain-placeholder = example.com
nirva-read-search-domain-add = Block site
nirva-read-search-sites-label = Site index
nirva-read-search-sites = Indexed sites
nirva-read-search-sites-empty = No sites are indexed yet.
nirva-read-search-excluded-sites = Sites that are not indexed
nirva-read-search-excluded-sites-empty = No sites are blocked.
nirva-read-search-excluded-pages = Pages that are not indexed
nirva-read-search-excluded-pages-empty = No individual pages are blocked.
nirva-read-search-pages-label = Page index
nirva-read-search-pages = Recently indexed pages
nirva-read-search-pages-empty = No pages are indexed yet.
nirva-read-search-exclude-site = Block and delete site text
nirva-read-search-delete-site = Delete site text
nirva-read-search-allow-site = Allow site
nirva-read-search-allow-page = Allow page
nirva-read-search-clear-all = Delete all indexed text
nirva-read-search-confirm-label = Check before deleting
nirva-read-search-confirm-clear-title = Delete all indexed page text?
nirva-read-search-confirm-clear-copy = This removes every page passage stored in this { -brand-short-name } profile. Your site and page exclusion choices remain.
nirva-read-search-confirm-clear-action = Delete all text
nirva-read-search-confirm-date-title = Delete older page text?
# $date (String) - Text last visited before this date is removed.
nirva-read-search-confirm-date-copy = This removes page text last visited before { $date }.
nirva-read-search-confirm-date-action = Delete older text
nirva-read-search-cancel = Cancel
nirva-read-search-status-updated = Read-Everything Search was updated.
nirva-read-search-status-paused = Indexing is paused.
nirva-read-search-status-resumed = Indexing has resumed.
# $reason is a short internal error message.
nirva-read-search-status-error = The change could not be completed: { $reason }

## Narrowing results, recent reading and the index section

nirva-read-search-filter-time =
    .aria-label = When you read it
nirva-read-search-filter-any-time = Any time
nirva-read-search-filter-week = Past week
nirva-read-search-filter-month = Past month
nirva-read-search-filter-kind =
    .aria-label = Kind of page
nirva-read-search-filter-all = All pages
nirva-read-search-filter-live = Live pages
nirva-read-search-filter-saved = Saved copies
nirva-read-search-recent = Recently read
nirva-read-search-manage = Manage your index
# $count (Number) - Pages in the index. $days (Number) - How long page text is kept.
nirva-read-search-manage-summary =
    { $count ->
        [one] On · 1 page · kept { $days } days
       *[other] On · { $count } pages · kept { $days } days
    }
# $count (Number) - Pages in the index. $days (Number) - How long page text is kept.
nirva-read-search-manage-summary-paused =
    { $count ->
        [one] Paused · 1 page · kept { $days } days
       *[other] Paused · { $count } pages · kept { $days } days
    }
