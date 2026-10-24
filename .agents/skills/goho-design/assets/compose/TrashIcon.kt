package com.adamaho.goho.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import com.adamaho.goho.theme.*

/** The plain trash glyph for delete actions, in the current content colour by default. */
@Composable
internal fun TrashIcon(modifier: Modifier, color: Color = LocalContentColor.current) {
    Canvas(modifier) {
        fun line(x1: Float, y1: Float, x2: Float, y2: Float) =
            drawLine(
                color,
                Offset(size.width * x1, size.height * y1),
                Offset(size.width * x2, size.height * y2),
                GohoSpacing.iconStroke.toPx(),
                StrokeCap.Round,
            )
        line(.18f, .28f, .82f, .28f)
        line(.38f, .28f, .38f, .13f)
        line(.38f, .13f, .62f, .13f)
        line(.62f, .13f, .62f, .28f)
        line(.27f, .29f, .31f, .87f)
        line(.31f, .87f, .69f, .87f)
        line(.69f, .87f, .73f, .29f)
        line(.43f, .43f, .43f, .71f)
        line(.57f, .43f, .57f, .71f)
    }
}
