---
name: ui-conventions-observed
description: Visual language, wording style and reusable patterns already used in JobFit AI screens (check before designing new ones)
metadata:
  type: project
---

Seen in JobsPage.vue, TrackerDetailPage.vue, StatusMenu.vue, ui.css (2026-10-26):

- Look: daisyUI theme variables only (no fixed colors). Cards = `ui-surface ui-card` on a soft page; tokens `--ui-text-soft`, `--ui-soft`, `--ui-error-ink`, `--ui-accent-ink`; tones via `ui-tone-*` + `ui-pill`. Primary CTA = `ui-btn ui-btn-gradient` (size large, min-height 56, expand block) like Go. Small secondary = `fill="outline" size="small"` min-height 40.
- Forms: `ion-input/textarea` with `label-placement="stacked"`, `fill="outline"`, `.field` radius 12, `helper-text` + `error-text`; label ends with "(optional)" for optional fields; errors appear after blur (touched) and again on Go.
- Under a disabled primary button a `.go-hint` line (0.82rem, centered, soft) explains why.
- Errors: `.error-box` (icon + text, role=alert) near the action; `.ui-error-text` for small inline.
- Feedback: `showToast` = top, 2.2 s success / 3.5 s error, plain text only, no action. `confirmAction(header, message, confirmText)` for "are you sure". `chooseAction` = bottom action sheet.
- Tracker detail: tab-body is a flex column gap 12; each tab with a document has a `.dl-row` of two outline "Download PDF/DOCX" buttons. Empty tab = plain `ui-surface ui-card none` paragraph (the EmptyState illustration is too big for inside a card/tab; use it only for whole-screen empties).
- Wording: plain, polite, short sentences, ellipsis character in "Saving…"; "Please ..." for requests; "Try again" for retry; no emojis.
- Working state on Jobs: spinner + rotating status line (5 s each) + "This can take up to 2 minutes. Please keep this screen open." + outline Cancel.
- Container: ui-page max 560px; detail page 760px. Segments: `.seg` 44px, label 0.82rem, may wrap to two lines.
