package com.adamaho.goho.ui.components

import androidx.annotation.IntRange
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.*
import com.adamaho.goho.theme.*

/** Icon-only action sharing the same finishes, colours and press feedback as labelled buttons. */
@Composable
fun IconButton(
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    @IntRange(from = 1, to = 2) variant: Int = 2,
    color: ButtonColor = ButtonColor.Grey,
    enabled: Boolean = true,
    opacity: () -> Float = { 1f },
    icon: @Composable () -> Unit,
) {
    val colors = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    val p = if (enabled) progress.coerceIn(0f, 1f) else 0f
    // Keep the touch target and TalkBack node present while photo controls fade visually.
    Box(
        modifier
            .size(GohoSpacing.headerHeight)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClickLabel = contentDescription,
                onClick = onClick,
            )
            .semantics { this.contentDescription = contentDescription }
    ) {
        Box(
            Modifier.fillMaxSize()
                .graphicsLayer { alpha = opacity().coerceIn(0f, 1f) * if (enabled) 1f else 0.4f }
                .pressFeedback { if (enabled) progress else 0f }
                .buttonSurface(colors, GohoShapes.pill, p, variant, color)
                .clearAndSetSemantics {},
            contentAlignment = Alignment.Center,
        ) {
            CompositionLocalProvider(
                LocalContentColor provides colors.buttonPalette(color).content
            ) {
                icon()
            }
        }
    }
}
