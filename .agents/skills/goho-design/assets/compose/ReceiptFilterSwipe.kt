package com.goho.ui.components

import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import com.goho.ui.theme.GohoSpacing

/** Switches the existing filter on release, leaving vertical gestures to the list and refresh. */
@Composable
internal fun Modifier.receiptFilterSwipe(
    enabled: Boolean,
    attentionOnly: Boolean,
    onSelect: (Boolean) -> Unit,
): Modifier {
    val onSelectCurrent by rememberUpdatedState(onSelect)
    val haptics = LocalHapticFeedback.current
    val threshold = GohoSpacing.filterSwipeThreshold
    if (!enabled) return this
    return pointerInput(attentionOnly, threshold, haptics) {
        var distance = 0f
        detectHorizontalDragGestures(
            onDragStart = { distance = 0f },
            onDragCancel = { distance = 0f },
            onHorizontalDrag = { change, delta ->
                change.consume()
                distance += delta
            },
            onDragEnd = {
                val target =
                    when {
                        distance <= -threshold.toPx() -> true
                        distance >= threshold.toPx() -> false
                        else -> attentionOnly
                    }
                if (target != attentionOnly) {
                    haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                    onSelectCurrent(target)
                }
                distance = 0f
            },
        )
    }
}
