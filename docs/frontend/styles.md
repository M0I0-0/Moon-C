# Styles (`index.css`)

Source: [`front-end/src/index.css`](../../front-end/src/index.css). One plain CSS file, imported by `main.jsx`. No CSS framework or CSS-in-JS.

## Theme tokens

Defined on `:root` (a dark theme) and overridden per environment class on the root `.app` element (`env-<id>`):

| Token | `:root` (dark) | `.env-home` (light, the one in use) |
|---|---|---|
| `--text` | `#e8ecf1` | `#3b2f26` |
| `--muted` | `#9aa5b1` | `#76614f` |
| `--faint` | `#6b7785` | `#9c8673` |
| `--panel` | `rgba(12, 16, 22, 0.78)` | `rgba(255, 250, 242, 0.9)` |
| `--panel-solid` | `#0f141b` | `#fffaf2` |
| `--line`, `--line-strong` | white at 9 % / 18 % | brown at 13 % / 25 % |
| `--accent` | `#8fc1e3` | `#d9895b` |
| `--accent-ink` | `#0b1a26` | `#fff` |
| `--ok`, `--warn`, `--danger` | `#5cbf8a`, `#e2b34a`, `#e5574b` | (same) |
| `--radius`, `--gap` | `10px`, `14px` | (same) |
| `--font`, `--mono` | Segoe UI / system stack; Cascadia Mono / system monospace | (same) |

`.env-moon` and `.env-mars` palettes (and `.env-grid` / `.env-swatch` styles of an earlier environment picker) are still defined; the app currently always uses `home`. `color-scheme` is `dark` by default and `light` for `env-home` (scrollbars are restyled to match the room).

Status colors follow the same tokens everywhere: `attention` → `--warn`, `urgent` → `--danger`, normal is the default look (`.vrow--<status>`, `.chip--<status>`, `.entry-status--<status>`, `.vd--<status>`).

## Layout

Everything floats over the 3D canvas:

- `.app` is the full-screen container and `.scene` fills it (`position: absolute; inset: 0`);
- `.topbar` is absolute at the top;
- `.panel-left` (320 px) and `.panel-right` (264 px) are absolute, translucent cards with a blur, starting 76 px from the top and scrolling inside;
- `.bottom` (subtitles + chat dock) is centered at the bottom, at most 620 px wide and never under the side panels.

## Sections of the file

| Section | Classes |
|---|---|
| Layout | `.app`, `.scene`, `.topbar`, `.panel`, `.panel-left`, `.panel-right`, `.bottom` |
| Top bar | `.topbar`, `.menu-btn`, `.brand`, `.pill` (`.pill-ok`, `.pill-account`), `.dot`, `.clock`, `.lang-switch`, `.mobile-tabs` |
| Shared bits | `.btn` (`-primary`, `-ghost`, `-danger`, `-light`, `-outline-light`, `-sm`, `-block`), `.icon-btn`, `.chip-btn`, `.avatar`, `.panel-head`, `.panel-sub`, `.fineprint`, `.segmented` |
| Vitals | `.vitals`, `.vitals-summary`, `.vrows`, `.vrow`, `.vrow-dot`, `.vrow-label`, `.vrow-value` |
| Crew (General) | `.crew`, `.crew-list`, `.crew-row` (`--alert`), `.crew-ok`, `.emergency-detail`, `.access-note`, `.alert-reasons`, `.protocol` |
| Announcements | `.announcements`, `.announce-form`, `.announce-list`, `.announce` (`--important`) |
| Alert banner | `.alert-banner`, `.alert-text` |
| AI watermark | `.ai-mark`: a small pill at the top center, over the scene (moved to 116 px from the top on narrow screens). It is the visible AI disclosure: do not hide it |
| Subtitles and chat | `.subtitles` (`--user`, `--alert`), `.dock` (translucent so Moon-C shows behind it), `.dock-toggle`, `.log`, `.log-entry` (`--assistant`, `--emergency`), `.log-system`, `.log-via` (the "offline" tag), `.log-ai` (the "AI" tag), `.chips`, `.composer`, `.mic` (`--on`), `.send` |
| Drawer | `.drawer` (`.open`), `.drawer-overlay`, `.drawer-section`, `.account`, `.row-toggle`, `.sim-row`, `.entry*` (log a reading) |
| Vital detail | `.vd`, `.vd-overlay`, `.vd-head`, `.vd-now`, `.vd-chart`, `.vd-stats`, `.vd-todo`, `.vd-nav`, `.sparkline`, `.sparkline-band`, `.sparkline-line` |
| Guided maneuvers | `.maneuver`, `.maneuver-head`, `.maneuver-env`, `.maneuver-progress`, `.maneuver-step`, `.maneuver-count`, `.maneuver-source`, `.badge` (`--validado`, `--supuesto`), `.maneuver-nav`, `.maneuver-shortcuts`, `.maneuver-summary`, `.maneuver-note`, `.maneuver-notice`, `.maneuver-img` |

## Responsive rules

| Breakpoint | Change |
|---|---|
| ≤ 1180 px | Narrower side panels (280 px and 250 px); the chat fills the space between them |
| ≤ 960 px | The pills on the right of the top bar are hidden and two tabs appear (`.mobile-tabs`). Side panels are hidden and open as solid overlays from those tabs (a panel with `.mobile-open` is shown); an open guide forces the left panel open. The chat spans the whole width and the log is limited to 150 px |
| ≤ 560 px | Vital detail stats in two columns, smaller value font |

## Conventions

- Use the tokens (`var(--accent)`, `var(--danger)`…) instead of literal colors, so a new environment only overrides tokens.
- Keep panels translucent (`--panel`): the 3D scene is the background of the whole screen.
- Component state goes in modifier classes (`block--modifier`), not inline styles.
