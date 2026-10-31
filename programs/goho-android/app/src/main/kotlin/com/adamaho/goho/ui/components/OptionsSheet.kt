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
import androidx.compose.ui.semantics.*
import com.adamaho.goho.theme.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** The sheet's one visible pane: its menu, the delete confirmation, or an [OptionsForm]. */
private enum class OptionsPane {
    Menu,
    Delete,
    Form,
}

/**
 * A menu action above delete that swaps the sheet to its own pane, as Add author does. [label]
 * names the action and the pane; [content] receives the sheet's animated close.
 */
internal class OptionsForm(
    val label: String,
    val icon: @Composable (Modifier, Color) -> Unit,
    val content: @Composable (close: () -> Unit) -> Unit,
)

/**
 * One item's header stays mounted while the actions below change inside the same sheet. The caller
 * supplies the header and the item's copy: [title] names the menu pane, and [deleteLabel] names the
 * menu action, the confirmation pane and its button. [onDelete] accepts a deletion immediately; its
 * request and any later failure belong to the activity. The sheet only awaits its own exit. A
 * [form] adds its action above delete; [openForm] opens the sheet directly at that pane.
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
    form: OptionsForm? = null,
    openForm: Boolean = false,
) {
    val c = GohoTheme.colors
    val reduced = rememberReducedMotion()
    var pane by rememberSaveable {
        mutableStateOf(if (openForm && form != null) OptionsPane.Form else OptionsPane.Menu)
    }
    var deleting by remember { mutableStateOf(false) }
    var deleted by remember { mutableStateOf(false) }
    var failed by rememberSaveable { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val state =
        rememberModalBottomSheetState(
            skipPartiallyExpanded = true,
            confirmValueChange = { !deleting || deleted },
        )
    val paneTitle =
        when (pane) {
            OptionsPane.Menu -> title
            OptionsPane.Delete -> deleteLabel
            OptionsPane.Form -> form?.label ?: title
        }
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
                .windowInsetsPadding(WindowInsets.navigationBars.union(WindowInsets.ime))
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
                .semantics { this.paneTitle = paneTitle }
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
                targetState = pane,
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
            ) { shown ->
                if (shown == OptionsPane.Form && form != null) form.content(::dismiss)
                else if (shown != OptionsPane.Delete) {
                    Column(Modifier.fillMaxWidth()) {
                        Box(
                            Modifier.fillMaxWidth()
                                .padding(horizontal = GohoSpacing.sheetPadding)
                                .height(GohoSpacing.hairline)
                                .background(c.divider)
                        )
                        Spacer(Modifier.height(GohoSpacing.sheetMenuTop))
                        val enabled = pane == OptionsPane.Menu
                        form?.let {
                            OptionsMenuItem(it.label, c.textPrimary, it.icon, enabled) {
                                pane = OptionsPane.Form
                            }
                        }
                        OptionsMenuItem(
                            deleteLabel,
                            c.onDangerContainer,
                            { modifier, color -> TrashIcon(modifier, color) },
                            enabled,
                        ) {
                            pane = OptionsPane.Delete
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

/** A sheet menu row: 56dp, icon and label in [color], pressed fill and no ripple. */
@Composable
private fun OptionsMenuItem(
    label: String,
    color: Color,
    icon: @Composable (Modifier, Color) -> Unit,
    enabled: Boolean,
    onClick: () -> Unit,
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
        icon(Modifier.size(GohoSpacing.sheetActionIcon), color)
        Text(label, style = GohoTheme.type.rowTitle, color = color)
    }
}
