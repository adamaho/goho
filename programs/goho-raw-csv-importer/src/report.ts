import { formatRef } from "./csv.ts";
import type { ImportPlan } from "./plan.ts";

const assumption =
  "Tax and totals are calculated, not read from the CSV: tax = 13% of each receipt subtotal, rounded once to cents (ties away from zero); total = subtotal + tax. All amounts are CAD without conversion.";

/**
 * Renders the full plan: receipt previews with record references, skipped
 * negative-price records, every validation error, and counts.
 *
 * @category formatting
 * @since 0.1.0
 */
export const renderPlan = (plan: ImportPlan, options: { readonly file: string }): string => {
  const lines: Array<string> = [`RAW CSV import plan for ${options.file}`, ""];
  const itemCount = plan.receipts.reduce((count, receipt) => count + receipt.items.length, 0);

  for (const [index, receipt] of plan.receipts.entries()) {
    lines.push(
      `Receipt ${index + 1}: ${JSON.stringify(receipt.storeName)} on ${receipt.receiptDate}, category ${JSON.stringify(receipt.category)}`,
    );
    for (const [position, item] of receipt.items.entries()) {
      lines.push(
        `  ${position}. ${JSON.stringify(item.name)} ${item.amount} ${receipt.currency} (${formatRef(item.ref)})`,
      );
    }
    lines.push(
      `  Subtotal ${receipt.subtotal} ${receipt.currency}; calculated tax ${receipt.tax} ${receipt.currency}; calculated total ${receipt.total} ${receipt.currency}`,
      "",
    );
  }

  if (plan.skipped.length > 0) {
    lines.push("Skipped negative-price records (excluded from amounts and category):");
    for (const skipped of plan.skipped) {
      lines.push(
        `  ${formatRef(skipped.ref)}: ${JSON.stringify(skipped.store)} on ${skipped.receiptDate}, ${JSON.stringify(skipped.item)} ${skipped.price}`,
      );
    }
    lines.push("");
  }

  if (plan.errors.length > 0) {
    lines.push("Validation errors:");
    for (const error of plan.errors) lines.push(`  ${formatRef(error.ref)}: ${error.message}`);
    lines.push("");
  }

  lines.push(
    `Records: ${plan.dataRecords} data, ${plan.blankRecords} blank, ${itemCount} retained items, ${plan.skipped.length} skipped negative, ${plan.errors.length} validation errors`,
    `Receipts planned: ${plan.receipts.length} with ${itemCount} items`,
    assumption,
  );
  return lines.join("\n");
};
