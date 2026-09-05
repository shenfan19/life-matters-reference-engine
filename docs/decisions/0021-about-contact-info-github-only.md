# 0021 — About dialog contact-info layering: project repo + author email

**Status**: implemented
**Date**: 2026-04-09

## Background

The About dialog originally displayed three pieces of personal contact information: email, personal GitHub, and homepage. As the project now addresses several different audiences (general users / coders / academic users), the information-layering strategy needed a rethink, distinguishing "project information" from "author information."

## Decision

The About dialog is divided into two areas by a divider:

**Above the divider (project area)**
- Project name, subtitle, version · MIT License
- Project GitHub repo link: `github.com/shenfan19/life-matters`

**Below the divider (author area)**
- Fan Shen · Sun Yat-Sen University
- Email: `shenfan@mail.sysu.edu.cn`

A homepage link no longer appears in the About dialog.

## Rationale

**The GitHub repo belongs in the project area, not the author area:**
A user clicking GitHub from the About dialog is looking for the project's issues, source code, or changelog; linking to the project repo serves that need more directly than a personal homepage.

**Email belongs in the author area:**
The project's audience is already fairly narrow (medical/sociological readers plus coders), so actual traffic is low and the risk of scraper spam is negligible. Email is the most direct feedback and collaboration channel, and omitting it would close off that path.

**Why the homepage is omitted:**
Academic users arrive through search engines or direct outreach (the author includes it when emailing), so they don't need the About dialog to point them there.

**Three-tier contact-channel hierarchy:**

| Tier | Entry point | Audience |
|------|------|------|
| 1 — LM About dialog | Project repo + author email | General users, coders |
| 2 — GitHub profile | Email + homepage | Technical users, active seekers |
| 3 — Homepage / institutional page | Full academic information | Academic users (via search engines or direct outreach) |

**Link color:**
Both the repo and email links use `c.textMute` (gray), keeping the same visual tier as the version number and institution name, so they don't compete with the title (`c.text`) for attention.

## Files changed

- `game/src/components/AboutModal.tsx` — `AUTHOR` switched to a `repo` field; the repo link moved above the divider; the author area became email only; link color unified to `c.textMute`
- `sim_gui/src/App.tsx` — same as above
