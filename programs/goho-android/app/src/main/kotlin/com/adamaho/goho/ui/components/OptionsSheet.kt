package com.adamaho.goho.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * One item's header stays mounted while the actions below change inside the same sheet. The caller
 * supplies the header and the item's copy: [title] names the menu pane, and [deleteLabel] names the
 * menu action, the confirmation pane and its button. [onDelete] accepts a deletion immediately; its
 * request and any later failure belong to the activity. The sheet only awaits its own exit. An
 * [onRetry] action, listed above delete, starts at once and closes the sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun OptionsSheet(
    title: String,
    deleteLabel: String,
    deletingLabel: String,
    deleteFailedMessage: String,
    cancelLabel: String,
    header: @Composable () -> Unit,
    onDelete: suspend () -> Boolean,
    onDismiss: () -> Unit,
    onDeleted: () -> Unit = onDismiss,
    retryLabel: String? = null,
    onRetry: (() -> Unit)? = null,
) {
    val c = GohoTheme.colors
    val reduced = rememberReducedMotion()
    var confirming by rememberSaveable { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var deleted by remember { mutableStateOf(false) }
    var failed by rememberSaveable { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val state =
        rememberModalBottomSheetState(
            skipPartiallyExpanded = true,
            confirmValueChange = { !deleting || deleted },
        )
    val pane = if (confirming) deleteLabel else title
    fun dismiss() {
        if (!deleting)
            scope.launch {
                state.hide()
                onDismiss()
            }
    }
    ModalBottomSheet(
        onDismissRequest = { if (!deleting) onDismiss() },
        sheetState = state,
        containerColor = Color.Transparent,
        scrimColor = c.scrim,
        tonalElevation = GohoSpacing.flatElevation,
        dragHandle = null,
        sheetGesturesEnabled = !deleting,
        contentWindowInsets = { WindowInsets.safeDrawing.only(WindowInsetsSides.Top) },
        properties = ModalBottomSheetProperties(shouldDismissOnBackPress = !deleting),
    ) {
        Column(
            Modifier.fillMaxWidth()
                .navigationBarsPadding()
                .padding(GohoSpacing.sheetInset)
                .shadow(
                    GohoSpacing.sheetElevation,
                    GohoShapes.sheet,
                    ambientColor = c.shadow,
                    spotColor = c.shadow,
                )
                .clip(GohoShapes.sheet)
                .background(c.sheet)
                .verticalScroll(rememberScrollState())
                .semantics { paneTitle = pane }
        ) {
            Box(
                Modifier.align(Alignment.CenterHorizontally)
                    .padding(top = GohoSpacing.sheetInset)
                    .size(GohoSpacing.sheetGrabberWidth, GohoSpacing.sheetGrabberHeight)
                    .clip(GohoShapes.pill)
                    .background(c.grabber)
            )
            Box(
                Modifier.fillMaxWidth()
                    .padding(horizontal = GohoSpacing.sheetPadding)
                    .padding(top = GohoSpacing.sheetHeaderTop)
            ) {
                header()
            }
            Spacer(Modifier.height(GohoSpacing.sheetContentTop))
            AnimatedContent(
                targetState = confirming,
                contentAlignment = Alignment.TopStart,
                transitionSpec = {
                    (fadeIn(
                            tween(
                                if (reduced) 0 else GohoMotion.SHEET_CONTENT_FADE_IN_MILLIS,
                                delayMillis =
                                    if (reduced) 0 else GohoMotion.SHEET_CONTENT_FADE_OUT_MILLIS,
                            )
                        ) togetherWith
                            fadeOut(
                                tween(if (reduced) 0 else GohoMotion.SHEET_CONTENT_FADE_OUT_MILLIS)
                            ))
                        .using(
                            SizeTransform { _, _ ->
                                tween(
                                    if (reduced) 0 else GohoMotion.SHEET_CONTENT_MILLIS,
                                    easing = FastOutSlowInEasing,
                                )
                            }
                        )
                },
                label = "Options sheet content",
            ) { showConfirmation ->
                if (!showConfirmation) {
                    Column(Modifier.fillMaxWidth()) {
                        Box(
                            Modifier.fillMaxWidth()
                                .padding(horizontal = GohoSpacing.sheetPadding)
                                .height(GohoSpacing.hairline)
                                .background(c.divider)
                        )
                        Spacer(Modifier.height(GohoSpacing.sheetMenuTop))
                        if (retryLabel != null && onRetry != null)
                            SheetMenuItem(
                                retryLabel,
                                c.textPrimary,
                                enabled = !confirming,
                                onClick = {
                                    onRetry()
                                    dismiss()
                                },
                            ) {
                                Icon(
                                    painterResource(R.drawable.ic_retry),
                                    contentDescription = null,
                                    tint = c.textPrimary,
                                    modifier = Modifier.size(GohoSpacing.sheetActionIcon),
                                )
                            }
                        SheetMenuItem(
                            deleteLabel,
                            c.onDangerContainer,
                            enabled = !confirming,
                            onClick = { confirming = true },
                        ) {
                            TrashIcon(
                                Modifier.size(GohoSpacing.sheetActionIcon),
                                c.onDangerContainer,
                            )
                        }
                        Spacer(Modifier.height(GohoSpacing.sheetInset))
                    }
                } else {
                    val focus = remember { FocusRequester() }
                    LaunchedEffect(Unit) { focus.requestFocus() }
                    Column(
                        Modifier.fillMaxWidth()
                            .padding(horizontal = GohoSpacing.sheetPadding)
                            .padding(bottom = GohoSpacing.sheetPadding)
                    ) {
                        if (failed) {
                            Text(
                                deleteFailedMessage,
                                style = GohoTheme.type.body,
                                color = c.onDangerContainer,
                                modifier =
                                    Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                            )
                            Spacer(Modifier.height(GohoSpacing.sheetButtonsTop))
                        }
                        ActionButton(
                            if (deleting) deletingLabel else deleteLabel,
                            onClick = {
                                if (!deleting) {
                                    deleting = true
                                    failed = false
                                    scope.launch {
                                        val success =
                                            try {
                                                onDelete()
                                            } catch (error: Exception) {
                                                if (error is CancellationException) throw error
                                                false
                                            }
                                        if (success) {
                                            deleted = true
                                            state.hide()
                                            onDeleted()
                                        } else {
                                            deleting = false
                                            failed = true
                                        }
                                    }
                                }
                            },
                            enabled = !deleting,
                            variant = 1,
                            color = ButtonColor.Red,
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                        )
                        Spacer(Modifier.height(GohoSpacing.buttonGap))
                        ActionButton(
                            cancelLabel,
                            ::dismiss,
                            variant = 2,
                            color = ButtonColor.Grey,
                            enabled = !deleting,
                            modifier = Modifier.focusRequester(focus),
                        )
                    }
                }
            }
        }
    }
}

/** One menu row: a leading [icon] and [label] in [color], pressed without a ripple. */
@Composable
private fun SheetMenuItem(
    label: String,
    color: Color,
    enabled: Boolean,
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    Row(
        Modifier.fillMaxWidth()
            .background(
                lerp(
                    c.sheet,
                    if (c.isDark) c.surfaceMutedPressed else c.surfacePressed,
                    progress.coerceIn(0f, 1f),
                )
            )
            .clickable(
                interaction,
                indication = null,
                role = Role.Button,
                enabled = enabled,
                onClick = onClick,
            )
            .heightIn(min = GohoSpacing.sheetActionHeight)
            .padding(horizontal = GohoSpacing.sheetPadding, vertical = GohoSpacing.sheetInset),
        horizontalArrangement = Arrangement.spacedBy(GohoSpacing.sheetActionGap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        icon()
        Text(label, style = GohoTheme.type.rowTitle, color = color)
    }
}
