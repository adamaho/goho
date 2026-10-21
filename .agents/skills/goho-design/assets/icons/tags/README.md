# Tag icons

Selected outline icons from [Lucide 0.468.0](https://github.com/lucide-icons/lucide/tree/0.468.0/icons). These SVGs are the unmodified source masters. `LICENSE` contains the upstream ISC licence and the Feather MIT notice; the same text ships in Android at `app/src/main/assets/licenses/lucide.txt`.

| Source                | Android drawable       | Meaning                  |
| --------------------- | ---------------------- | ------------------------ |
| `heart-pulse.svg`     | `ic_tag_health`        | Health                   |
| `utensils.svg`        | `ic_tag_meals`         | Meals                    |
| `ticket.svg`          | `ic_tag_entertainment` | Entertainment            |
| `shopping-basket.svg` | `ic_tag_groceries`     | Groceries                |
| `bus-front.svg`       | `ic_tag_transport`     | Transport                |
| `shopping-bag.svg`    | `ic_tag_shopping`      | Shopping                 |
| `sparkles.svg`        | `ic_tag_personal_care` | Personal care            |
| `tag.svg`             | `ic_tag_other`         | Other / unknown category |
| `house.svg`           | `ic_tag_home`          | Home                     |
| `scan-line.svg`       | `ic_tag_processing`    | Processing / uploading   |
| `triangle-alert.svg`  | `ic_tag_failed`        | Failed upload            |

Native resources retain the 24×24 viewport and rounded line caps/joins, use a 1.8-unit stroke and intrinsic 14dp bounds, and receive the tag's content tint. SVG circles/lines/rectangles are represented as equivalent vector paths. Do not rasterise, recolour the masters, mix icon families or remove attribution. Every `Tag` requires a Painter; the label conveys meaning and the icon has no duplicate accessibility description. The icon-only `CategoryIcon` in receipt-details item rows uses the same drawables, with the category name as its content description.
