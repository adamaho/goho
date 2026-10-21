package com.adamaho.goho.ui.main

import com.adamaho.goho.api.generated.model.Category
import com.adamaho.goho.api.generated.model.Receipt
import java.math.BigDecimal
import java.math.MathContext

internal data class ReceiptCategorySummary(
    val category: Category,
    val amount: BigDecimal,
    val share: BigDecimal?,
)

internal fun receiptCategorySummaries(receipt: Receipt): List<ReceiptCategorySummary> {
    val amounts =
        receipt.items
            .groupingBy { it.category.id }
            .fold(BigDecimal.ZERO) { total, item -> total + item.amount.toBigDecimal() }
    val total = amounts.values.fold(BigDecimal.ZERO, BigDecimal::add)
    // Refunds stay in the amounts. Only show shares when all categories form a positive whole.
    val showShares = total.signum() > 0 && amounts.values.none { it.signum() < 0 }
    return receipt.categories
        .map { category ->
            val amount = amounts.getValue(category.id)
            ReceiptCategorySummary(
                category,
                amount,
                if (showShares) amount.divide(total, MathContext.DECIMAL128) else null,
            )
        }
        // Stable sorting preserves the API's first-appearance order when category totals tie.
        .sortedByDescending { it.amount }
}
