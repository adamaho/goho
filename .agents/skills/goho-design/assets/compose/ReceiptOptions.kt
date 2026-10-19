package com.adamaho.goho.ui.main

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import com.adamaho.goho.theme.GohoSpacing
import com.adamaho.goho.ui.components.ReceiptOptionsSheet
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
    ReceiptOptionsSheet(
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
