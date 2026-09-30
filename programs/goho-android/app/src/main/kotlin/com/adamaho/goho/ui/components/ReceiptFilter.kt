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
    CompositionLocalProvider(
        androidx.compose.material3.LocalContentColor provides
            if (selected) c.textPrimary else c.textSecondary
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
            Row(
                Modifier.then(shadow)
                    .clip(GohoShapes.pill)
                    .background(fill)
                    .then(
                        if (selected && c.isDark)
                            Modifier.topHighlight(Color.White.copy(alpha = 0.06f))
                        else Modifier
                    )
                    .heightIn(min = GohoSpacing.filterVisualHeight)
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
