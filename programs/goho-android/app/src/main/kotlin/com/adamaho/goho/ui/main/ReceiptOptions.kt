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
) {
    val config = LocalConfiguration.current
    OptionsSheet(
        title = stringResource(R.string.receipt_options),
        deleteLabel = stringResource(R.string.receipt_delete),
        deletingLabel = stringResource(R.string.receipt_deleting),
        deleteFailedMessage = stringResource(R.string.receipt_delete_failed),
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
    )
}
