# Goho character references

The approved family is Bram, Mira, and their **unnamed buttery-yellow child**. These PNG masters, saved in the repository on October 10, 2026, are the visual source of truth across threads. Read this guide and inspect the relevant master before drawing, editing, animating, or deriving launcher assets. A prose description or generation prompt alone cannot preserve the exact silhouette, face, and texture.

## Current masters

| Reference                                                                    | Purpose                                                                                                                            |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [Bram v3](../assets/illustrations/bram/reference/bram-v3.png)                | Original neutral Bram identity and proportions; keep this existing master.                                                         |
| [Mira v1](../assets/illustrations/family/mira-v1.png)                        | Approved coral Mira, transparent full-body cutout.                                                                                 |
| [Yellow child v2](../assets/illustrations/family/child-yellow-v2.png)        | Approved child identity, transparent full-body cutout.                                                                             |
| [Family portrait v1](../assets/illustrations/family/bram-mira-family-v1.png) | Approved family composition and relative scale on an intentional warm ivory background; reference for the family launcher artwork. |

The [asset manifest](../assets/illustrations/family/manifest.json) records each current master’s role, version, exact SHA-256 hash, dimensions, and approval status. Its file paths are relative to the manifest. Only these approved PNGs are retained as family identity references; unused candidates and generation prompts are excluded.

## Character identity

**Bram** has a broad, low, bottom-heavy periwinkle-lilac body with no separate head or neck. His long, substantial, rounded arms hang slightly forward, with tiny feet beneath his full body. Keep exactly two small ivory horns, glossy dark oval eyes with white highlights, and a simple curved smile. Bram has **no curl and no eyebrows**. His rounded arms are a defining feature; do not replace them with short fins or detached-looking flaps.

**Mira** is rosy coral with a broad, bottom-heavy pear silhouette and a single integrated curled crown tuft. She has subtle, expressive asymmetric eyebrows, glossy dark oval eyes, a small curved smile, rounded arms, and tiny feet. Her approved standalone pose has one arm close to her side and the other extended in a small welcoming gesture. Mira has **no horns**. Preserve her natural asymmetry and soft expression rather than adding eyelashes, makeup, clothing, or extra anatomy.

**The child** has a compact baby-pear silhouette in **buttery yellow**, complementing Bram's lilac and Mira's coral. The child combines Mira's integrated curl and eyebrows with Bram's two tiny ivory horn buds and plump rounded arms. Keep large glossy dark oval eyes, a simple smile, two small feet, and both arms hanging toward the front in the standalone master. The body, curl, arms, and feet share the yellow material; horns stay ivory and eyebrows softly golden-brown. The child has **no approved name or gender**. Preserve the complementary yellow palette.

All three have a fine matte clay texture, soft studio light, smooth rounded volumes, glossy dark eyes, and restrained smiles. Preserve the approved warm, gentle character treatment without making the bodies look like shiny plastic, fur, or fabric. The original artwork wins over generic character-style references.

## Approved Books empty-state pose

[Bram holding a book](../assets/illustrations/status-no-books.png), approved October 23, 2026, is the selected “No books yet” illustration. He gently cradles one closed cream hardcover with a blank cover, visible ivory pages and a warm oatmeal spine. Keep his original face, long round arms, broad lilac body, tiny feet and ivory horns. The transparent master is 1350×1165 RGBA; [provenance and its SHA-256](../assets/illustrations/bram/no-books.prompts.json) identify the exact selected image. This is a status pose, not a replacement for the neutral identity master. The native empty Books state uses this exact image in both themes through the shared `StatusContent` illustration slot.

## Approved search-empty-state pose

[Bram with a magnifying glass](../assets/illustrations/status-no-search-results.png), approved October 24, 2026, is the selected illustration for no search matches, initially in Books. One long rounded arm holds a cream magnifying glass over one eye; the other hangs naturally. Preserve exactly two eyes, the gently enlarged eye inside the clear lens, visible smile, ivory horns, tiny feet and broad lilac body. The 1350×1165 RGBA master and [provenance with SHA-256](../assets/illustrations/bram/no-search-results.prompts.json) preserve the selected image. This is approved artwork awaiting search implementation, distinct from “No books yet” and the neutral identity master; final search copy is not defined.

## Family composition

In the approved portrait, Bram is on the viewer's left, Mira on the right, and the smaller child slightly forward in the center. Bram is lower and wider; Mira is taller with her curl. Their inward poses feel affectionate while keeping the child's complete silhouette and all faces readable. Use this image for family relationships, palette, and scale; use the individual masters for precise character features. Do not transfer one family member's identifying features to another.

## Application scope

The family images are durable **brand references**. They do not authorize new app screens, extra receipt states, or a replacement for the approved Bram status artwork. The supported in-app illustrations are the no-receipts pose, book-holding “No books yet” pose, calm “All good” thumbs-up, and gentle load-error shrug documented in [Bram sources](../assets/illustrations/bram/README.md). The Receipts header remains text-only.

The launcher icons feature **Bram, Mira, and the child together**, following the approved family portrait. Use the same compact family adaptation for production and development, with a small development badge. Preserve all three characters and express the build difference through the surrounding icon treatment. Launcher variants are derived assets, not new identity masters. Keep their generated review images in ignored `.data/launcher-preview/`. See [launcher icons](launcher-icons.md) for the shared source recipe, development badge, Android resources, and regeneration.

## Preservation and future edits

Keep the approved PNG masters unchanged. PNG preserves their texture and alpha; converting them into SVG paths or embedding base64 in documentation does not improve future context. Reference the files directly and open them when a visual task needs them. Keep platform-sized exports separate from the master artwork.

Commit current app artwork, the approved individual and family identity masters, and the selected Books and search empty-state masters above. When an approved design changes, update the relevant source, manifest, and this guide together. Keep unused candidates, exploration prompts, and review exports in ignored `.data/`; do not accumulate alternate versions in the repository. The committed masters and their hashes preserve identity across threads.
