package com.adamaho.goho.ui.components

import android.os.SystemClock
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.pullToRefresh
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlinx.coroutines.delay

/** Uses the platform nested-scroll gesture with Goho's own indicator and accessibility action. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PullToRefresh(
    refreshing: Boolean,
    failed: Boolean,
    enabled: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val state = rememberPullToRefreshState()
    val colors = GohoTheme.colors
    val reduced = rememberReducedMotion()
    val haptics = LocalHapticFeedback.current
    var wasRefreshing by remember { mutableStateOf(false) }
    var refreshStartedAt by remember { mutableLongStateOf(0L) }
    var showFailure by remember { mutableStateOf(false) }
    var dismissing by remember { mutableStateOf(false) }
    var dismissDistance by remember { mutableFloatStateOf(0f) }
    val exitScale = remember { Animatable(1f) }
    val exitAlpha = remember { Animatable(1f) }
    val currentReduced by rememberUpdatedState(reduced)
    // Capture the outcome of manual work. Background polling must not show or dismiss this cue.
    LaunchedEffect(refreshing) {
        if (refreshing) {
            refreshStartedAt = SystemClock.elapsedRealtime()
            dismissing = false
            exitScale.snapTo(1f)
            exitAlpha.snapTo(1f)
            showFailure = false
            wasRefreshing = true
        } else if (wasRefreshing) {
            // Keep only the presentation open; receipt data can update as soon as it arrives.
            val outcomeFailed = failed
            val elapsed = SystemClock.elapsedRealtime() - refreshStartedAt
            delay((GohoMotion.REFRESH_MIN_VISIBLE_MILLIS - elapsed).coerceAtLeast(0L))
            if (outcomeFailed) {
                wasRefreshing = false
                showFailure = true
                delay(GohoMotion.REFRESH_FAILURE_MILLIS)
            }
            // Keep the indicator pinned until it is invisible; only then settle the list.
            dismissDistance = state.distanceFraction.coerceIn(0f, 1f)
            dismissing = true
            wasRefreshing = false
            if (!currentReduced) {
                exitScale.animateTo(
                    0f,
                    GohoMotion.refreshExit,
                )
            }
            exitAlpha.snapTo(0f)
            showFailure = false
            dismissing = false
        }
    }
    val spinning = refreshing || wasRefreshing
    val failure = showFailure
    val pinned = spinning || failure || dismissing
    val drawSpinner = spinning || (dismissing && !failure)
    LaunchedEffect(pinned, state.distanceFraction == 0f) {
        if (!pinned && state.distanceFraction == 0f) {
            exitScale.snapTo(1f)
            exitAlpha.snapTo(1f)
        }
    }
    val currentEnabled by rememberUpdatedState(enabled && !pinned)
    LaunchedEffect(state, haptics) {
        var ticked = false
        snapshotFlow { Triple(state.distanceFraction, state.isAnimating, currentEnabled) }
            .collect { (distance, animating, canPull) ->
                if (distance <= 0f) ticked = false
                if (canPull && !animating && distance >= 1f && !ticked) {
                    haptics.performHapticFeedback(HapticFeedbackType.GestureThresholdActivate)
                    ticked = true
                }
            }
    }
    val morph by
        animateFloatAsState(
            if (failure) 1f else 0f,
            tween(if (reduced) 0 else GohoMotion.REFRESH_MORPH_MILLIS),
            label = "Refresh warning morph",
        )
    val rotation = remember { Animatable(0f) }
    // Keep rotating while the spinner is visible, including its dismissal.
    LaunchedEffect(drawSpinner, reduced) {
        if (drawSpinner && !reduced) {
            rotation.snapTo(0f)
            rotation.animateTo(
                360f,
                infiniteRepeatable(tween(GohoMotion.LOADING_SPIN_MILLIS, easing = LinearEasing)),
            )
        }
    }
    val loadingSweep by
        animateFloatAsState(
            if (drawSpinner) 270f else 360f,
            tween(if (reduced) 0 else GohoMotion.REFRESH_MORPH_MILLIS),
            label = "Refresh ring sweep",
        )
    val refreshLabel = stringResource(R.string.receipts_refresh)
    val progressLabel = stringResource(R.string.receipts_refreshing)
    val failureLabel = stringResource(R.string.receipts_refresh_failed_indicator)
    val pullLabel = stringResource(R.string.receipts_pull_to_refresh)
    val releaseLabel = stringResource(R.string.receipts_release_to_refresh)
    // Material retains the drag position while running, including the brief failure outcome.
    val distance = state.distanceFraction.coerceIn(0f, 1f)
    val offset = GohoSpacing.refreshThreshold * distance
    Box(
        modifier
            .clipToBounds()
            .pullToRefresh(
                isRefreshing = pinned,
                state = state,
                enabled = enabled && !pinned,
                threshold = GohoSpacing.refreshThreshold,
                onRefresh = onRefresh,
            )
            .semantics {
                isTraversalGroup = true
                if (enabled && !pinned)
                    customActions =
                        listOf(
                            CustomAccessibilityAction(refreshLabel) {
                                onRefresh()
                                true
                            }
                        )
            }
    ) {
        // Reserve space instead of painting the indicator over a receipt. The footer stays
        // anchored.
        Column(Modifier.fillMaxSize()) {
            Spacer(Modifier.height(offset))
            Box(Modifier.weight(1f)) { content() }
        }
        if (pinned || distance > 0f) {
            val enterScale = remember { Animatable(if (reduced) 1f else 0f) }
            LaunchedEffect(reduced) {
                if (reduced) enterScale.snapTo(1f)
                else enterScale.animateTo(1f, GohoMotion.refreshEnter)
            }
            Box(
                Modifier.align(Alignment.TopCenter)
                    .graphicsLayer {
                        val indicatorOffset =
                            if (dismissing) GohoSpacing.refreshThreshold * dismissDistance
                            else offset
                        translationY =
                            (indicatorOffset.toPx() - GohoSpacing.refreshIndicator.toPx()) / 2f
                        scaleX = enterScale.value * exitScale.value
                        scaleY = scaleX
                        alpha = exitAlpha.value * exitScale.value.coerceIn(0f, 1f)
                    }
                    .size(GohoSpacing.refreshIndicator)
                    .shadow(GohoSpacing.buttonShadowRadius, GohoShapes.pill)
                    .background(colors.surface, GohoShapes.pill)
                    .semantics {
                        contentDescription =
                            when {
                                failure -> failureLabel
                                drawSpinner -> progressLabel
                                distance >= 1f -> releaseLabel
                                else -> pullLabel
                            }
                        if (spinning || failure) liveRegion = LiveRegionMode.Polite
                        if (spinning) progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate
                    },
                contentAlignment = Alignment.Center,
            ) {
                Canvas(Modifier.size(GohoSpacing.loadingIcon)) {
                    val stroke = GohoSpacing.iconStroke.toPx()
                    val radius = (size.minDimension - stroke) / 2f
                    val color = lerp(colors.accent, colors.attention, morph)
                    val outline = Stroke(stroke, cap = StrokeCap.Round, join = StrokeJoin.Round)
                    if (failure || morph > 0f) {
                        // Matching perimeter samples turn the closed ring into a triangle in place.
                        val corners =
                            listOf(
                                Offset(center.x, center.y - radius),
                                Offset(center.x + radius, center.y + radius),
                                Offset(center.x - radius, center.y + radius),
                            )
                        val path = Path()
                        for (i in 0..60) {
                            val fraction = i / 60f
                            val angle = -PI / 2 + fraction * 2 * PI
                            val circle =
                                center + Offset(cos(angle).toFloat(), sin(angle).toFloat()) * radius
                            val edge = (i / 20).coerceAtMost(2)
                            val along = (i - edge * 20) / 20f
                            val triangle =
                                corners[edge] + (corners[(edge + 1) % 3] - corners[edge]) * along
                            val point = circle + (triangle - circle) * morph
                            if (i == 0) path.moveTo(point.x, point.y)
                            else path.lineTo(point.x, point.y)
                        }
                        path.close()
                        drawPath(path, color, style = outline)
                        drawLine(
                            color.copy(alpha = morph),
                            center - Offset(0f, radius * .25f),
                            center + Offset(0f, radius * .25f),
                            stroke,
                            StrokeCap.Round,
                        )
                        drawCircle(
                            color.copy(alpha = morph),
                            stroke / 2f,
                            center + Offset(0f, radius * .62f),
                        )
                    } else {
                        drawArc(
                            color = color,
                            startAngle = -90f + if (drawSpinner) rotation.value else 0f,
                            sweepAngle = if (drawSpinner) loadingSweep else 360f * distance,
                            useCenter = false,
                            topLeft = Offset(stroke / 2, stroke / 2),
                            size = Size(size.width - stroke, size.height - stroke),
                            style = outline,
                        )
                    }
                }
            }
        }
    }
}
