package com.adamaho.goho.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

object GohoShapes {
    val thumb = RoundedCornerShape(8.dp)
    val card = RoundedCornerShape(20.dp)
    val fab = RoundedCornerShape(20.dp)
    val pill = RoundedCornerShape(percent = 50)
}

internal val GohoMaterialShapes =
    Shapes(
        extraSmall = GohoShapes.thumb,
        small = GohoShapes.thumb,
        medium = GohoShapes.card,
        large = GohoShapes.card,
        extraLarge = GohoShapes.card,
    )
