package com.adamaho.goho.theme

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.ui.unit.dp

object GohoMotion {
    const val PRESS_SCALE = 0.03f // scale = 1 - PRESS_SCALE * progress
    val pressTranslation = 1.dp
    val pressIn: AnimationSpec<Float> = tween(durationMillis = 90)
    val pressOut: AnimationSpec<Float> = spring(dampingRatio = 0.55f, stiffness = 700f)
    val pressOutReduced: AnimationSpec<Float> = snap()
    val filterSelection: AnimationSpec<Float> = spring(dampingRatio = 0.6f, stiffness = 240f)
    const val FILTER_FILL_WIDTH_REVEAL = 0.14f
    const val FILTER_FILL_HEIGHT_REVEAL = 0.10f
    const val SHIMMER_MILLIS = 1800
}
