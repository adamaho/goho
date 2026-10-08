package com.adamaho.goho.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.*
import com.adamaho.goho.theme.*
import kotlinx.coroutines.delay

@Composable
internal fun rememberLoadingVisible(loading: Boolean): Boolean {
    var visible by remember(loading) { mutableStateOf(false) }
    LaunchedEffect(loading) {
        if (loading) {
            delay(GohoMotion.LOADING_DELAY_MILLIS)
            visible = true
        }
    }
    return loading && visible
}

@Composable
fun GohoLoadingIcon(
    modifier: Modifier = Modifier,
    description: String? = null,
    color: Color = GohoTheme.colors.textSecondary,
) {
    val rotation =
        if (rememberReducedMotion()) 0f
        else {
            val transition = rememberInfiniteTransition(label = "Loading")
            val angle by
                transition.animateFloat(
                    initialValue = 0f,
                    targetValue = 360f,
                    animationSpec =
                        infiniteRepeatable(
                            tween(GohoMotion.LOADING_SPIN_MILLIS, easing = LinearEasing)
                        ),
                    label = "Loading rotation",
                )
            angle
        }
    Canvas(
        modifier
            .size(GohoSpacing.loadingIcon)
            .then(
                if (description != null)
                    Modifier.semantics {
                        contentDescription = description
                        progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate
                        liveRegion = LiveRegionMode.Polite
                    }
                else Modifier
            )
            .rotate(rotation)
    ) {
        val stroke = GohoSpacing.iconStroke.toPx()
        drawArc(
            color = color,
            startAngle = -90f,
            sweepAngle = 270f,
            useCenter = false,
            topLeft = Offset(stroke / 2f, stroke / 2f),
            size = Size(size.width - stroke, size.height - stroke),
            style = Stroke(stroke, cap = StrokeCap.Round),
        )
    }
}
