package com.adamaho.goho.ui.components

import androidx.compose.animation.core.animate
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.SnackbarData
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.SnackbarVisuals
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.main.DeletionKind
import com.adamaho.goho.ui.main.Feedback
import com.adamaho.goho.ui.main.FeedbackMessage
import kotlin.math.abs
import kotlin.math.sign
import kotlinx.coroutines.flow.first

/**
 * The message being shown. Its copy is resolved when drawn; [actionLabel] is always set, since
 * every snackbar has at least its dismiss control, so accessibility timeouts allow for controls.
 */
private class FeedbackVisuals(val feedback: FeedbackMessage, override val actionLabel: String) :
    SnackbarVisuals {
    override val message = ""
    override val withDismissAction = true
    override val duration = SnackbarDuration.Long
}

/**
 * The app's one snackbar host, for every [Feedback] message: deletion and Add author failures stay
 * at the app root after the sheet, overlay or details that started them have left. Messages queue
 * and each waits for the app window to have focus. While a sheet, scanner or another app covers the
 * window, the host is removed, so its timer can't run out unseen; it restarts on return. [onAction]
 * handles Edit and Try again. Swipe sideways or the X dismisses.
 */
@Composable
internal fun FeedbackSnackbar(
    feedback: Feedback,
    onAction: (FeedbackMessage) -> Unit,
    modifier: Modifier = Modifier,
) {
    val host = remember { SnackbarHostState() }
    val window = LocalWindowInfo.current
    val dismissLabel = rememberUpdatedState(stringResource(R.string.feedback_dismiss))
    val currentOnAction = rememberUpdatedState(onAction)
    LaunchedEffect(feedback, host, window) {
        feedback.messages.collect { message ->
            snapshotFlow { window.isWindowFocused }.first { it }
            val result = host.showSnackbar(FeedbackVisuals(message, dismissLabel.value))
            if (result == SnackbarResult.ActionPerformed) currentOnAction.value(message)
        }
    }
    if (window.isWindowFocused)
        SnackbarHost(host, modifier) { data ->
            key(data) { FeedbackCard(data, (data.visuals as FeedbackVisuals).feedback) }
        }
}

@Composable
private fun FeedbackCard(data: SnackbarData, message: FeedbackMessage) {
    val c = GohoTheme.colors
    val reduced = rememberReducedMotion()
    val config = LocalConfiguration.current
    val expanded = config.fontScale >= 1.3f || config.screenWidthDp < GohoSpacing.compactWidth.value
    val density = LocalDensity.current
    val dismissDistance = with(density) { GohoSpacing.snackbarDismissDistance.toPx() }
    val dismissVelocity = GohoPhotoMotion.DISMISS_VELOCITY_DP * density.density
    var width by remember { mutableIntStateOf(0) }
    var offset by remember { mutableFloatStateOf(0f) }
    val copy = feedbackCopy(message)
    Row(
        Modifier.padding(horizontal = GohoSpacing.screenMargin)
            .fillMaxWidth()
            .onSizeChanged { width = it.width }
            .graphicsLayer {
                translationX = offset
                alpha = 1f - (abs(offset) / width.coerceAtLeast(1)).coerceIn(0f, 1f)
            }
            .draggable(
                rememberDraggableState { offset += it },
                Orientation.Horizontal,
                onDragStopped = { velocity ->
                    if (abs(offset) > dismissDistance || abs(velocity) > dismissVelocity) {
                        val direction = if (offset != 0f) sign(offset) else sign(velocity)
                        animate(
                            offset,
                            direction * width,
                            animationSpec =
                                if (reduced) snap() else tween(GohoMotion.SNACKBAR_SWIPE_MILLIS),
                        ) { value, _ ->
                            offset = value
                        }
                        data.dismiss()
                    } else
                        animate(
                            offset,
                            0f,
                            animationSpec = if (reduced) snap() else GohoPhotoMotion.settle,
                        ) { value, _ ->
                            offset = value
                        }
                },
            )
            .shadow(
                GohoSpacing.snackbarElevation,
                GohoShapes.card,
                ambientColor = c.shadow,
                spotColor = c.shadow,
            )
            .clip(GohoShapes.card)
            .background(c.surface)
            .border(GohoSpacing.hairline, c.outline, GohoShapes.card)
            .padding(
                start = GohoSpacing.snackbarStart,
                end = GohoSpacing.snackbarEnd,
                top = GohoSpacing.snackbarVertical,
                bottom = GohoSpacing.snackbarVertical,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(GohoSpacing.snackbarIconSlot)
                .clip(GohoShapes.pill)
                .background(copy.container),
            contentAlignment = Alignment.Center,
        ) {
            copy.icon(Modifier.size(GohoSpacing.buttonIcon), copy.tint)
        }
        Spacer(Modifier.width(GohoSpacing.contentGap))
        Column(Modifier.weight(1f)) {
            Text(copy.title, style = GohoTheme.type.feedbackTitle, color = c.textPrimary)
            Text(copy.detail, style = GohoTheme.type.meta, color = c.textTertiary)
            if (expanded && copy.action != null)
                TextAction(
                    copy.action,
                    data::performAction,
                    Modifier.offset(x = -GohoSpacing.textActionHorizontal),
                )
        }
        if (!expanded && copy.action != null) TextAction(copy.action, data::performAction)
        DismissButton(stringResource(R.string.feedback_dismiss), data::dismiss)
    }
}

