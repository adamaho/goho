package com.adamaho.goho.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.lerp
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.lerp
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
    collapseProgress: Float = 0f,
) {
    val c = GohoTheme.colors
    val style = lerp(GohoTheme.type.segment, GohoTheme.type.segmentCompact, collapseProgress)
    val allLabel = stringResource(R.string.receipts_filter_all)
    val attentionLabel = stringResource(R.string.receipts_failed_title)
    val compactAttentionLabel = stringResource(R.string.receipts_filter_attention_compact)
    val totalText = NumberFormat.getIntegerInstance(locale).format(total)
    val attentionText = NumberFormat.getIntegerInstance(locale).format(attention)
    Row(
        modifier
            .clip(GohoShapes.pill)
            .background(c.surfaceMuted)
            .padding(GohoSpacing.filterPadding)
            .selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(GohoSpacing.filterGap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FilterSegment(
            !attentionOnly,
            { onSelect(false) },
            Modifier,
            collapseProgress,
        ) {
            Text(allLabel, style = style, maxLines = 1)
            Text(
                totalText,
                style = style,
                color = c.textSecondary,
            )
        }
        FilterSegment(
            attentionOnly,
            { onSelect(true) },
            Modifier.weight(1f, fill = false),
            collapseProgress,
        ) {
            Text(
                if (collapseProgress >= 0.5f) compactAttentionLabel else attentionLabel,
                modifier =
                    Modifier.weight(1f, fill = false).clearAndSetSemantics {
                        text = AnnotatedString(attentionLabel)
                    },
                style = style,
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
                    Text(
                        attentionText,
                        style = GohoTheme.type.label,
                        color = c.attention,
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
    collapseProgress: Float,
    content: @Composable RowScope.() -> Unit,
) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    val reduced = rememberReducedMotion()
    val fill by
        animateColorAsState(
            if (selected) c.segmentSelected else Color.Transparent,
            if (reduced) snap() else tween(GohoMotion.SEGMENT_MILLIS),
            label = "Filter selection",
        )
    val shadow =
        if (selected)
            Modifier.shadow(
                GohoSpacing.hairline,
                GohoShapes.pill,
                ambientColor = c.shadow,
                spotColor = c.shadow,
            )
        else Modifier
    androidx.compose.runtime.CompositionLocalProvider(
        androidx.compose.material3.LocalContentColor provides
            if (selected) c.textPrimary else c.textSecondary
    ) {
        Row(
            modifier
                .gohoPress { progress }
                .then(shadow)
                .clip(GohoShapes.pill)
                .background(fill)
                .then(
                    if (selected && c.isDark) Modifier.topHighlight(Color.White.copy(alpha = 0.06f))
                    else Modifier
                )
                .selectable(
                    selected,
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Tab,
                    onClick = onClick,
                )
                .heightIn(min = GohoSpacing.headerHeight)
                .padding(
                    horizontal =
                        lerp(
                            GohoSpacing.segmentHorizontal,
                            GohoSpacing.compactSegmentHorizontal,
                            collapseProgress,
                        ),
                    vertical = GohoSpacing.filterPadding,
                ),
            horizontalArrangement =
                Arrangement.spacedBy(
                    lerp(
                        GohoSpacing.segmentCountGap,
                        GohoSpacing.compactSegmentGap,
                        collapseProgress,
                    )
                ),
            verticalAlignment = Alignment.CenterVertically,
            content = content,
        )
    }
}
