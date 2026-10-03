package com.adamaho.goho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.ReceiptItem
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.main.receiptAmount
import java.util.Locale

@Composable
internal fun ReceiptItemsCard(
    items: List<ReceiptItem>,
    total: String,
    currencyCode: String,
    locale: Locale,
    largeText: Boolean,
) {
    val c = GohoTheme.colors
    ReceiptCard(verticalPadding = GohoSpacing.itemCardTop) {
        items.forEachIndexed { index, item ->
            if (index > 0) ReceiptDetailDivider()
            Row(
                Modifier.fillMaxWidth()
                    .padding(
                        horizontal = GohoSpacing.cardPadding,
                        vertical = GohoSpacing.itemVertical,
                    )
                    .semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(GohoSpacing.itemGap),
            ) {
                Text(
                    item.name,
                    Modifier.weight(1f),
                    style = GohoTheme.type.listRow,
                    color = c.textPrimary,
                    maxLines = if (largeText) Int.MAX_VALUE else 2,
                    overflow = TextOverflow.Ellipsis,
                )
                val amount = receiptAmount(item.amount, locale)
                Text(
                    receiptMoneyText(amount, currencyCode, locale),
                    style = GohoTheme.type.listValue,
                    color = if (amount == "—") c.textTertiary else c.textPrimary,
                    maxLines = 1,
                )
            }
        }
        Box(
            Modifier.fillMaxWidth()
                .padding(horizontal = GohoSpacing.cardPadding)
                .height(GohoSpacing.hairline)
                .background(c.textPrimary.copy(alpha = if (c.isDark) 0.10f else 0.12f))
        )
        Row(
            Modifier.fillMaxWidth()
                .padding(
                    start = GohoSpacing.cardPadding,
                    end = GohoSpacing.cardPadding,
                    top = GohoSpacing.itemVertical,
                    bottom = GohoSpacing.cardPadding,
                )
                .semantics(mergeDescendants = true) {},
            horizontalArrangement = Arrangement.spacedBy(GohoSpacing.itemGap),
        ) {
            Text(
                stringResource(R.string.receipt_total),
                Modifier.weight(1f),
                style = GohoTheme.type.itemTotalLabel,
                color = c.textPrimary,
            )
            Text(
                receiptMoneyText(total, currencyCode, locale),
                style = GohoTheme.type.itemTotalValue,
                color = c.textPrimary,
            )
        }
    }
}
