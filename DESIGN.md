# Nirva design

The owner approved these designs. Build them exactly. Values live in `design/tokens.css`; the
approved screens are in `designs/` as plain HTML with every measurement inline. When a screen you
need was not drawn, follow the rules below and show the owner before finishing.

## Reference screens

| File | What it shows |
|---|---|
| `designs/Welcome.html` | First-launch chooser (S2) |
| `designs/Main.html` | Glass bright: sidebar, island toolbar, page, privacy receipt (S3, S4, P3) |
| `designs/Home.html` | Glass bright home (H1, H3) |
| `designs/HomeDark.html` | Glass dark home |
| `designs/Cockpit.html` | Cockpit home with time travel ribbon (H6) and command pill (T1) |
| `designs/Paper.html` | Paper bright home with expanded sidebar |
| `designs/PaperDark.html` | Paper dark home |
| `designs/Logo.html` | The logo and its sizes |

All are drawn at 1440 by 900. Sample text, numbers and site names in them are placeholders.
Text in square brackets, such as [YOUR CITY], marks data that comes from the owner.

Not drawn yet (derive from the rules, then show the owner): Glass dark browsing window, Paper and
Cockpit browsing windows, tab canvas, theme studio, time travel timeline, site profile panel,
settings pages.

## Rules shared by all looks

- One 12-column grid with a 20 px gap. Everything aligns to it; nothing is placed by eye.
- Anything clickable is at least 44 by 44 px, even when the visible mark is smaller.
- One accent colour per look. Use it for the single most important action and for "now" or
  "active" marks. Never for decoration.
- Text contrast is at least 4.5:1 against its real background, including text on glass.
- Thin weights and hairlines, never heavy fills. If something looks chunky it is wrong.
- Icons are 16 px line icons with a 1.5 px stroke and round ends. No emoji, no filled icons except
  the play button.
- Fonts are bundled inside the browser. Never load them from the network. Families: Hanken
  Grotesk, Manrope, JetBrains Mono, Newsreader, Figtree. Keep each font's licence file with it.
- Site icons in the sidebar show the site's real favicon. The coloured squares and dots in the
  designs stand in for favicons.

## Glass

- Soft blurred light shapes on a pale (bright) or near-black (dark) ground, with two thin arcs.
- Panels are frosted: translucent fill, 1 px light border, background blur, very soft shadow,
  20 px corners.
- The clock sits directly on the wallpaper, 148 px, weight 200, tight tracking.
- Labels are 11 px, upper case, 0.14 em tracking. Body text is 13 to 14 px.
- Rows inside panels are separated by hairlines. A progress value is drawn as a 1 px dark line
  over the row's hairline.
- In the browsing window the sidebar has no fill; only the active tab sits on a glass pill.
- One panel per screen may be inverted (dark on bright, light on dark) for emphasis.

## Cockpit

- Near-black ground. No boxes, no fills, no shadows: structure comes from 1 px lines only.
- Labels are JetBrains Mono, 12 px, upper case. Text and numerals are Manrope; the clock is
  152 px, weight 200.
- Amber is used only for: the active workspace underline, the Now marker, the heaviest tab, and
  primary actions.
- Lists are rows 48 px high with a hairline under each; the hairline doubles as the progress bar.
- The home is built around the time travel ribbon: one horizontal line, a dot per past session,
  and Now at the right in amber with a soft halo.
- The command bar rests as a slim pill at the bottom centre and expands upward when opened.

## Paper

- Warm paper ground, slightly darker sidebar, a single dark rule under the clock.
- Widgets are flat pastel cards with 6 px corners, no shadow, no border. Each widget type keeps
  its own pastel: to-do sage, focus powder, note butter, countdown blush, reading lilac. Neutral
  panels use the raised paper colour with a hairline border.
- Headings and numerals are Newsreader; headings are italic, 20 px. Interface text is Figtree.
- The date is written out in words, in italics.
- Quick links are plain serif text links, not an icon dock.
- Dark mode keeps the same structure with deep muted versions of each pastel.

## Island toolbar

- 48 px high, fully rounded, centred, about 620 px wide in a 1440 px window; never full width.
- Contents left to right: back, forward, the address (centred, domain in medium weight and the
  path in a quieter colour), privacy receipt count, split view.
- Loading is a 1 px accent line moving along its lower edge.
- Collapsed state is a 3 px line of the same width.

## Motion

- Durations and easing come from the tokens. Nothing exceeds 200 ms.
- Springy style uses `--nirva-ease-spring`; Smooth uses `--nirva-ease`; Minimal uses fades only.
- Animate only `transform` and `opacity`. Never animate layout properties.

## Logo

`branding/nirva-icon.svg` is the app icon; `branding/nirva-mark.svg` is the mark alone, drawn in
the current text colour. The mark is an N in one stroke: two stems joined by a single arc. At
32 px and below, thicken the stroke as shown in `designs/Logo.html`.
