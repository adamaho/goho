package com.adamaho.goho.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.res.stringResource
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
        GohoIconButton(
            contentDescription = stringResource(R.string.receipt_photo_close),
            onClick = onClick,
            modifier = modifier,
            opacity = opacity,
        ) {
            val tint = LocalContentColor.current
            Canvas(Modifier.size(GohoSpacing.photoCloseIcon)) {
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
    }
}
