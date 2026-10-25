package com.adamaho.goho.theme

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.ui.unit.dp

object GohoMotion {
    const val SECTION_MENU_ENTER_MILLIS = 160
    const val SECTION_MENU_EXIT_MILLIS = 120
    const val SECTION_MENU_START_SCALE = 0.96f
    const val SECTION_MENU_SCRIM_ALPHA = 0.35f
    const val ADD_MENU_ENTER_MILLIS = 180
    const val ADD_MENU_EXIT_MILLIS = 140
    const val ADD_MENU_SCRIM_ENTER_MILLIS = 240
    const val ADD_MENU_SCRIM_EXIT_MILLIS = 180
    const val ADD_MENU_STAGGER_MILLIS = 45L
    const val ADD_MENU_START_SCALE = 0.92f
    val addMenuEnter: AnimationSpec<Float> = spring(dampingRatio = 0.6f, stiffness = 450f)
    val addMenuTranslation = 8.dp
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
    // Search opens and closes along a shared horizontal axis: the outgoing header leaves toward
    // one side as the incoming one arrives from the other, while the content drifts vertically
    // through its crossfade and Add steps aside. The result count is announced once typing pauses.
    const val SEARCH_EXIT_MILLIS = 120
    const val SEARCH_HEADER_OPEN_DELAY_MILLIS = 100
    const val SEARCH_HEADER_OPEN_MILLIS = 240
    const val SEARCH_HEADER_CLOSE_DELAY_MILLIS = 120
    const val SEARCH_HEADER_CLOSE_MILLIS = 200
    const val SEARCH_CONTENT_OPEN_EXIT_MILLIS = 140
    const val SEARCH_CONTENT_ENTER_DELAY_MILLIS = 100
    const val SEARCH_CONTENT_ENTER_MILLIS = 300
    const val SEARCH_ADD_OUT_MILLIS = 180
    const val SEARCH_ADD_IN_DELAY_MILLIS = 260
    const val SEARCH_ADD_IN_MILLIS = 200
    const val SEARCH_ADD_SCALE = 0.8f
    val searchAxisShift = 40.dp
    val searchContentShift = 14.dp
    const val SEARCH_ANNOUNCE_DELAY_MILLIS = 500L
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
    const val BOOK_OVERLAY_OPEN_MILLIS = 290
    const val BOOK_OVERLAY_CLOSE_MILLIS = 220
    const val BOOK_OVERLAY_FROST_MILLIS = 170
    const val BOOK_OVERLAY_REDUCED_MILLIS = 150
    const val BOOK_COVER_CROSSFADE_MILLIS = 150
    const val BOOK_OVERLAY_TEXT_FRACTION = 0.3f // Close arrives over the last 30%
    // Title, author and tag fade in and settle down one after another once the cover has landed.
    const val BOOK_OVERLAY_DETAIL_DELAY_MILLIS = 260
    const val BOOK_OVERLAY_DETAIL_MILLIS = 260
    const val BOOK_OVERLAY_DETAIL_STAGGER_MILLIS = 70
    const val BOOK_OVERLAY_FROST_ALPHA = 0.86f
    const val BOOK_OVERLAY_FROST_FALLBACK_ALPHA = 0.94f // where blur is unavailable (API < 31)
    const val BOOK_OVERLAY_DRAG_FROST_FADE = 0.6f // frost fades by up to 60% while dragging
    val emphasizedDecelerate: Easing = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)
    val emphasizedAccelerate: Easing = CubicBezierEasing(0.3f, 0f, 0.8f, 0.15f)
    val standard: Easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)
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
