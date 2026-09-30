package com.adamaho.goho.ui.components

import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import com.adamaho.goho.theme.GohoMotion

@Composable
fun rememberReducedMotion(): Boolean {
    if (LocalView.current.isInEditMode) return true
    val resolver = LocalContext.current.contentResolver
    fun read() =
        Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    var reduced by remember(resolver) { mutableStateOf(read()) }
    DisposableEffect(resolver) {
        val observer =
            object : ContentObserver(Handler(Looper.getMainLooper())) {
                override fun onChange(selfChange: Boolean) {
                    reduced = read()
                }
            }
        resolver.registerContentObserver(
            Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE),
            false,
            observer,
        )
        reduced = read()
        onDispose { resolver.unregisterContentObserver(observer) }
    }
    return reduced
}

@Composable
fun pressProgress(interaction: MutableInteractionSource): State<Float> {
    val pressed by interaction.collectIsPressedAsState()
    val reduced = rememberReducedMotion()
    return animateFloatAsState(
        if (pressed) 1f else 0f,
        if (reduced) snap() else if (pressed) GohoMotion.pressIn else GohoMotion.pressOut,
        label = "Goho press",
    )
}

fun Modifier.gohoPress(progress: () -> Float): Modifier = graphicsLayer {
    val p = progress()
    scaleX = 1f - GohoMotion.PRESS_SCALE * p
    scaleY = scaleX
    translationY = GohoMotion.pressTranslation.toPx() * p.coerceIn(0f, 1f)
}

@Composable
fun shimmerBrush(base: Color, highlight: Color): Brush {
    if (rememberReducedMotion()) return SolidColor(base)
    val transition = rememberInfiniteTransition(label = "Reading receipt")
    val progress by
        transition.animateFloat(
            -1f,
            2f,
            infiniteRepeatable(tween(GohoMotion.SHIMMER_MILLIS, easing = LinearEasing)),
            label = "Shimmer",
        )
    val position = progress
    return object : ShaderBrush() {
        override fun createShader(size: Size): Shader =
            LinearGradientShader(
                Offset(size.width * (position - 0.5f), 0f),
                Offset(size.width * (position + 0.5f), 0f),
                listOf(base, highlight, base),
            )
    }
}
