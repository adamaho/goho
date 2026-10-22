package com.adamaho.goho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.*
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.unit.Dp
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
