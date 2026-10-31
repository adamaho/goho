package com.adamaho.goho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import com.adamaho.goho.theme.*

/**
 * A lavender text action in a 44dp pill that fills with `accentContainer` while pressed, with the
 * Goho press and no ripple: Add author in the book overlay and the snackbar's Edit or Try again.
 */
@Composable
internal fun TextAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    style: TextStyle = GohoTheme.type.buttonSecondarySmall,
    icon: (@Composable () -> Unit)? = null,
) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    Row(
        modifier
            .pressFeedback { progress }
            .clip(GohoShapes.pill)
            .background(c.accentContainer.copy(alpha = progress.coerceIn(0f, 1f)))
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .heightIn(min = GohoSpacing.headerHeight)
            .padding(horizontal = GohoSpacing.textActionHorizontal),
        horizontalArrangement = Arrangement.spacedBy(GohoSpacing.textActionIconGap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        icon?.invoke()
        Text(text, style = style, color = c.onAccentContainer)
    }
}
