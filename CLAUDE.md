# CLAUDE.md

Guidance for Claude Code in this repository.

## What this is

One web component, `<sac-data-grid>`: a spreadsheet-grade editable data table
for SACRVM APPKIT apps. It is an add-on module, deliberately **not** part of the
core kit, the same way `sac-md-editor` is. **The full, binding specification is
`SPEC.md`. Read it first.**

`kit/` is the vendored SACRVM APPKIT (the release ZIP from
https://github.com/SACRVM/sacrvm-appkit/releases, dropped in verbatim with
`kit/VERSION`). Never edit it here. To upgrade, delete the folder and unzip the
next release. The grid needs **kit ≥ 2.22.0** (the cell editors, the date / time
helpers and the dialog / menu fixes, see SPEC §6).

## Ecosystem rules (hard)

- **Zero build, forever.** No bundler, no TypeScript, no node_modules, no test
  framework build chain. Plain classic scripts, Custom Elements, plain CSS.
  Dev loop: `npx serve .`, open `index.html`, edit, reload.
- **Tokens only.** Every color comes from the kit's tokens, so light, dark and
  per-app `--accent` work automatically. No raw colors. No thick (≥2px) colored
  borders on rounded surfaces: signal state with a subtle tint or a 1px
  hairline.
- **Use the kit, don't fork it.** Cell editors are the kit's fields in
  `size="cell"`, and strings go through `sac.t()`. If the kit lacks
  something, open an issue on SACRVM/sacrvm-appkit rather than working around
  it here.
- **Owner decides the look.** SPEC §7 records the owner's decisions. A new
  open question goes there: build it configurable, ship a provisional default,
  and ask in a GitHub issue before treating it as final. Never invent visible
  UI beyond the spec.
- **English** in code, comments, docs and commits.

## This repo is public

Commit nothing private: no credentials, tokens, internal hostnames or local
machine paths. Commit messages describe the change, not the context that
produced it. License: MIT, "Copyright (c) 2026 sac-data-grid contributors".
