package com.adamaho.goho.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import com.adamaho.goho.theme.*

/** A plus with the shared 2dp stroke, for add actions such as Add author. */
@Composable
internal fun PlusIcon(modifier: Modifier, color: Color = LocalContentColor.current) {
    Canvas(modifier) {
        val stroke = GohoSpacing.iconStroke.toPx()
        val inset = size.width * 0.21f
        drawLine(
            color,
            Offset(inset, center.y),
            Offset(size.width - inset, center.y),
            stroke,
            StrokeCap.Round,
        )
        drawLine(
            color,
            Offset(center.x, inset),
            Offset(center.x, size.height - inset),
            stroke,
            StrokeCap.Round,
        )
    }
}
