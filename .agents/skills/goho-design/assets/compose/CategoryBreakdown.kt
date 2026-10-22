package com.adamaho.goho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.main.ReceiptCategorySummary
import com.adamaho.goho.ui.main.receiptAmount
import java.math.RoundingMode
import java.text.NumberFormat
import java.util.Locale

@Composable
internal fun CategoryBreakdown(
    categories: List<ReceiptCategorySummary>?,
    currencyCode: String,
    locale: Locale,
    stacked: Boolean,
) {
    ListCard {
        repeat(categories?.size ?: 2) { index ->
            CategoryBreakdownRow(categories?.get(index), currencyCode, locale, stacked)
        }
    }
}

@Composable
private fun CategoryBreakdownRow(
    summary: ReceiptCategorySummary?,
    currencyCode: String,
    locale: Locale,
    stacked: Boolean,
) {
    val c = GohoTheme.colors
    val category = summary?.category
    val name = category?.displayName.orEmpty()
    val money =
        receiptMoneyText(
            receiptAmount(summary?.amount?.toPlainString(), locale),
            currencyCode,
            locale,
        )
    val percentFormat =
        remember(locale) {
            NumberFormat.getPercentInstance(locale).apply {
                maximumFractionDigits = 0
                roundingMode = RoundingMode.HALF_EVEN
            }
        }
    val description =
        if (summary?.share != null)
            stringResource(
                R.string.receipt_category_share_description,
                name,
                money.text,
                percentFormat.format(summary.share),
            )
        else stringResource(R.string.receipt_category_amount_description, name, money.text)
    Row(
        Modifier.fillMaxWidth()
            .padding(
                horizontal = GohoSpacing.cardPadding,
                vertical = GohoSpacing.breakdownRowVertical,
            )
            .clearAndSetSemantics { contentDescription = description },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(GohoSpacing.categoryIconGap),
    ) {
        CategoryIcon(category, Modifier.skeleton(block = true))
        Column(
            Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(GohoSpacing.breakdownBarGap),
        ) {
            if (stacked) {
                Column(verticalArrangement = Arrangement.spacedBy(GohoSpacing.lineGap)) {
                    Text(
                        name,
                        Modifier.skeleton(GohoSpacing.skeletonTitleWidth),
                        style = GohoTheme.type.listValue,
                        color = c.textPrimary,
                    )
                    Text(
                        money,
                        Modifier.skeleton(GohoSpacing.skeletonWidth),
                        style = GohoTheme.type.listValue,
                        color = c.textPrimary,
                    )
                }
            } else {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(GohoSpacing.itemGap),
                ) {
                    Text(
                        name,
                        Modifier.weight(1f).alignByBaseline().skeleton(fraction = 0.7f),
                        style = GohoTheme.type.listValue,
                        color = c.textPrimary,
                    )
                    Text(
                        money,
                        Modifier.alignByBaseline().skeleton(GohoSpacing.skeletonWidth),
                        style = GohoTheme.type.listValue,
                        color = c.textPrimary,
                        maxLines = 1,
                    )
                }
            }
            if (summary == null || summary.share != null) {
                Box(
                    Modifier.fillMaxWidth()
                        .height(GohoSpacing.breakdownBarHeight)
                        .skeleton(block = true)
                        .background(c.divider, GohoShapes.pill)
                ) {
                    val share = summary?.share?.toFloat() ?: 0f
                    Box(
                        Modifier.fillMaxWidth(share)
                            .fillMaxHeight()
                            .background(
                                category.tagColor.palette(c.isDark).content,
                                GohoShapes.pill,
                            )
                    )
                }
            }
        }
    }
}
