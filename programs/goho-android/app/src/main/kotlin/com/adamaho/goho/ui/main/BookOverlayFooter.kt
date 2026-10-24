package com.adamaho.goho.ui.main

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*

/**
 * The book overlay's fixed actions. Delete book swaps in place for the red confirmation and Cancel,
 * with no heading, as in the receipt options sheet. Both are disabled while the request is pending,
 * and a failure shows its message above them.
 */
@Composable
internal fun BookOverlayFooter(
    deletion: BookDeletion,
    onDeleteClick: () -> Unit,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = GohoTheme.colors
    val reduced = rememberReducedMotion()
    AnimatedContent(
        targetState = deletion != BookDeletion.Idle,
        modifier =
            modifier
                .fillMaxWidth()
                .padding(horizontal = GohoSpacing.screenMargin)
                .padding(top = GohoSpacing.previewFooterTop, bottom = GohoSpacing.fabBottom),
        contentAlignment = Alignment.BottomCenter,
        transitionSpec = {
            (fadeIn(
                    tween(
                        if (reduced) 0 else GohoMotion.SHEET_CONTENT_FADE_IN_MILLIS,
                        delayMillis = if (reduced) 0 else GohoMotion.SHEET_CONTENT_FADE_OUT_MILLIS,
                    )
                ) togetherWith
                    fadeOut(tween(if (reduced) 0 else GohoMotion.SHEET_CONTENT_FADE_OUT_MILLIS)))
                .using(
                    SizeTransform { _, _ ->
                        tween(
                            if (reduced) 0 else GohoMotion.SHEET_CONTENT_MILLIS,
                            easing = FastOutSlowInEasing,
                        )
                    }
                )
        },
        label = "Book overlay actions",
    ) { confirming ->
        if (!confirming)
            ActionButton(
                stringResource(R.string.book_delete),
                onDeleteClick,
                variant = 2,
                color = ButtonColor.Grey,
                contentColor = c.onDangerContainer,
                icon = { TrashIcon(Modifier.size(GohoSpacing.buttonIcon)) },
            )
        else {
            val deleting = deletion == BookDeletion.Deleting
            val cancelFocus = remember { FocusRequester() }
            LaunchedEffect(Unit) { cancelFocus.requestFocus() }
            Column(Modifier.fillMaxWidth()) {
                if (deletion == BookDeletion.Failed) {
                    Text(
                        stringResource(R.string.book_delete_failed),
                        style = GohoTheme.type.body,
                        color = c.onDangerContainer,
                        textAlign = TextAlign.Center,
                        modifier =
                            Modifier.fillMaxWidth().semantics {
                                liveRegion = LiveRegionMode.Polite
                            },
                    )
                    Spacer(Modifier.height(GohoSpacing.sheetButtonsTop))
                }
                val label = stringResource(R.string.book_delete)
                val pendingLabel = stringResource(R.string.book_deleting)
                ActionButton(
                    if (deleting) pendingLabel else label,
                    onConfirm,
                    enabled = !deleting,
                    variant = 1,
                    color = ButtonColor.Red,
                    reserveSpaceFor = listOf(label, pendingLabel),
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                Spacer(Modifier.height(GohoSpacing.buttonGap))
                ActionButton(
                    stringResource(R.string.book_cancel),
                    onCancel,
                    variant = 2,
                    color = ButtonColor.Grey,
                    enabled = !deleting,
                    modifier = Modifier.focusRequester(cancelFocus),
                )
            }
        }
    }
}
