package com.adamaho.goho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.ReceiptItem
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.main.receiptAmount
import java.util.Locale

@Composable
internal fun ReceiptItemsCard(
    items: List<ReceiptItem>?,
    total: String,
    currencyCode: String,
    locale: Locale,
) {
    val c = GohoTheme.colors
    ListCard(verticalPadding = GohoSpacing.itemCardTop) {
        repeat(items?.size ?: 3) { index ->
            val item = items?.get(index)
            if (index > 0) ReceiptDetailDivider()
            val amount = receiptAmount(item?.amount, locale)
            val money = receiptMoneyText(amount, currencyCode, locale)
            val description =
                stringResource(
                    R.string.receipt_item_description,
                    item?.name.orEmpty(),
                    item?.category?.displayName.orEmpty(),
                    money.text,
                )
            Row(
                Modifier.fillMaxWidth()
                    .padding(
                        horizontal = GohoSpacing.cardPadding,
                        vertical = GohoSpacing.itemVertical,
                    )
                    .clearAndSetSemantics { contentDescription = description },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CategoryIcon(
                    item?.category,
                    Modifier.skeleton(block = true),
                )
                Spacer(Modifier.width(GohoSpacing.categoryIconGap))
                Text(
                    item?.name.orEmpty(),
                    Modifier.weight(1f).skeleton(fraction = 0.7f),
                    style = GohoTheme.type.listRow,
                    color = c.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.width(GohoSpacing.itemGap))
                Text(
                    money,
                    modifier = Modifier.skeleton(GohoSpacing.skeletonWidth),
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
                Modifier.weight(1f).skeleton(fraction = 0.7f),
                style = GohoTheme.type.itemTotalLabel,
                color = c.textPrimary,
            )
            Text(
                receiptMoneyText(total, currencyCode, locale),
                modifier = Modifier.skeleton(GohoSpacing.skeletonWidth),
                style = GohoTheme.type.itemTotalValue,
                color = c.textPrimary,
            )
        }
    }
}
