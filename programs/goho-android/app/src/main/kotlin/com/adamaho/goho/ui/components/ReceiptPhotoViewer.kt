package com.adamaho.goho.ui.components

import android.view.WindowManager
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import kotlin.math.roundToInt

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ReceiptPhotoViewer(image: ImageBitmap, merchant: String, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    val state = remember(image) { ReceiptPhotoState(IntSize(image.width, image.height), scope) }
    val reduced = rememberReducedMotion()
    SideEffect { state.reducedMotion = reduced }
    var closing by remember { mutableStateOf(false) }
    val visibility = remember { Animatable(0f) }
    val finish by rememberUpdatedState(onClose)
    val dismiss = {
        state.stop()
        closing = true
    }
    LaunchedEffect(closing) {
        visibility.animateTo(
            if (closing) 0f else 1f,
            if (reduced) snap() else GohoPhotoMotion.visibility,
        )
        if (closing) finish()
    }
    Dialog(
        onDismissRequest = dismiss,
        properties =
            DialogProperties(
                usePlatformDefaultWidth = false,
                decorFitsSystemWindows = false,
            ),
    ) {
        GohoTheme(darkTheme = true) {
            val showControls = state.controls && state.drag == 0f && !closing
            PhotoViewerWindow(showControls)
            val controlsAlpha by
                animateFloatAsState(
                    if (showControls) 1f else 0f,
                    if (reduced) snap() else GohoPhotoMotion.controls,
                    label = "photo controls",
                )
            val density = LocalDensity.current
            val statusBarTop =
                with(density) { WindowInsets.statusBarsIgnoringVisibility.getTop(this).toDp() }
            val controlTop = statusBarTop + GohoSpacing.photoCloseTop
            val dragRange = with(density) { GohoSpacing.photoDragRange.toPx() }
            val dismissDistance = with(density) { GohoSpacing.photoDismissDistance.toPx() }
            val description =
                if (merchant.isBlank()) stringResource(R.string.receipt_photo_description)
                else stringResource(R.string.receipt_photo_merchant_description, merchant)
            val zoomIn = stringResource(R.string.receipt_photo_zoom_in)
            val zoomOut = stringResource(R.string.receipt_photo_zoom_out)
            val toggle = stringResource(R.string.receipt_photo_toggle_controls)
            val zoomDescription =
                stringResource(R.string.receipt_photo_zoom_level, (state.scale * 100).roundToInt())
            Box(
                Modifier.fillMaxSize().clipToBounds().drawBehind {
                    val dragFraction = (state.drag / dragRange).coerceIn(0f, 1f)
                    drawRect(
                        GohoDarkColors.photoWellEdge.copy(
                            alpha =
                                visibility.value *
                                    (1f -
                                        (1f - GohoPhotoMotion.MIN_BACKGROUND_ALPHA) * dragFraction)
                        )
                    )
                }
            ) {
                Box(
                    Modifier.fillMaxSize()
                        .onSizeChanged(state::resize)
                        .photoGestures(
                            state,
                            dismissDistance,
                            GohoPhotoMotion.DISMISS_VELOCITY_DP * density.density,
                            dismiss,
                        )
                        .semantics {
                            contentDescription = description
                            stateDescription = zoomDescription
                            role = Role.Image
                            onClick(toggle) {
                                state.controls = !state.controls
                                true
                            }
                            customActions =
                                listOf(
                                    CustomAccessibilityAction(zoomIn) {
                                        state.zoomTo(state.scale * 1.5f)
                                        true
                                    },
                                    CustomAccessibilityAction(zoomOut) {
                                        state.zoomTo(state.scale / 1.5f)
                                        true
                                    },
                                )
                            // TalkBack scroll gestures pan the zoomed photo without requiring
                            // multitouch.
                            scrollBy { x, y ->
                                if (state.scale <= 1f) false
                                else {
                                    state.stop()
                                    state.transform(state.center, Offset(-x, -y), 1f)
                                    true
                                }
                            }
                        }
                ) {
                    Image(
                        image,
                        null,
                        Modifier.fillMaxSize().graphicsLayer {
                            val dragFraction = (state.drag / dragRange).coerceIn(0f, 1f)
                            val entrance =
                                GohoPhotoMotion.ENTER_SCALE +
                                    (1f - GohoPhotoMotion.ENTER_SCALE) * visibility.value
                            val dismissal =
                                1f - (1f - GohoPhotoMotion.MIN_DRAG_SCALE) * dragFraction
                            scaleX = state.scale * entrance * dismissal
                            scaleY = scaleX
                            translationX = state.offset.x
                            translationY = state.offset.y + state.drag
                            alpha = visibility.value
                        },
                        contentScale = ContentScale.Fit,
                    )
                }
                PhotoControlButton(
                    onClick = dismiss,
                    modifier =
                        Modifier.align(Alignment.TopStart)
                            .windowInsetsPadding(
                                WindowInsets.displayCutout.only(WindowInsetsSides.Horizontal)
                            )
                            .padding(
                                start = GohoSpacing.screenMargin,
                                top = controlTop,
                            ),
                    opacity = { controlsAlpha * visibility.value },
                )
            }
        }
    }
}

/** A separate transparent window keeps details visible under a swipe and isolates bar styling. */
@Composable
private fun PhotoViewerWindow(showControls: Boolean) {
    val view = LocalView.current
    val window = (view.parent as? DialogWindowProvider)?.window
    DisposableEffect(window) {
        window?.apply {
            clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            setBackgroundDrawableResource(android.R.color.transparent)
            WindowCompat.setDecorFitsSystemWindows(this, false)
            @Suppress("DEPRECATION")
            statusBarColor = android.graphics.Color.TRANSPARENT
            @Suppress("DEPRECATION")
            navigationBarColor = android.graphics.Color.TRANSPARENT
            if (android.os.Build.VERSION.SDK_INT >= 29) isNavigationBarContrastEnforced = false
            val controller = WindowCompat.getInsetsController(this, view)
            controller.isAppearanceLightStatusBars = false
            controller.isAppearanceLightNavigationBars = false
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        onDispose {}
    }
    LaunchedEffect(window, showControls) {
        window?.let {
            val controller = WindowCompat.getInsetsController(it, view)
            if (showControls) controller.show(WindowInsetsCompat.Type.systemBars())
            else controller.hide(WindowInsetsCompat.Type.systemBars())
        }
    }
}
