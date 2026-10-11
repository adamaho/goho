// Render the rounded family review sheet and exports from versioned artwork.
// Requires Node.js and sharp 0.35.5; see the design skill's launcher guide.
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const repo = path.resolve(__dirname, "../../..");
const sources = path.join(repo, ".agents/skills/goho-design/assets/launcher");
const canvasDp = 108;
const scale = 4;
const canvasPx = canvasDp * scale;
const viewport = { left: 72, top: 72, width: 288, height: 288 };
const svg = (width, height, contents) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${contents}</svg>`,
  );
const blank = (width, height, background) =>
  sharp({ create: { width, height, channels: 4, background } });
const raster = (input) =>
  sharp(input, { density: 288 }).resize(canvasPx, canvasPx).png().toBuffer();

async function masked(input, size, round = true) {
  const mask = svg(
    size,
    size,
    `<rect width="${size}" height="${size}" rx="${round ? size / 2 : size * 0.23}" fill="white"/>`,
  );
  return sharp(input)
    .resize(size, size)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function main() {
  const spec = JSON.parse(
    await fs.readFile(path.join(sources, "family-rounded-v7.source.json"), "utf8"),
  );
  const flat = await raster(path.resolve(sources, spec.flat));
  const monochrome = await raster(path.resolve(sources, spec.monochrome));
  const placement = spec.shadedPlacementDp;
  const artwork = await sharp(path.resolve(sources, spec.shaded))
    .extract(spec.shadedCropPx)
    .resize(placement.width * scale, placement.height * scale, {
      fit: "contain",
      background: "#00000000",
    })
    .png()
    .toBuffer();
  const shaded = await blank(canvasPx, canvasPx, "#00000000")
    .composite([{ input: artwork, left: placement.x * scale, top: placement.y * scale }])
    .png()
    .toBuffer();

  const badgeSource = await fs.readFile(path.join(sources, "dev-badge.svg"), "utf8");
  const badge = await raster(Buffer.from(badgeSource));
  const letters = await raster(svg(canvasDp, canvasDp, badgeSource.match(/<path[^>]*\/>/)[0]));
  const pill = await raster(
    svg(canvasDp, canvasDp, '<rect x="40" y="74" width="28" height="11" rx="5.5" fill="white"/>'),
  );
  const gap = await raster(
    svg(
      canvasDp,
      canvasDp,
      '<rect x="39.2" y="73.2" width="29.6" height="12.6" rx="6.3" fill="white"/>',
    ),
  );
  const treatments = [
    {
      key: "flat",
      title: "Flat colour",
      subtitle: "Saturated lilac, coral and yellow",
      foreground: flat,
      background: spec.palette.background,
      panel: "#F5F0E9",
      ink: "#2D263B",
    },
    {
      key: "shaded",
      title: "Soft depth",
      subtitle: "Colour, volume and shadow — no faces",
      foreground: shaded,
      background: spec.palette.background,
      panel: "#F5F0E9",
      ink: "#2D263B",
    },
    {
      key: "themed-light",
      title: "Themed · light",
      subtitle: "One tint, with space between the family",
      foreground: monochrome,
      background: "#E9DDFB",
      tint: "#66507E",
      panel: "#F1EBF8",
      ink: "#392C4E",
    },
    {
      key: "themed-dark",
      title: "Themed · dark",
      subtitle: "The same mark follows your wallpaper",
      foreground: monochrome,
      background: "#392D4C",
      tint: "#DCC8F6",
      panel: "#241C30",
      ink: "#F2E9FC",
    },
  ];

  const icons = [];
  let labels =
    '<text x="40" y="63" font-size="32" font-weight="600">Goho · the family, rounded</text>' +
    `<text x="40" y="103" font-size="17" fill="#726879">Colour and themed icons · production + DEV · v${spec.version} review sheet</text>`;

  for (const [index, treatment] of treatments.entries()) {
    const x = 32 + (index % 2) * 484;
    const y = 142 + Math.floor(index / 2) * 455;
    labels +=
      `<rect x="${x}" y="${y}" width="452" height="425" rx="24" fill="${treatment.panel}"/>` +
      `<text x="${x + 24}" y="${y + 38}" fill="${treatment.ink}" font-size="23" font-weight="600">${treatment.title}</text>` +
      `<text x="${x + 24}" y="${y + 67}" fill="${treatment.ink}" opacity=".72" font-size="14">${treatment.subtitle}</text>`;

    for (const development of [false, true]) {
      let foreground = treatment.foreground;
      if (treatment.tint) {
        if (development) {
          foreground = await sharp(foreground)
            .composite([
              { input: gap, blend: "dest-out" },
              { input: pill },
              { input: letters, blend: "dest-out" },
            ])
            .png()
            .toBuffer();
        }
        foreground = await blank(canvasPx, canvasPx, treatment.tint)
          .composite([{ input: foreground, blend: "dest-in" }])
          .png()
          .toBuffer();
      } else if (development) {
        foreground = await sharp(foreground)
          .composite([{ input: badge }])
          .png()
          .toBuffer();
      }
      const full = await blank(canvasPx, canvasPx, treatment.background)
        .composite([{ input: foreground }])
        .png()
        .toBuffer();
      const visible = await sharp(full).extract(viewport).png().toBuffer();
      const flavor = development ? "development" : "production";
      await sharp(visible)
        .resize(512, 512)
        .toFile(path.join(sources, `${flavor}-rounded-${treatment.key}-v${spec.version}.png`));

      const iconX = x + 44 + (development ? 208 : 0);
      icons.push({ input: await masked(visible, 164), left: iconX, top: y + 96 });
      labels += `<text x="${iconX + 82}" y="${y + 286}" text-anchor="middle" fill="${treatment.ink}" font-size="17" font-weight="600">${development ? "Goho Dev" : "Goho"}</text>`;
      for (const [sizeIndex, size] of [48, 64].entries()) {
        const smallX = iconX + 13 + sizeIndex * 78;
        icons.push({
          input: await masked(visible, size, sizeIndex === 0),
          left: smallX,
          top: y + 309 + 64 - size,
        });
        labels += `<text x="${smallX + size / 2}" y="${y + 397}" text-anchor="middle" fill="${treatment.ink}" opacity=".72" font-size="12">${size}px</text>`;
      }
    }
  }

  labels +=
    '<text x="40" y="1080" font-size="21" font-weight="600">A wider family, with feet on the ground.</text>' +
    '<text x="40" y="1115" font-size="16" fill="#726879">Lower curls, broader bodies and little feet break up the pointed silhouette.</text>' +
    '<text x="40" y="1153" font-size="13" fill="#726879">Static launcher previews. Themed colours and icon masks vary by device and wallpaper.</text>';
  // Draw panels and labels first so the artwork sits above its panel background.
  await blank(1000, 1190, "#FCF9F5")
    .composite([
      {
        input: svg(1000, 1190, `<g font-family="sans-serif" fill="#2D263B">${labels}</g>`),
      },
      ...icons,
    ])
    .png()
    .toFile(path.resolve(sources, spec.preview));
  console.log(`Rendered the v${spec.version} family review sheet and eight launcher exports.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
