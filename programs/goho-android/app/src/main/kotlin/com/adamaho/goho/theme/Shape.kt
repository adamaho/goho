package com.adamaho.goho.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

object GohoShapes {
    val statusCard = RoundedCornerShape(32.dp)
    val sheetThumb = RoundedCornerShape(12.dp)
    val sheet = RoundedCornerShape(32.dp)
    val heldRow = RoundedCornerShape(18.dp)
    val button = RoundedCornerShape(20.dp)
    val thumb = RoundedCornerShape(10.dp)
    val card = RoundedCornerShape(24.dp)
    val fab = RoundedCornerShape(24.dp)
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
