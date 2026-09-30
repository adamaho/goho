package com.adamaho.goho.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import java.text.NumberFormat
import java.util.Locale

@Composable
fun ReceiptFilter(
    total: Int,
    attention: Int,
    attentionOnly: Boolean,
    onSelect: (Boolean) -> Unit,
    locale: Locale,
    modifier: Modifier = Modifier,
) {
    val c = GohoTheme.colors
    Row(
        modifier.selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(GohoSpacing.filterGap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FilterSegment(!attentionOnly, { onSelect(false) }) {
            Text(
                stringResource(R.string.receipts_filter_all),
                style = GohoTheme.type.segment,
                maxLines = 1,
            )
            Text(
                NumberFormat.getIntegerInstance(locale).format(total),
                style = GohoTheme.type.segment,
                color = c.textSecondary,
            )
        }
        FilterSegment(attentionOnly, { onSelect(true) }, Modifier.weight(1f, fill = false)) {
            Text(
                stringResource(R.string.receipts_failed_title),
                modifier = Modifier.weight(1f, fill = false),
                style = GohoTheme.type.segment,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (attention > 0)
                Box(
                    Modifier.sizeIn(
                            minWidth = GohoSpacing.badgeSize,
                            minHeight = GohoSpacing.badgeSize,
                        )
                        .clip(GohoShapes.pill)
                        .background(c.attentionContainer)
                        .padding(horizontal = GohoSpacing.filterPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CenteredPillLabel(
                        NumberFormat.getIntegerInstance(locale).format(attention),
                        GohoTheme.type.label,
                        c.attention,
                    )
                }
        }
    }
}

@Composable
private fun FilterSegment(
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    val reduced = rememberReducedMotion()
    val selection by
        animateFloatAsState(
            if (selected) 1f else 0f,
            if (reduced) snap() else GohoMotion.filterSelection,
            label = "Filter selection",
        )
    val press = progress.coerceIn(0f, 1f)
    val colorProgress = selection.coerceIn(0f, 1f)
    // Keep the surface opaque throughout the transition so the shadow cannot show through it.
    val fill = lerp(lerp(c.background, c.segmentSelected, colorProgress), c.surfacePressed, press)
    val elevation = GohoSpacing.hairline * colorProgress * (1f - press)
    CompositionLocalProvider(
        androidx.compose.material3.LocalContentColor provides
            lerp(c.textSecondary, c.textPrimary, colorProgress)
    ) {
        // The visible tab is compact; its surrounding space remains tappable.
        Box(
            modifier
                .gohoPress { progress }
                .selectable(
                    selected,
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Tab,
                    onClick = onClick,
                )
                .heightIn(min = GohoSpacing.headerHeight)
                .padding(vertical = GohoSpacing.filterTouchInset),
            contentAlignment = Alignment.Center,
        ) {
            Box {
                // Only the fill springs; the label and touch target keep their size and position.
                Box(
                    Modifier.matchParentSize()
                        .graphicsLayer {
                            scaleX = 1f - GohoMotion.FILTER_FILL_WIDTH_REVEAL * (1f - selection)
                            scaleY = 1f - GohoMotion.FILTER_FILL_HEIGHT_REVEAL * (1f - selection)
                        }
                        .shadow(
                            elevation,
                            GohoShapes.pill,
                            ambientColor = c.shadow,
                            spotColor = c.shadow,
                        )
                        .clip(GohoShapes.pill)
                        .background(fill)
                        .then(
                            if (c.isDark)
                                Modifier.topHighlight(
                                    Color.White.copy(alpha = 0.06f * colorProgress)
                                )
                            else Modifier
                        )
                )
                Row(
                    Modifier.heightIn(min = GohoSpacing.filterVisualHeight)
                        .padding(
                            horizontal = GohoSpacing.segmentHorizontal,
                            vertical = GohoSpacing.filterPadding,
                        ),
                    horizontalArrangement = Arrangement.spacedBy(GohoSpacing.segmentCountGap),
                    verticalAlignment = Alignment.CenterVertically,
                    content = content,
                )
            }
        }
    }
}
