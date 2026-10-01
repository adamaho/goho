package com.adamaho.goho.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.foundation.gestures.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.isSpecified
import androidx.compose.ui.input.pointer.*
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.unit.IntSize
import com.adamaho.goho.theme.GohoPhotoMotion
import kotlin.math.abs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** Viewer-local state; the details photo and scroll position are never transformed. */
@Stable
internal class ReceiptPhotoState(
    private val imageSize: IntSize,
    private val scope: CoroutineScope,
) {
    var viewport by mutableStateOf(IntSize.Zero)
        private set

    var scale by mutableFloatStateOf(1f)
        private set

    var offset by mutableStateOf(Offset.Zero)
        private set

    var drag by mutableFloatStateOf(0f)
        private set

    var controls by mutableStateOf(true)
    var reducedMotion = false
    private var motion: Job? = null
    val center
        get() = Offset(viewport.width / 2f, viewport.height / 2f)

    fun resize(size: IntSize) {
        if (size == viewport) return
        stop()
        viewport = size
        scale = 1f
        offset = Offset.Zero
        drag = 0f
        controls = true
    }

    fun stop() {
        motion?.cancel()
    }

    private fun bounded(value: Offset, zoom: Float): Offset {
        if (viewport == IntSize.Zero) return Offset.Zero
        val fit =
            minOf(
                viewport.width.toFloat() / imageSize.width,
                viewport.height.toFloat() / imageSize.height,
            )
        val x = ((imageSize.width * fit * zoom - viewport.width) / 2).coerceAtLeast(0f)
        val y = ((imageSize.height * fit * zoom - viewport.height) / 2).coerceAtLeast(0f)
        return Offset(value.x.coerceIn(-x, x), value.y.coerceIn(-y, y))
    }

    fun transform(centroid: Offset, pan: Offset, zoom: Float) {
        if (!centroid.isSpecified) return
        val raw = scale * zoom
        val next =
            when {
                raw > GohoPhotoMotion.MAX_ZOOM ->
                    GohoPhotoMotion.MAX_ZOOM + (raw - GohoPhotoMotion.MAX_ZOOM) * .25f
                raw < 1f -> 1f + (raw - 1f) * .25f
                else -> raw
            }.coerceIn(.85f, GohoPhotoMotion.MAX_ZOOM + .3f)
        val anchor = centroid - center
        offset = bounded((offset - anchor) * (next / scale) + anchor + pan, next)
        scale = next
        drag = 0f
        if (zoom != 1f) controls = true
    }

    fun dragBy(delta: Float) {
        drag = (drag + delta).coerceAtLeast(0f)
    }

    private fun animateTo(zoom: Float, position: Offset, spec: AnimationSpec<Float>) {
        stop()
        val fromScale = scale
        val fromOffset = offset
        val fromDrag = drag
        motion = scope.launch {
            Animatable(0f).animateTo(1f, if (reducedMotion) snap() else spec) {
                scale = fromScale + (zoom - fromScale) * value
                offset = bounded(fromOffset + (position - fromOffset) * value, scale)
                drag = fromDrag * (1f - value).coerceAtLeast(0f)
            }
            scale = zoom
            offset = bounded(position, zoom)
            drag = 0f
        }
    }

    fun zoomTo(zoom: Float, point: Offset = center) {
        controls = true
        val target = zoom.coerceIn(1f, GohoPhotoMotion.MAX_ZOOM)
        val anchor = point - center
        animateTo(
            target,
            bounded((offset - anchor) * (target / scale) + anchor, target),
            GohoPhotoMotion.zoom,
        )
    }

    fun doubleTap(point: Offset) =
        zoomTo(if (scale > 1.01f) 1f else GohoPhotoMotion.DOUBLE_TAP_ZOOM, point)

    fun settle() {
        val target = scale.coerceIn(1f, GohoPhotoMotion.MAX_ZOOM)
        animateTo(target, bounded(offset, target), GohoPhotoMotion.settle)
    }
}

/** One drag recognizer arbitrates pinch/pan versus dismissal, after touch slop. */
internal fun Modifier.photoGestures(
    state: ReceiptPhotoState,
    dismissDistance: Float,
    dismissVelocity: Float,
    onDismiss: () -> Unit,
): Modifier =
    pointerInput(state) {
            detectTapGestures(
                onTap = { state.controls = !state.controls },
                onDoubleTap = state::doubleTap,
            )
        }
        .pointerInput(state, dismissDistance, dismissVelocity) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                state.stop()
                val velocity = VelocityTracker()
                velocity.addPosition(down.uptimeMillis, down.position)
                var totalPan = Offset.Zero
                var totalZoom = 1f
                var active = false
                var transformed = state.scale > 1.01f
                var multiTouch = false
                do {
                    val event = awaitPointerEvent()
                    val pan = event.calculatePan()
                    val zoom = event.calculateZoom()
                    val pointers = event.changes.count { it.pressed }
                    if (pointers > 1) multiTouch = true
                    event.changes
                        .firstOrNull { it.id == down.id }
                        ?.let { velocity.addPosition(it.uptimeMillis, it.position) }
                    if (!active) {
                        totalPan += pan
                        totalZoom *= zoom
                        val zoomMotion =
                            abs(1f - totalZoom) * event.calculateCentroidSize(useCurrent = false)
                        active =
                            totalPan.getDistance() > viewConfiguration.touchSlop ||
                                zoomMotion > viewConfiguration.touchSlop
                        if (active)
                            transformed =
                                transformed || multiTouch || abs(totalPan.x) > abs(totalPan.y)
                    }
                    if (active && pointers > 0) {
                        if (pointers > 1) transformed = true
                        if (transformed)
                            state.transform(event.calculateCentroid(useCurrent = false), pan, zoom)
                        else state.dragBy(pan.y)
                        event.changes.forEach { if (it.positionChanged()) it.consume() }
                    }
                } while (event.changes.any { it.pressed })
                if (active) {
                    val dismiss =
                        !transformed &&
                            state.drag > 0f &&
                            (state.drag > dismissDistance ||
                                velocity.calculateVelocity().y > dismissVelocity)
                    if (dismiss) onDismiss() else state.settle()
                } else if (state.drag > 0f || state.scale !in 1f..GohoPhotoMotion.MAX_ZOOM) {
                    state.settle()
                }
            }
        }
