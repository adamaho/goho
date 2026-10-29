package com.adamaho.goho.ui.main

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.theme.GohoSpacing
import com.adamaho.goho.ui.components.OptionsSheet
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

@Composable
internal fun ReceiptOptions(
    entry: ReceiptListEntry,
    locale: Locale,
    now: Instant,
    zone: ZoneId,
    thumbnail: @Composable () -> Unit,
    onDelete: suspend () -> Boolean,
    onDismiss: () -> Unit,
    onDeleted: () -> Unit = onDismiss,
    onRetry: () -> Unit = {},
) {
    val config = LocalConfiguration.current
    // A scan the server never accepted is only on this device: retry it or discard it.
    val local = entry.status == ReceiptListStatus.UploadFailed
    OptionsSheet(
        title = stringResource(if (local) R.string.upload_options else R.string.receipt_options),
        deleteLabel =
            stringResource(if (local) R.string.upload_discard else R.string.receipt_delete),
        deletingLabel =
            stringResource(if (local) R.string.upload_discarding else R.string.receipt_deleting),
        deleteFailedMessage =
            stringResource(
                if (local) R.string.upload_discard_failed else R.string.receipt_delete_failed
            ),
        cancelLabel = stringResource(R.string.receipt_cancel),
        header = {
            ReceiptSummary(
                entry = entry,
                now = now,
                locale = locale,
                zone = zone,
                expanded =
                    config.fontScale >= 1.3f ||
                        config.screenWidthDp < GohoSpacing.compactWidth.value,
                thumbnail = thumbnail,
            )
        },
        onDelete = onDelete,
        onDismiss = onDismiss,
        onDeleted = onDeleted,
        retryLabel = if (local) stringResource(R.string.upload_retry) else null,
        onRetry = onRetry.takeIf { local },
    )
}
