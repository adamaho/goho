// Asset packaging only: preserve the family artwork and resize it into Android layers.
// Requires Node.js and sharp 0.35.5; see the design skill's references/launcher-icons.md.
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const repo = path.resolve(__dirname, "../../..");
const skill = path.join(repo, ".agents/skills/goho-design");
const sources = path.join(skill, "assets/launcher");
const app = path.join(repo, "programs/goho-android/app/src");
const previewDirectory = path.join(repo, ".data/launcher-preview");
const svg = (body) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 108 108">${body}</svg>`,
  );
const raster = (input, size) => sharp(input, { density: 288 }).resize(size, size).png().toBuffer();
const blank = (size, background = "#00000000") =>
  sharp({ create: { width: size, height: size, channels: 4, background } });
async function write(file, contents) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contents);
}

async function main() {
  const spec = JSON.parse(await fs.readFile(path.join(sources, "launcher-spec.json"), "utf8"));
  await write(
    path.join(app, "main/res/drawable/ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="${spec.background}" />
</shape>
`,
  );
  const size = spec.canvasDp * 4;
  const foreground = await raster(path.resolve(sources, spec.artwork), size);
  const mono = await raster(path.join(sources, spec.monochrome), size);
  const badgeSource = await fs.readFile(path.join(sources, "dev-badge.svg"), "utf8");
  const badge = await raster(Buffer.from(badgeSource), size);
  const badgeShape = await raster(
    svg(badgeSource.match(/<rect[^>]*\/>/)[0].replace("#514477", "#FFFFFF")),
    size,
  );
  const badgeLetters = await raster(svg(badgeSource.match(/<path[^>]*\/>/)[0]), size);
  const badgeGap = await raster(
    svg('<rect x="39.2" y="73.2" width="29.6" height="12.6" rx="6.3" fill="white"/>'),
    size,
  );
  const viewport = spec.legacyViewportDp;
  const previews = [];

  for (const flavor of ["production", "development"]) {
    const development = spec[flavor].badge;
    const res = path.join(app, development ? "development" : "main", "res");
    const fg = development
      ? await sharp(foreground)
          .composite([{ input: badge }])
          .png()
          .toBuffer()
      : foreground;
    const monochrome = development
      ? await sharp(mono)
          .composite([
            { input: badgeGap, blend: "dest-out" },
            { input: badgeShape },
            { input: badgeLetters, blend: "dest-out" },
          ])
          .png()
          .toBuffer()
      : mono;
    await write(path.join(res, "drawable-xxxhdpi/ic_launcher_foreground.png"), fg);
    await write(path.join(res, "drawable-xxxhdpi/ic_launcher_monochrome.png"), monochrome);
    const full = await blank(size, spec.background)
      .composite([{ input: fg }])
      .png()
      .toBuffer();
    const crop = {
      left: viewport.x * 4,
      top: viewport.y * 4,
      width: viewport.size * 4,
      height: viewport.size * 4,
    };
    const visible = await sharp(full).extract(crop).png().toBuffer();
    await write(
      path.join(previewDirectory, `${flavor}.png`),
      await sharp(visible).resize(512, 512).png().toBuffer(),
    );
    for (const [density, px] of Object.entries({
      mdpi: 48,
      hdpi: 72,
      xhdpi: 96,
      xxhdpi: 144,
      xxxhdpi: 192,
    })) {
      for (const round of [false, true]) {
        const mask = Buffer.from(
          `<svg width="${px}" height="${px}"><rect width="${px}" height="${px}" rx="${round ? px / 2 : px * 0.23}" fill="white"/></svg>`,
        );
        const icon = await sharp(visible)
          .resize(px, px)
          .composite([{ input: mask, blend: "dest-in" }])
          .webp({ lossless: true })
          .toBuffer();
        await write(
          path.join(res, `mipmap-${density}/ic_launcher${round ? "_round" : ""}.webp`),
          icon,
        );
      }
    }
    const themed = [];
    for (const [background, tint] of [
      ["#E9DDFB", "#66507E"],
      ["#392D4C", "#DCC8F6"],
    ]) {
      const themedForeground = await blank(size, tint)
        .composite([{ input: monochrome, blend: "dest-in" }])
        .png()
        .toBuffer();
      const full = await blank(size, background)
        .composite([{ input: themedForeground }])
        .png()
        .toBuffer();
      themed.push(await sharp(full).extract(crop).png().toBuffer());
    }
    previews.push({ flavor, visible, themed });
  }

  // A static design preview of the actual exported layers, not an Android screenshot.
  const layers = [];
  let labels = "";
  for (const [column, entry] of previews.entries()) {
    const x = 140 + column * 480;
    labels += `<text x="${x + 120}" y="92" text-anchor="middle" font-size="24" font-weight="600">${entry.flavor === "production" ? "Goho" : "Goho Dev"}</text>`;
    for (const [row, [source, label]] of [
      [entry.visible, "Deep flat colour"],
      [entry.themed[0], "Themed · light"],
      [entry.themed[1], "Themed · dark"],
    ].entries()) {
      const y = 122 + row * 370;
      const mask = Buffer.from(
        '<svg width="240" height="240"><circle cx="120" cy="120" r="120" fill="white"/></svg>',
      );
      layers.push({
        input: await sharp(source)
          .resize(240, 240)
          .composite([{ input: mask, blend: "dest-in" }])
          .png()
          .toBuffer(),
        left: x,
        top: y,
      });
      labels += `<text x="${x + 120}" y="${y + 264}" text-anchor="middle" font-size="17" fill="#716B7C">${label}</text>`;
      for (const [index, pixels] of [48, 64].entries()) {
        const left = x + 39 + index * 100;
        const smallMask = Buffer.from(
          `<svg width="${pixels}" height="${pixels}"><rect width="${pixels}" height="${pixels}" rx="${index ? pixels * 0.23 : pixels / 2}" fill="white"/></svg>`,
        );
        layers.push({
          input: await sharp(source)
            .resize(pixels, pixels)
            .composite([{ input: smallMask, blend: "dest-in" }])
            .png()
            .toBuffer(),
          left,
          top: y + 282 + 64 - pixels,
        });
        labels += `<text x="${left + pixels / 2}" y="${y + 364}" text-anchor="middle" font-size="12" fill="#716B7C">${pixels}px</text>`;
      }
    }
  }
  const heading = Buffer.from(
    `<svg width="1040" height="1290"><g font-family="sans-serif" fill="#292334"><text x="520" y="43" text-anchor="middle" font-size="28" font-weight="600">Goho · family icons</text>${labels}<text x="520" y="1260" text-anchor="middle" font-size="14" fill="#716B7C">v${spec.version} · Actual exported artwork · Themed colours and launcher masks vary by device</text></g></svg>`,
  );
  const preview = await sharp({
    create: { width: 1040, height: 1290, channels: 4, background: "#FBF8F4" },
  })
    .composite([...layers, { input: heading }])
    .png()
    .toBuffer();
  await write(path.join(previewDirectory, "launcher-icons.png"), preview);
  console.log(
    "Exported Android launcher resources; local PNG exports and preview are in .data/launcher-preview.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
