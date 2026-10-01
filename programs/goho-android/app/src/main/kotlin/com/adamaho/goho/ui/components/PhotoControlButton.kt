package com.adamaho.goho.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.adamaho.goho.R
import com.adamaho.goho.theme.*

@Composable
internal fun PhotoControlButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    opacity: () -> Float = { 1f },
) {
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    val label = stringResource(R.string.receipt_photo_close)
    // Keep the interactive/semantic node visible to TalkBack even when the drawing fades away.
    Box(
        modifier
            .size(GohoSpacing.headerHeight)
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClickLabel = label,
                onClick = onClick,
            )
            .semantics { contentDescription = label }
    ) {
        Box(
            Modifier.fillMaxSize()
                .graphicsLayer { alpha = opacity() }
                .gohoPress { progress }
                .clip(GohoShapes.pill)
                .background(GohoDarkColors.photoControl)
                .border(GohoSpacing.hairline, Color.White.copy(alpha = 0.08f), GohoShapes.pill),
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.size(GohoSpacing.photoCloseIcon)) {
                fun line(x1: Float, y1: Float, x2: Float, y2: Float) =
                    drawLine(
                        GohoDarkColors.textPrimary,
                        Offset(size.width * x1, size.height * y1),
                        Offset(size.width * x2, size.height * y2),
                        GohoSpacing.iconStroke.toPx(),
                        StrokeCap.Round,
                    )
                line(.24f, .24f, .76f, .76f)
                line(.24f, .76f, .76f, .24f)
            }
        }
    }
}
