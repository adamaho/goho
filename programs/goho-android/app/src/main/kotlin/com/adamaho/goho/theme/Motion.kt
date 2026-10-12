package com.adamaho.goho.theme

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.ui.unit.dp

object GohoMotion {
    const val LOADING_DELAY_MILLIS = 200L
    const val LOADING_SPIN_MILLIS = 1000
    const val REFRESH_MIN_VISIBLE_MILLIS = 200L
    const val REFRESH_BOUNCE_SCALE = 1.08f
    val refreshEnter: AnimationSpec<Float> = keyframes {
        durationMillis = 180
        0f at 0
        REFRESH_BOUNCE_SCALE at 110
        1f at 180
    }
    val refreshExit: AnimationSpec<Float> = keyframes {
        durationMillis = 220
        1f at 0
        REFRESH_BOUNCE_SCALE at 70
        0f at 220
    }
    const val REFRESH_MORPH_MILLIS = 240
    const val REFRESH_FAILURE_MILLIS = 3000L
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
