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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import com.adamaho.goho.R
import com.adamaho.goho.theme.*

fun Modifier.topHighlight(color: Color): Modifier = drawWithContent {
    drawContent()
    val stroke = GohoSpacing.hairline.toPx()
    drawLine(color, Offset(0f, stroke / 2), Offset(size.width, stroke / 2), stroke)
}

@Composable
fun ReceiptCard(
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
fun ReceiptDivider() {
    Box(
        Modifier.fillMaxWidth()
            .padding(start = GohoSpacing.dividerStart)
            .height(GohoSpacing.hairline)
            .background(GohoTheme.colors.divider)
    )
}

@Composable
fun ScanButton(enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    val p = if (enabled) progress.coerceIn(0f, 1f) else 0f
    val description = stringResource(R.string.scan_receipt)
    Row(
        modifier
            .pressFeedback { if (enabled) progress else 0f }
            .alpha(if (enabled) 1f else 0.4f)
            .buttonSurface(c, GohoShapes.fab, p)
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
                        c.onButtonPrimary,
                        Offset(x, y),
                        Offset(x + sx * arm, y),
                        stroke,
                        StrokeCap.Round,
                    )
                    drawLine(
                        c.onButtonPrimary,
                        Offset(x, y),
                        Offset(x, y + sy * arm),
                        stroke,
                        StrokeCap.Round,
                    )
                }
            }
            drawLine(
                c.onButtonPrimary,
                Offset(size.width * 0.3f, size.height / 2),
                Offset(size.width * 0.7f, size.height / 2),
                stroke,
                StrokeCap.Round,
            )
        }
        Text(
            stringResource(R.string.scan_short),
            style = GohoTheme.type.button,
            color = c.onButtonPrimary,
        )
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
