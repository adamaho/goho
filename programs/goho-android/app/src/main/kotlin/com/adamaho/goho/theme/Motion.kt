package com.adamaho.goho.theme

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.ui.unit.dp

object GohoMotion {
    const val STATUS_ENTER_MILLIS = 200
    const val STATUS_CROSSFADE_MILLIS = 200
    val statusEnterTranslation = 6.dp
    const val SHEET_CONTENT_MILLIS = 280
    const val SHEET_CONTENT_FADE_OUT_MILLIS = 90
    const val SHEET_CONTENT_FADE_IN_MILLIS = 180
    const val HOLD_DELAY_MILLIS = 150L
    const val HOLD_SCALE = 0.98f
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

object GohoPhotoMotion {
    const val MAX_ZOOM = 4f
    const val DOUBLE_TAP_ZOOM = 2.5f
    const val MIN_DRAG_SCALE = 0.86f
    const val MIN_BACKGROUND_ALPHA = 0.55f
    const val ENTER_SCALE = 0.96f
    const val DISMISS_VELOCITY_DP = 1000f
    val zoom: AnimationSpec<Float> = tween(300, easing = FastOutSlowInEasing)
    val settle: AnimationSpec<Float> = spring(dampingRatio = 0.8f, stiffness = 400f)
    val visibility: AnimationSpec<Float> = tween(220)
    val controls: AnimationSpec<Float> = tween(200)
}
