# Release process

## Before cutting

- [ ] `npm test` green
- [ ] `npm run test:integration` green
- [ ] `npm run test:live` run at least once against a real video, or an explicit note in
      the release why it was skipped
- [ ] `CHANGELOG.md` has an entry with real content, not a placeholder
- [ ] `docs/SPEC.md` reflects any behavior change, as a **dated supersession note**
- [ ] `PRIVACY.md` updated if anything about telemetry moved
- [ ] Version bumped in **both** `manifest.json` and `package.json` — the packaging script
      refuses to build if they disagree

## Versioning

[Semantic versioning](https://semver.org), with the Chrome constraint that a version is
dot-separated integers only. No `-beta` suffixes in `manifest.json`.

| Bump | When |
|---|---|
| Patch | Bug fixes, host-drift repairs, doc-only releases |
| Minor | New user-visible features, new settings |
| Major | Removing a feature, or a change that resets users' settings |

## Cutting it

```bash
# 1. bump both files to the same version, then:
npm test && npm run test:integration
npm run package          # -> dist/yt-toolkit-<version>.zip

# 2. tag
git commit -am "chore: release v1.6.2"
git tag -a v1.6.2 -m "v1.6.2"
git push && git push --tags

# 3. GitHub release
gh release create v1.6.2 dist/yt-toolkit-1.6.2.zip \
  --title "v1.6.2" \
  --notes-file <(sed -n '/## \[1.6.2\]/,/## \[/p' CHANGELOG.md | head -n -1)
```

Attach the ZIP. That is what people installing unpacked will download.

## Publishing the wiki

Wiki sources live in `docs/wiki/`, versioned with the code, reviewed like the code.

```bash
npm run wiki:publish
```

**One-time setup:** GitHub will not accept a push to a wiki that has never been
initialised. Create any page once at
`https://github.com/dnl-gentile/yt-toolkit/wiki` — the content does not matter, the
publish overwrites it.

Never edit pages in the wiki UI. The next publish overwrites them.

## Chrome Web Store (not yet)

When the listing happens, this is the checklist:

- [ ] Developer account registered (one-time fee)
- [ ] `dist/yt-toolkit-<version>.zip` from `npm run package`
- [ ] Store icon 128×128 — red YouTube square with a white wrench, per `docs/SPEC.md` §1
- [ ] Screenshots at 1280×800: the pace pill, the pace menu, the Subtitles/CC panel with
      our rows, the caption overlay
- [ ] Short description under 132 characters
- [ ] Full description — the README's *Why* and *Features* sections adapt directly
- [ ] **Privacy policy URL** → the raw or Pages URL of `PRIVACY.md`. Required, because the
      extension collects usage data
- [ ] Data-use disclosures matching `PRIVACY.md` exactly. A mismatch gets the listing
      rejected, and correctly so
- [ ] Justification for each permission — `PRIVACY.md` has the table already
- [ ] Single purpose statement: improving the YouTube viewing experience through pace
      control and caption tools
- [ ] Update README, wiki [Installation](Installation) and [FAQ](FAQ) to lead with the
      store link once live

## After a release

- [ ] Reinstall the ZIP from scratch in a clean profile and confirm it loads
- [ ] Sanity-check on one real video: pill appears, WPM is plausible, captions menu has the
      three rows, account menu opens with No Distractions on
- [ ] Close the milestone, if there is one
