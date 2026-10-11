# Goho launcher icons

The selected icons show Bram, Mira, and their unnamed child as rounded, faceless flat silhouettes. Deep lilac, coral, and golden yellow preserve the family colours; thin transparent gaps separate the characters like the themed mask. Keep their broad bodies, rounded arms, small feet, horns, and low curls. There are no eyes, mouths, eyebrows, gradients, or texture.

**Goho** uses the family on warm ivory. **Goho Dev** uses the same artwork with a small violet `DEV` badge. The themed versions use one foreground tint, transparent character separators, and cutout DEV lettering; Android supplies colours from the user's wallpaper.

## Committed sources

- [Family foreground](../assets/launcher/family-foreground.svg) is the selected colour artwork: Bram `#6964BA`, Mira `#D65B63`, and child `#EABB35`.
- [Family monochrome](../assets/launcher/family-monochrome.svg) is the matching faceless themed mask.
- [DEV badge](../assets/launcher/dev-badge.svg) supplies the development marker.
- [Launcher recipe](../assets/launcher/launcher-spec.json) records the warm ivory background (`#FFF8EA`), adaptive canvas, legacy viewport, and flavour distinction.

The [character guide](characters.md) and [family manifest](../assets/illustrations/family/manifest.json) preserve the approved individual and family PNG masters and their hashes. These are intentional identity references alongside the app assets. Launcher marks do not replace them or the existing receipt-state illustrations.

Keep only the selected launcher sources and generated Android resources committed. Unused candidates, exploration prompts, comparison sheets, and standalone preview exports belong in ignored `.data/`.

## Android resources

`app/src/main/res` holds production defaults: the shared warm ivory background, foreground and monochrome layers, adaptive-icon XML, and legacy sizes. `app/src/development/res` overrides the foreground, monochrome, and legacy images with DEV versions. Existing manifest resource names serve both flavours, including round icons; the product flavour selects the icon independently of debug or release build type.

Adaptive layers use a 108dp canvas and let Android apply its mask. The generator renders the native SVGs at that canvas size. Legacy icons cover mdpi through xxxhdpi, with rounded-square and circular variants. Preserve the horns, curls, feet, transparent separators, and DEV badge under both masks when changing the artwork or framing.

## Regeneration

Run from the repository root with Node.js and Sharp 0.35.5. An isolated tool installation avoids adding a runtime or workspace dependency:

```bash
npm install --prefix /tmp/goho-icon-tools --no-save sharp@0.35.5
NODE_PATH=/tmp/goho-icon-tools/node_modules node programs/goho-android/scripts/generate-launcher-icons.cjs
```

The generator rewrites the Android background, raster layers, and legacy sizes from the current recipe. Commit those resources with source changes; do not hand-edit generated raster files or background XML.

For local review, the same command writes `production.png` and `development.png` as unmasked 512×512 exports, plus `launcher-icons.png` as a colour and light/dark themed sheet, under ignored `.data/launcher-preview/`. These previews render the generated artwork; they are not phone screenshots. Actual launcher masks and themed colours vary by device and wallpaper.

Inspect the preview and the launcher on a device or emulator, including themed icons where available. Follow the Android contributing guide's build, lint, and formatting checks; do not add Android tests or a screenshot harness.
