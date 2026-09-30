package com.adamaho.goho.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.lerp
import androidx.compose.ui.unit.Constraints
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import java.util.Locale
import kotlin.math.roundToInt

/** One filter moves into the wordmark row, preserving selection and accessible tap targets. */
@Composable
fun ReceiptListHeader(
    total: Int,
    attention: Int,
    attentionOnly: Boolean,
    onSelect: (Boolean) -> Unit,
    locale: Locale,
    collapseProgress: Float,
) {
    val c = GohoTheme.colors
    val progress = if (total == 0) 0f else collapseProgress
    Layout(
        modifier =
            Modifier.fillMaxWidth()
                .padding(horizontal = GohoSpacing.screenMargin)
                .padding(top = GohoSpacing.headerTop, bottom = GohoSpacing.contentGap),
        content = {
            Box(
                Modifier.padding(start = GohoSpacing.textInsetFromMargin)
                    .heightIn(min = GohoSpacing.headerHeight),
                contentAlignment = androidx.compose.ui.Alignment.CenterStart,
            ) {
                Text(
                    stringResource(R.string.goho_wordmark),
                    style = lerp(GohoTheme.type.wordmark, GohoTheme.type.wordmarkCompact, progress),
                    color = c.textPrimary,
                    maxLines = 1,
                )
            }
            if (total > 0)
                ReceiptFilter(
                    total,
                    attention,
                    attentionOnly,
                    onSelect,
                    locale,
                    collapseProgress = progress,
                )
        },
    ) { measurables, constraints ->
        val loose = constraints.copy(minWidth = 0, minHeight = 0)
        val wordmark = measurables[0].measure(loose)
        val compactWidth =
            (constraints.maxWidth - wordmark.width - GohoSpacing.headerWordmarkGap.roundToPx())
                .coerceAtLeast(0)
        val filterWidth =
            (constraints.maxWidth + (compactWidth - constraints.maxWidth) * progress).roundToInt()
        val filter = measurables.getOrNull(1)?.measure(Constraints(maxWidth = filterWidth))
        val rowHeight = maxOf(wordmark.height, filter?.height ?: 0)
        val expandedY = wordmark.height + GohoSpacing.filterTop.roundToPx()
        val compactY = (rowHeight - (filter?.height ?: 0)) / 2
        val filterY = (expandedY + (compactY - expandedY) * progress).roundToInt()
        val height =
            if (filter == null) wordmark.height else maxOf(rowHeight, filterY + filter.height)
        layout(constraints.maxWidth, height) {
            wordmark.placeRelative(0, ((rowHeight - wordmark.height) / 2f * progress).roundToInt())
            filter?.placeRelative(
                ((constraints.maxWidth - filter.width) * progress).roundToInt(),
                filterY,
            )
        }
    }
}