/** A quiet X: an 18dp glyph in `textTertiary`, centred in a 44dp touch target. */
@Composable
private fun DismissButton(label: String, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    Box(
        Modifier.size(GohoSpacing.headerHeight)
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.pressFeedback { progress }) {
            CompositionLocalProvider(LocalContentColor provides GohoTheme.colors.textTertiary) {
                CloseIcon(GohoSpacing.buttonIcon)
            }
        }
    }
}

private class FeedbackCopy(
    val title: String,
    val detail: String,
    val action: String?,
    val container: Color,
    val tint: Color,
    val icon: @Composable (Modifier, Color) -> Unit,
)

/**
 * Deletion failures show the red trash; author failures the orange warning, or no Wi-Fi when the
 * request got no answer and the device has no network.
 */
@Composable
private fun feedbackCopy(message: FeedbackMessage): FeedbackCopy {
    val c = GohoTheme.colors
    val warning = painterResource(R.drawable.ic_tag_failed)
    val offline = painterResource(R.drawable.ic_wifi_off)
    fun icon(painter: Painter) =
        @Composable { modifier: Modifier, tint: Color ->
            Icon(painter, contentDescription = null, tint = tint, modifier = modifier)
        }
    return when (message) {
        is FeedbackMessage.DeletionFailed ->
            FeedbackCopy(
                title =
                    stringResource(
                        when (message.kind) {
                            DeletionKind.Book -> R.string.feedback_book_delete_failed
                            DeletionKind.Receipt -> R.string.feedback_receipt_delete_failed
                            DeletionKind.BookUpload,
                            DeletionKind.ReceiptUpload -> R.string.feedback_scan_delete_failed
                        }
                    ),
                detail = stringResource(R.string.feedback_delete_failed_detail),
                action = null,
                container = c.dangerContainer,
                tint = c.onDangerContainer,
                icon = { modifier, tint -> TrashIcon(modifier, tint) },
            )
        is FeedbackMessage.AuthorConflict ->
            FeedbackCopy(
                title = stringResource(R.string.feedback_author_conflict),
                detail = stringResource(R.string.feedback_author_conflict_detail),
                action = stringResource(R.string.feedback_edit),
                container = c.attentionContainer,
                tint = c.attention,
                icon = icon(warning),
            )
        is FeedbackMessage.AuthorFailed ->
            FeedbackCopy(
                title = stringResource(R.string.feedback_author_failed),
                detail =
                    stringResource(
                        if (message.offline) R.string.feedback_offline_detail
                        else R.string.feedback_hiccup_detail
                    ),
                action = stringResource(R.string.feedback_try_again),
                container = c.attentionContainer,
                tint = c.attention,
                icon = icon(if (message.offline) offline else warning),
            )
    }
}
