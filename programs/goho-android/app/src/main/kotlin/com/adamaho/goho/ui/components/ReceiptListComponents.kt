package com.adamaho.goho.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.*
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.lerp as lerpColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.lerp
import com.adamaho.goho.R
import com.adamaho.goho.theme.*

fun Modifier.topHighlight(color: Color): Modifier = drawWithContent {
    drawContent()
    val stroke = GohoSpacing.hairline.toPx()
    drawLine(color, Offset(0f, stroke / 2), Offset(size.width, stroke / 2), stroke)
}

@Composable
fun ReceiptCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
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
        modifier.fillMaxWidth().then(edge).padding(vertical = GohoSpacing.cardVerticalPadding),
        content = content,
    )
}

@Composable
fun ReceiptDivider() {
    Box(
        Modifier.fillMaxWidth()
            .padding(start = GohoSpacing.dividerStart)
            .height(GohoSpacing.hairline)
            .background(GohoTheme.colors.divider)
    )
}

@Composable
fun ReceiptStatusPill(processing: Boolean) {
    val c = GohoTheme.colors
    val fg = if (processing) c.onAccentContainer else c.attention
    val bg = if (processing) c.accentContainer else c.attentionContainer
    Box(
        modifier =
            Modifier.heightIn(min = GohoSpacing.pillHeight)
                .clip(GohoShapes.pill)
                .background(bg)
                .padding(horizontal = GohoSpacing.pillHorizontal),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            stringResource(
                if (processing) R.string.receipt_reading else R.string.receipt_not_processed
            ),
            style =
                if (processing)
                    GohoTheme.type.label.copy(
                        brush = shimmerBrush(fg, lerpColor(fg, c.accentShimmer, 0.15f))
                    )
                else GohoTheme.type.label,
            color = if (processing) Color.Unspecified else fg,
        )
    }
}

@Composable
fun ScanButton(enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    val p = progress.coerceIn(0f, 1f)
    val description = stringResource(R.string.scan_receipt)
    Row(
        modifier
            .gohoPress { progress }
            .alpha(if (enabled) 1f else 0.4f)
            .shadow(
                lerp(GohoSpacing.fabElevation, GohoSpacing.pressedElevation, p),
                GohoShapes.fab,
                clip = false,
                ambientColor = c.accentShadow,
                spotColor = c.accentShadow,
            )
            .clip(GohoShapes.fab)
            .background(
                Brush.verticalGradient(
                    listOf(
                        lerpColor(c.accentTop, c.accent, p),
                        lerpColor(c.accent, c.accentPressed, p),
                    )
                )
            )
            .topHighlight(Color.White.copy(alpha = c.highlightAlpha * (1 - 0.45f * p)))
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                enabled = enabled,
                onClick = onClick,
            )
            .semantics { contentDescription = description }
            .heightIn(min = GohoSpacing.fabHeight)
            .padding(
                start = GohoSpacing.fabStart,
                end = GohoSpacing.fabEnd,
                top = GohoSpacing.contentGap,
                bottom = GohoSpacing.contentGap,
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(GohoSpacing.fabIconGap),
    ) {
        Canvas(Modifier.size(GohoSpacing.fabIcon)) {
            val stroke = GohoSpacing.iconStroke.toPx()
            val lo = stroke
            val hi = size.width - stroke
            val arm = size.width * 0.25f
            for ((x, sx) in listOf(lo to 1f, hi to -1f)) {
                for ((y, sy) in listOf(lo to 1f, hi to -1f)) {
                    drawLine(
                        c.onAccent,
                        Offset(x, y),
                        Offset(x + sx * arm, y),
                        stroke,
                        StrokeCap.Round,
                    )
                    drawLine(
                        c.onAccent,
                        Offset(x, y),
                        Offset(x, y + sy * arm),
                        stroke,
                        StrokeCap.Round,
                    )
                }
            }
            drawLine(
                c.onAccent,
                Offset(size.width * 0.3f, size.height / 2),
                Offset(size.width * 0.7f, size.height / 2),
                stroke,
                StrokeCap.Round,
            )
        }
        Text(stringResource(R.string.scan_short), style = GohoTheme.type.button, color = c.onAccent)
    }
}

@Composable
fun BottomScrim(modifier: Modifier = Modifier) {
    val background = GohoTheme.colors.background
    Box(
        modifier
            .fillMaxWidth()
            .height(GohoSpacing.scrimHeight)
            .background(
                Brush.verticalGradient(
                    0f to background.copy(alpha = 0f),
                    0.65f to background.copy(alpha = 0.9f),
                    1f to background,
                )
            )
    )
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
