package com.adamaho.goho.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.*
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.inset
import androidx.compose.ui.unit.Dp
import com.adamaho.goho.theme.*

fun Modifier.topHighlight(color: Color): Modifier = drawWithContent {
    drawContent()
    val stroke = GohoSpacing.hairline.toPx()
    drawLine(color, Offset(0f, stroke / 2), Offset(size.width, stroke / 2), stroke)
}

@Composable
fun ListCard(
    modifier: Modifier = Modifier,
    verticalPadding: Dp = GohoSpacing.cardVerticalPadding,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = GohoTheme.colors
    val edge =
        if (c.isDark)
            Modifier.clip(GohoShapes.card)
                .background(c.surface)
                .topHighlight(Color.White.copy(alpha = 0.03f))
        else
            Modifier.shadow(
                    GohoSpacing.hairline,
                    GohoShapes.card,
                    clip = false,
                    ambientColor = c.shadow.copy(alpha = 0.4f),
                    spotColor = c.shadow.copy(alpha = 0.4f),
                )
                .clip(GohoShapes.card)
                .background(c.surface)
                .border(GohoSpacing.hairline, c.shadow.copy(alpha = 0.05f), GohoShapes.card)
    Column(
        modifier.fillMaxWidth().then(edge).padding(vertical = verticalPadding),
        content = content,
    )
}

@Composable
fun ListDivider(start: Dp = GohoSpacing.dividerStart) {
    Box(
        Modifier.fillMaxWidth()
            .padding(start = start)
            .height(GohoSpacing.hairline)
            .background(GohoTheme.colors.divider)
    )
}

/**
 * Tap and hold feedback shared by tappable rows in a [ListCard]; pair it with a clickable using
 * [interaction] and `indication = null`. Pressing draws the `surfacePressed` fill inset
 * `rowPressInset` with the `heldRow` shape, so the card surface stays visible on every side; [held]
 * eases the row to `HOLD_SCALE`. Drawn only: row layout and the tap area are unchanged. Apply after
 * the clickable and before the row padding.
 */
@Composable
fun Modifier.listRowPressFeedback(interaction: MutableInteractionSource, held: Boolean): Modifier {
    val c = GohoTheme.colors
    val press by pressProgress(interaction)
    val reduced = rememberReducedMotion()
    val scale by
        animateFloatAsState(
            if (held) GohoMotion.HOLD_SCALE else 1f,
            if (reduced) snap() else if (held) GohoMotion.pressIn else GohoMotion.pressOut,
            label = "Row hold",
        )
    return graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
        .drawBehind {
            val p = press.coerceIn(0f, 1f)
            if (p > 0f)
                inset(GohoSpacing.rowPressInset.toPx()) {
                    drawOutline(
                        GohoShapes.heldRow.createOutline(size, layoutDirection, this),
                        lerp(c.surface, c.surfacePressed, p),
                    )
                }
        }
}

/** Soften the fixed header edge without changing list layout or intercepting gestures. */
fun Modifier.headerFade(background: Color): Modifier = drawWithCache {
    val height = GohoSpacing.headerFadeHeight.toPx().coerceAtMost(size.height)
    val brush =
        Brush.verticalGradient(listOf(background, background.copy(alpha = 0f)), endY = height)
    onDrawWithContent {
        drawContent()
        drawRect(brush, size = Size(size.width, height))
    }
}
