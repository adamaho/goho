package com.adamaho.goho.ui.components

import androidx.annotation.IntRange
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.*
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextAlign
import com.adamaho.goho.theme.*

/**
 * [size] picks the full-width [ButtonSize.Regular] action or the compact [ButtonSize.Small] one,
 * which hugs its label, as for Clear search on the empty search state.
 *
 * [contentColor] overrides the label and icon colour of [color]'s palette, as for the Grey Delete
 * book action in `onDangerContainer`.
 */
@Composable
fun ActionButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    @IntRange(from = 1, to = 2) variant: Int = 1,
    color: ButtonColor = ButtonColor.Purple,
    enabled: Boolean = true,
    icon: (@Composable () -> Unit)? = null,
    reserveSpaceFor: List<String> = emptyList(),
    loading: Boolean = false,
    contentColor: Color = Color.Unspecified,
    size: ButtonSize = ButtonSize.Regular,
) {
    val c = GohoTheme.colors
    val content = contentColor.takeOrElse { c.buttonPalette(color).content }
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    val p = if (enabled) progress.coerceIn(0f, 1f) else 0f
    val small = size == ButtonSize.Small
    Row(
        modifier
            .then(if (small) Modifier else Modifier.fillMaxWidth())
            .pressFeedback { if (enabled) progress else 0f }
            .alpha(if (enabled) 1f else 0.4f)
            .buttonSurface(c, if (small) GohoShapes.buttonSmall else GohoShapes.button, p, variant, color)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .then(
                if (loading)
                    Modifier.semantics {
                        contentDescription = text
                        progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate
                    }
                else Modifier
            )
            .heightIn(min = if (small) GohoSpacing.buttonSmallHeight else GohoSpacing.buttonHeight)
            .padding(
                horizontal = if (small) GohoSpacing.buttonSmallHorizontal else GohoSpacing.buttonHorizontal,
                vertical = GohoSpacing.contentGap,
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement =
            Arrangement.spacedBy(GohoSpacing.buttonIconGap, Alignment.CenterHorizontally),
    ) {
        CompositionLocalProvider(LocalContentColor provides content) { icon?.invoke() }
        Box(contentAlignment = Alignment.Center) {
            val style =
                when {
                    small && variant == 1 -> GohoTheme.type.buttonSmall
                    small -> GohoTheme.type.buttonSecondarySmall
                    variant == 1 -> GohoTheme.type.button
                    else -> GohoTheme.type.buttonSecondary
                }
            // Measure every label in the same constraints so asynchronous actions never resize.
            reserveSpaceFor.forEach { label ->
                Text(
                    label,
                    style = style,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.clearAndSetSemantics {}.alpha(0f),
                )
            }
            Text(
                text,
                style = style,
                color = content,
                textAlign = TextAlign.Center,
                modifier = if (loading) Modifier.clearAndSetSemantics {}.alpha(0f) else Modifier,
            )
            if (loading)
                LoadingIcon(
                    modifier = Modifier.size(GohoSpacing.buttonIcon),
                    color = content,
                )
        }
    }
}

/** [Small] is 44dp tall with 16dp corners and a 15sp label, sized to its content. */
enum class ButtonSize {
    Regular,
    Small,
}

@Composable
fun UploadIcon() {
    val color = LocalContentColor.current
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
