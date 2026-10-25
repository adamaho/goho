package com.adamaho.goho.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import com.adamaho.goho.R
import com.adamaho.goho.theme.*

@Composable
internal fun PhotoControlButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    opacity: () -> Float = { 1f },
) {
    // The photo well stays dark in both app themes; use the same variant 2 dark finish.
    GohoTheme(darkTheme = true) {
        IconButton(
            contentDescription = stringResource(R.string.photo_close),
            onClick = onClick,
            modifier = modifier,
            opacity = opacity,
        ) {
            CloseIcon()
        }
    }
}

/** The X drawn in close and clear buttons, in the current content colour. */
@Composable
internal fun CloseIcon(iconSize: Dp = GohoSpacing.photoCloseIcon) {
    val tint = LocalContentColor.current
    Canvas(Modifier.size(iconSize)) {
        fun line(x1: Float, y1: Float, x2: Float, y2: Float) =
            drawLine(
                tint,
                Offset(size.width * x1, size.height * y1),
                Offset(size.width * x2, size.height * y2),
                GohoSpacing.iconStroke.toPx(),
                StrokeCap.Round,
            )
        line(.24f, .24f, .76f, .76f)
        line(.24f, .76f, .76f, .24f)
    }
}
