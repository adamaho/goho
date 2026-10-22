package com.adamaho.goho.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.theme.*

/** Persistent round action using the same glossy finish and press feedback as other buttons. */
@Composable
fun AddButton(
    open: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val reduced = rememberReducedMotion()
    val haptics = LocalHapticFeedback.current
    val rotation by
        animateFloatAsState(
            if (open) 45f else 0f,
            tween(
                if (reduced) 0
                else if (open) GohoMotion.ADD_MENU_ENTER_MILLIS else GohoMotion.ADD_MENU_EXIT_MILLIS
            ),
            label = "Add icon rotation",
        )
    val contentColor = GohoTheme.colors.onButtonPrimary
    IconButton(
        contentDescription = stringResource(if (open) R.string.add_menu_close else R.string.add),
        onClick = {
            if (!open) haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
            onClick()
        },
        modifier = modifier.size(GohoSpacing.addButton),
        variant = 1,
        color = ButtonColor.Purple,
        enabled = enabled,
        pressed = open,
    ) {
        Canvas(Modifier.size(GohoSpacing.addIcon).graphicsLayer { rotationZ = rotation }) {
            val stroke = GohoSpacing.addIconStroke.toPx()
            drawLine(
                contentColor,
                Offset(stroke / 2, center.y),
                Offset(size.width - stroke / 2, center.y),
                stroke,
                StrokeCap.Round,
            )
            drawLine(
                contentColor,
                Offset(center.x, stroke / 2),
                Offset(center.x, size.height - stroke / 2),
                stroke,
                StrokeCap.Round,
            )
        }
    }
}
