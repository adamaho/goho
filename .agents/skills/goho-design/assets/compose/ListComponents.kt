package com.adamaho.goho.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CornerSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.*
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.inset
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
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

/**
 * One row's segment of a [ListCard], so a lazy list composes only its visible rows: the [first]
 * segment has the card's top corners, top padding and dark-mode highlight, and the [last] its
 * bottom corners and padding. In light mode each segment draws only its part of the card's shadow
 * and ring, so stacked segments read as one card without seams or doubled hairlines.
 */
@Composable
fun ListCardSegment(
    first: Boolean,
    last: Boolean,
    modifier: Modifier = Modifier,
    verticalPadding: Dp = GohoSpacing.cardVerticalPadding,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = GohoTheme.colors
    val shape =
        remember(first, last) {
            val card = GohoShapes.card
            val square = CornerSize(0)
            card.copy(
                topStart = if (first) card.topStart else square,
                topEnd = if (first) card.topEnd else square,
                bottomEnd = if (last) card.bottomEnd else square,
                bottomStart = if (last) card.bottomStart else square,
            )
        }
    val edge =
        if (c.isDark)
            Modifier.clip(shape)
                .background(c.surface)
                .then(
                    if (first) Modifier.topHighlight(Color.White.copy(alpha = 0.03f)) else Modifier
                )
        else {
            val whole = remember(first, last) { WholeCard(first, last) }
            val shadow = c.shadow.copy(alpha = 0.4f)
            val ring = c.shadow.copy(alpha = 0.05f)
            // The shadow is cast by the whole card and cut to the segment's outer edges.
            Modifier.graphicsLayer {
                    this.shape = whole.shadowRoom
                    clip = true
                }
                .shadow(
                    GohoSpacing.hairline,
                    whole,
                    clip = false,
                    ambientColor = shadow,
                    spotColor = shadow,
                )
                .clip(shape)
                .background(c.surface)
                .drawWithCache {
                    val stroke = GohoSpacing.hairline.toPx()
                    val path =
                        Path().apply { addRoundRect(whole.ring(size, this@drawWithCache, stroke)) }
                    onDrawWithContent {
                        drawContent()
                        drawPath(path, ring, style = Stroke(stroke))
                    }
                }
        }
    Column(
        modifier
            .fillMaxWidth()
            .then(edge)
            .padding(
                top = if (first) verticalPadding else 0.dp,
                bottom = if (last) verticalPadding else 0.dp,
            ),
        content = content,
    )
}

/**
 * The whole card around one [ListCardSegment]: it reaches past the segment's inner edges, so they
 * have no corners, shadow or ring of their own.
 */
private class WholeCard(private val first: Boolean, private val last: Boolean) : Shape {
    private fun radius(size: Size, density: Density) = GohoShapes.card.topStart.toPx(size, density)

    private fun bounds(size: Size, reach: Float) =
        Rect(
            0f,
            if (first) 0f else -reach,
            size.width,
            if (last) size.height else size.height + reach,
        )

    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density) =
        radius(size, density).let {
            Outline.Rounded(RoundRect(bounds(size, 2 * it), CornerRadius(it)))
        }

    /** The card's ring, a [stroke] inside its edge as `Modifier.border` draws it. */
    fun ring(size: Size, density: Density, stroke: Float): RoundRect {
        val radius = radius(size, density)
        return RoundRect(
            bounds(size, 2 * radius).deflate(stroke / 2),
            CornerRadius(radius - stroke / 2),
        )
    }

    /** Room for the shadow beyond the segment's outer edges only. */
    val shadowRoom =
        object : Shape {
            override fun createOutline(
                size: Size,
                layoutDirection: LayoutDirection,
                density: Density,
            ): Outline {
                val reach = 2 * radius(size, density)
                return Outline.Rectangle(
                    Rect(
                        -reach,
                        if (first) -reach else 0f,
                        size.width + reach,
                        if (last) size.height + reach else size.height,
                    )
                )
            }
        }
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
