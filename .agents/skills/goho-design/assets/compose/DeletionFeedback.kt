package com.adamaho.goho.ui.components

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.theme.GohoShapes
import com.adamaho.goho.theme.GohoSpacing
import com.adamaho.goho.theme.GohoTheme
import com.adamaho.goho.ui.main.DeletionKind
import com.adamaho.goho.ui.main.PendingDeletions
import kotlinx.coroutines.flow.first

/** Errors stay at the app root after the originating sheet, details or section has left. */
@Composable
internal fun DeletionFeedback(deletions: PendingDeletions, modifier: Modifier = Modifier) {
    val host = remember { SnackbarHostState() }
    val window = LocalWindowInfo.current
    val bookError = stringResource(R.string.book_delete_unconfirmed)
    val scanError = stringResource(R.string.scan_delete_unconfirmed)
    val receiptError = stringResource(R.string.receipt_delete_unconfirmed)
    val dismiss = stringResource(R.string.deletion_dismiss)
    LaunchedEffect(deletions, bookError, scanError, receiptError, dismiss, window) {
        deletions.errors.collect { kind ->
            snapshotFlow { window.isWindowFocused }.first { it }
            host.showSnackbar(
                message =
                    when (kind) {
                        DeletionKind.Book -> bookError
                        DeletionKind.Receipt -> receiptError
                        DeletionKind.BookUpload,
                        DeletionKind.ReceiptUpload -> scanError
                    },
                actionLabel = dismiss,
                duration = SnackbarDuration.Long,
            )
        }
    }
    val c = GohoTheme.colors
    // A sheet or scanner owns another window: keep the message until it can be seen and used.
    if (window.isWindowFocused)
        SnackbarHost(host, modifier) { data ->
            Snackbar(
                modifier = Modifier.padding(horizontal = GohoSpacing.screenMargin),
                shape = GohoShapes.card,
                containerColor = c.surface,
                contentColor = c.textPrimary,
                action = {
                    ActionButton(
                        dismiss,
                        onClick = data::dismiss,
                        variant = 2,
                        color = ButtonColor.Grey,
                        size = ButtonSize.Small,
                    )
                },
            ) {
                Text(data.visuals.message, style = GohoTheme.type.body, color = c.textPrimary)
            }
        }
}
