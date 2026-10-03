package com.adamaho.goho.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.*
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import com.adamaho.goho.theme.*

@Composable
fun GohoActionButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = true,
    enabled: Boolean = true,
    icon: (@Composable () -> Unit)? = null,
    destructive: Boolean = false,
) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    val p = if (enabled) progress.coerceIn(0f, 1f) else 0f
    Row(
        modifier
            .fillMaxWidth()
            .gohoPress { if (enabled) progress else 0f }
            .alpha(if (enabled) 1f else 0.4f)
            .gohoButtonSurface(c, GohoShapes.button, p, primary, destructive)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .heightIn(min = GohoSpacing.buttonHeight)
            .padding(horizontal = GohoSpacing.buttonHorizontal, vertical = GohoSpacing.contentGap),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement =
            Arrangement.spacedBy(GohoSpacing.buttonIconGap, Alignment.CenterHorizontally),
    ) {
        icon?.invoke()
        Text(
            text,
            style = if (primary) GohoTheme.type.button else GohoTheme.type.buttonSecondary,
            color = if (destructive) c.onDanger else if (primary) c.onAccent else c.textPrimary,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun UploadIcon() {
    val color = GohoTheme.colors.onAccent
    Canvas(Modifier.size(GohoSpacing.buttonIcon)) {
        val stroke = GohoSpacing.iconStroke.toPx()
        fun line(x1: Float, y1: Float, x2: Float, y2: Float) =
            drawLine(
                color,
                Offset(size.width * x1, size.height * y1),
                Offset(size.width * x2, size.height * y2),
                stroke,
                StrokeCap.Round,
            )
        line(0.5f, 0.12f, 0.5f, 0.62f)
        line(0.3f, 0.32f, 0.5f, 0.12f)
        line(0.5f, 0.12f, 0.7f, 0.32f)
        line(0.15f, 0.6f, 0.15f, 0.88f)
        line(0.15f, 0.88f, 0.85f, 0.88f)
        line(0.85f, 0.88f, 0.85f, 0.6f)
    }
}
