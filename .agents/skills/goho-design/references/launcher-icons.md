# Goho launcher icons

The selected **v8 phone-trial design** shows Bram, Mira, and their unnamed child as rounded, faceless flat silhouettes. Deep lilac, coral and golden yellow preserve the family colours; thin transparent gaps separate the characters like the themed mask. Low curls, broad bodies and small feet avoid the earlier flame-like outline. There are no eyes, mouths, eyebrows, gradients or texture.

**Goho** uses the family on warm ivory. **Goho Dev** uses the same artwork with a small violet `DEV` badge. The themed versions use one foreground tint, transparent character separators, and cutout DEV lettering; Android supplies colours from the user's wallpaper. Selecting v8 for a phone trial does not change the approved character identities or establish a final release design.

## Current sources and outputs

- [Flat family v8](../assets/launcher/family-flat-v8.svg) is the colour foreground. Its [source record](../assets/launcher/family-flat-v8.source.json) preserves the selected direction and palette: Bram `#6964BA`, Mira `#D65B63`, child `#EABB35`, background `#FFF8EA`.
- [Rounded monochrome v6](../assets/launcher/family-rounded-monochrome-v6.svg) supplies the matching faceless mask and separation geometry. [Dev badge](../assets/launcher/dev-badge.svg) supplies the development marker.
- The [current launcher recipe](../assets/launcher/launcher-spec.json) selects v8 and records the background, layer canvas, legacy viewport and flavour distinction.
- [Production v8](../assets/launcher/production-v8.png) and [development v8](../assets/launcher/development-v8.png) are flattened, unmasked 512×512 PNG exports. They are separate from Android's adaptive layers.
- [Current launcher sheet](../assets/mockups/launcher-icons.png) shows colour and light/dark themed production and DEV icons, including 48/64px treatments, rendered from the generated assets. It is not a phone screenshot or evidence of installation. Actual launcher masks and themed colours vary by device and wallpaper.

The [character guide](characters.md) and [family manifest](../assets/illustrations/family/manifest.json) preserve the unchanged canonical PNGs, prompts, source relationships and hashes. Launcher assets are derived brand marks, not replacements for those identity masters or the existing receipt-state illustrations.

## Android resources

`app/src/main/res` holds production defaults: the shared warm ivory background, foreground and monochrome layers, adaptive-icon XML and legacy sizes. `app/src/development/res` overrides the foreground, monochrome and legacy images with DEV versions. Existing manifest resource names serve both flavours, including round icons; product flavour selects the icon independently of debug or release build type.

Adaptive layers use a 108dp canvas and let Android apply its mask. V8 renders the native SVG at that canvas size. Legacy icons cover mdpi through xxxhdpi, with rounded-square and circular variants. Preserve the horns, curls, feet, transparent separators and DEV badge under both masks when changing the artwork or framing.

## Historical comparisons

These sources remain available for design context; none supersedes the selected v8 recipe:

- **V1–v2 portraits:** [full-body foreground v1](../assets/launcher/family-foreground-v1.png) and [closer portrait v2](../assets/launcher/family-foreground-v2.png), with their saved prompts and [v1](../assets/launcher/launcher-spec-v1.json) / [v2](../assets/launcher/launcher-spec-v2.json) recipes.
- **V3–v4 flat silhouettes:** [v3](../assets/launcher/family-flat-v3.svg) and [v4](../assets/launcher/family-flat-v4.svg) preserve the earlier shape and palette experiments. The [comparison sheet](../assets/mockups/launcher-icons-comparison.png) shows v1, v2 and v4.
- **V5–v7 faceless depth:** [v5](../assets/launcher/family-faceless-shaded-v5.png) removes the portrait's faces. The [v6 sheet](../assets/mockups/launcher-family-sheet-v6.png) and [v7 sheet](../assets/mockups/launcher-family-sheet-v7.png) compare rounded flat colour with soft depth and themed treatments; v7 makes the shaded grouping more compact. The [v7 review recipe](../assets/launcher/family-rounded-v7.source.json) and saved prompts preserve these inputs.
- [V1 emulator capture](../assets/mockups/launcher-icons-emulator.png) is a historical manual screenshot of the full-body icons, not a capture of the current v8 resources.

## Regeneration

Run from the repository root with Node.js and Sharp 0.35.5. An isolated tool installation avoids adding a runtime or workspace dependency:

```bash
npm install --prefix /tmp/goho-icon-tools --no-save sharp@0.35.5
NODE_PATH=/tmp/goho-icon-tools/node_modules node programs/goho-android/scripts/generate-launcher-icons.cjs
```

The generator reads the current recipe and rewrites the Android background and raster layers, legacy sizes, 512px exports and current launcher sheet. Keep outputs together with source or recipe changes. Do not hand-edit generated raster files or background XML.

To recreate only the historical v7 comparison sheet and its exports from preserved sources:

```bash
NODE_PATH=/tmp/goho-icon-tools/node_modules node programs/goho-android/scripts/render-launcher-review.cjs
```

Inspect current previews and the launcher on a device or emulator, including themed icons where available. Label captures with the version actually installed. Use the Android contributing guide's build, lint and formatting checks; do not add Android tests or a screenshot harness.
