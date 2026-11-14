# Design Read-Back: moodboard-selection

Approved by developer on 2026-11-14.

- Source of truth: `design/openpencil/bricomission_B2C_app.fig`, page **Moodboard**, designed and read back through the `open-pencil` MCP (OpenPencil 0.16.0).
- Read-back exports (JSX round-trip format) in `design/openpencil/moodboard-selection/`:
  - `1-moodboard-empty.jsx`, `2-moodboard-with-items.jsx`, `7-moodboard-360-check.jsx` (screens)
  - `3-reference-upload-states.jsx`, `4-limit-reached.jsx`, `5-continue-hints.jsx`, `6-alerts.jsx` (state panels; their annotation text is normative)
  - `overview.png`
- Images in the design are placeholders (the public-domain `infra/ai/samples/kitchen-sample.jpg`); the real gallery images are the generated Style Gallery (spec Decision 2).
- Designs are English only; all 11 locales come from `apps/web/messages/<locale>.json` (namespace `moodboard`).
- Where silent, the approved Capture read-back (`docs/design/kitchen-capture-draft.md`), `docs/design/brand-logo-animation.md` and DESIGN.md govern. Implement strictly from this artifact and the JSX files.

## Developer decisions taken during the design step

1. **Gallery browsing (spec OQ-9): style filter chips** ("All" + the 8 styles) over one 2-column grid. The chip row is a `radiogroup`, scrolls horizontally and bleeds to the screen edge; "All" is selected by default and shows all 24 images in manifest order.
2. **Selected gallery state:** 3 px `primary` stroke on the tile plus a 28 px `primary` circle badge with a white `lucide:check` 16 (never color alone). Unselected: 28 px white circle badge with shadow `0 1 2 #0000001F` and `lucide:plus` 16 `text`. The whole tile is the toggle button (`aria-pressed`, accessible name `{Style} kitchen {n}`).
3. **One moodboard grid:** uploads and gallery picks share the "Your moodboard" grid, in position order, followed by the "Add your photos" tile.

## Page structure (frames 1, 2, 7)

Background `#FAFAF8`. Header (fixed), Content (scrolls under the sticky bar), BottomActionBar (sticky). Same header as Capture: back button (44 circle `surfaceMuted`, `lucide:arrow-left` 20, accessible name `Back to your kitchen`, goes to `/kitchen-projects/new`) + HeaderActions (LanguageSelector + AccountEntry, compact selector below 375 px). No logo.

| Element | Spec | Copy (en) / behavior |
| --- | --- | --- |
| Content | column, gap 32, pt 8, px 16, pb 24 | — |
| StepIndicator | as Capture; both segments `primary` | `Step 2 of 2` |
| Title | 28/34 bold `text` | `Your style` |
| Helper | 16/24 `textMuted` | `Pick kitchens you like and add your own references. We'll use them to design your new kitchen.` |
| Section Moodboard header | row space-between: title 18/24 semibold `text` + counter 14/20 semibold `textMuted` (`aria-live="polite"`) | `Your moodboard` · `{count} of {max}` (e.g. `3 of 12`) |
| Upload rules | 14/20 `textMuted` | `Your photos: JPG, PNG, WebP or HEIC · up to 15 MB` |
| MoodboardGrid | 2 flexible columns, gap 16 both axes, tiles 4:3 (171×128 at 390, 156×117 at 360), radius 20, `object-fit: cover` | items by position, then the add tile |
| MoodboardItem | image tile, p 4; top-right Remove (44 hit area, 32 white circle, shadow, `lucide:x` 16); bottom-left source label (inset 4): white pill, px 8 py 2, 12/16 semibold `text` | upload: `lucide:image-up` 12 + `Your photo`, alt `Your reference photo {n}`, remove name `Remove reference {n}`; gallery: style name, alt `{Style} kitchen {n}`, remove name `Remove {Style} kitchen {n}` (removing a gallery item deselects it in the gallery) |
| AddReferenceTile | as Capture AddPhotoTile | `Add your photos`; file picker (JPG/PNG/WebP/HEIC, multiple) |
| Empty state (frame 1) | grid has only the add tile in the first column; below it 14/20 `textMuted` | `Nothing here yet. Pick kitchens from the gallery or add your own photos.` |
| Section Style gallery header | title 18/24 semibold + helper 14/20 `textMuted` | `Style gallery` · `Tap a kitchen to add it to your moodboard. Tap again to remove it.` |
| StyleFilter chips | row gap 8, chips h 44, px 16, pill; selected `primary` fill + white 14/20 semibold; others `surfaceMuted` + `text` | `All`, `Modern`, `Scandinavian`, `Industrial`, `Farmhouse`, `Classic`, `Mediterranean`, `Minimalist`, `Japandi` |
| GalleryGrid | 2 flexible columns, gap 16, tiles 4:3 radius 20, p 8, column justify space-between | top-right badge (see decision 2); bottom-left style label pill (white, px 8 py 2, 12/16 semibold `text`) |
| BottomActionBar | as Capture | — |
| Continue enabled (frame 2) | SaveStatus (as Capture) above the primary CTA (`Continue` + `lucide:arrow-right`) | goes to `/kitchen-projects/new/generate` |
| Continue disabled (frame 1) | hint 14/20 `textMuted` centered above a disabled CTA (`surfaceMuted` fill, 1 px `border`, label `textMuted`, no arrow; `aria-disabled` + `aria-describedby`) | `Add at least one kitchen or photo to continue.` |

## Panels (normative)

- **3 · Reference upload states:** same tile states, progress bar, icons and error copy as Capture photo tiles (uploading `Uploading… {percent}%`, processing `Processing…`, queued `Waiting…`, error with Retry + Remove or Remove only). Uploads count toward the 12. Gallery picks keep working while storage is down.
- **4 · Limit reached:** counter `12 of 12`; the add tile disabled (`surfaceMuted`, icon and label `textMuted`); unselected gallery tiles disabled (`aria-disabled`, badge `surfaceMuted` with `lucide:plus` `textMuted`); selected tiles stay pressable (tap removes). Message 14/20 `textMuted` below the moodboard grid and under the gallery helper: `You've added 12 items, the maximum. Remove one to add another.`
- **5 · Continue hints:** no items → `Add at least one kitchen or photo to continue.`; items but Capture incomplete → `Your kitchen still needs a photo and all three measurements.` plus the link `Go to your kitchen` (`lucide:arrow-left` 16 + 14/20 semibold underlined `primary`, 44 tall, to Capture) above the disabled CTA. When both are missing the Capture hint wins.
- **6 · Alerts:** same alert component and save-status variants as Capture, above the title. Offline (`warning`, `lucide:cloud-off`): `You're offline. What you've saved is safe; reconnect to keep going.`; add tile, remove buttons and gallery tiles disabled, filter chips still filter what is loaded, unloaded thumbnails show the placeholder, Continue disabled. Draft expired (`primary` stroke, `lucide:info`, dismissible Close 44): `Your previous draft expired after 7 days without changes. Start again.` on an empty moodboard.

## Accessibility and Responsive Notes

- Touch targets ≥ 44 px (back, selector, account, remove, chips, gallery tiles, link); buttons 52 px.
- Checked at 360 px with the compact selector (`Nederlands`): header fits, tiles 156 wide, chip row scrolls, no horizontal page overflow.
- OpenPencil lint: 0 errors, 0 warnings on page Moodboard.
- Icons: Lucide via `lucide-react`.
