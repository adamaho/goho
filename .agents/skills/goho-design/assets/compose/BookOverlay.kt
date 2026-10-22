package com.adamaho.goho.ui.main

import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import kotlinx.coroutines.launch

// Reference only (not compiled). Approved October 22, 2026; not implemented.
// Behaviour: references/screens.md section 9. Replaces a book details screen.

private const val OPEN_MILLIS = 340
private const val CLOSE_MILLIS = 260
private val DismissDistance = 96.dp
private const val DISMISS_FLING_DP_PER_SECOND = 1_000f

/**
 * The Books section hosts rows and the overlay in one SharedTransitionLayout. The row's BookCover
 * and the overlay cover share `Modifier.sharedBounds(rememberSharedContentState("cover-$bookId"))`,
 * so tapping a row flies its cover to the overlay and closing flies it home. No navigation.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
internal fun BooksWithOverlay(rows: @Composable SharedTransitionScope.(AnimatedVisibilityScope, open: (BookListEntry.Saved) -> Unit) -> Unit) {
    var lifted by remember { mutableStateOf<BookListEntry.Saved?>(null) }
    val reduced = rememberReducedMotion()
    SharedTransitionLayout {
        AnimatedContent(
            targetState = lifted,
            transitionSpec = {
                if (reduced) fadeIn(tween(150)) togetherWith fadeOut(tween(150))
                else fadeIn(tween(200)) togetherWith fadeOut(tween(CLOSE_MILLIS))
            },
            label = "bookOverlay",
        ) { book ->
            // The list always stays underneath; only the overlay content toggles.
            Box(Modifier.fillMaxSize()) {
                rows(this@AnimatedContent) { lifted = it }
                if (book != null) LiftedBook(book, this@AnimatedContent, onClose = { lifted = null })
            }
        }
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun SharedTransitionScope.LiftedBook(
    entry: BookListEntry.Saved,
    visibility: AnimatedVisibilityScope,
    onClose: () -> Unit,
) {
    val c = GohoTheme.colors
    val scope = rememberCoroutineScope()
    val drag = remember { Animatable(0f) }
    val dismissPx = with(androidx.compose.ui.platform.LocalDensity.current) { DismissDistance.toPx() }
    val progress = (drag.value / dismissPx).coerceIn(0f, 1f)
    var deleting by remember { mutableStateOf(DeleteState.Idle) }
    BackHandler(enabled = deleting != DeleteState.Deleting, onBack = onClose)

    Box(
        Modifier.fillMaxSize()
            // Frost: background 86% over a 14dp blur of the list (94%, no blur, where unsupported).
            .background(c.background.copy(alpha = 0.86f * (1f - progress * 0.6f)))
            .clickable(remember { MutableInteractionSource() }, indication = null, onClick = onClose)
            .semantics { paneTitle = entry.book.title; isTraversalGroup = true }
    ) {
        Column(
            Modifier.fillMaxSize()
                .padding(top = 76.dp)
                .draggable(
                    rememberDraggableState { d -> scope.launch { drag.snapTo((drag.value + d).coerceAtLeast(0f)) } },
                    Orientation.Vertical,
                    enabled = deleting != DeleteState.Deleting,
                    onDragStopped = { velocity ->
                        if (drag.value > dismissPx || velocity > DISMISS_FLING_DP_PER_SECOND) onClose()
                        else drag.animateTo(0f, spring(dampingRatio = 0.8f, stiffness = 400f))
                    },
                )
                .graphicsLayer {
                    translationY = drag.value
                    val s = 1f - 0.14f * progress
                    scaleX = s; scaleY = s
                },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Shared with the row thumbnail: animate the clip, not the scale, so a photo's 2:3 crop opens out.
            BookOverlayCover(
                entry.book,
                Modifier.sharedBounds(
                    rememberSharedContentState("cover-${entry.book.id}"),
                    visibility,
                    boundsTransform = { _, _ -> tween(OPEN_MILLIS, easing = EmphasizedDecelerateEasing) },
                    resizeMode = SharedTransitionScope.ResizeMode.RemeasureToBounds,
                ),
            )
            with(visibility) {
                BookOverlayText(
                    entry.book,
                    Modifier.padding(top = 24.dp)
                        .animateEnterExit(
                            enter = fadeIn(tween(100, delayMillis = 240)) + slideInVertically(tween(100, delayMillis = 240)) { 8 },
                            exit = fadeOut(tween(80)),
                        )
                        .graphicsLayer { alpha = 1f - progress },
                )
            }
        }
        RoundIconButton(Icons.Close, "Close", onClose, Modifier.align(Alignment.TopEnd).padding(16.dp))
        BookDeleteActions(
            state = deleting,
            onChange = { deleting = it },
            bookId = entry.book.id,
            modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(16.dp, 0.dp, 16.dp, 28.dp),
        ) // Delete book → in-place red Delete book + Cancel; success fades out without the flight home.
    }
}

private enum class DeleteState { Idle, Confirm, Deleting, Failed }

private val EmphasizedDecelerateEasing = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)
