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

/** A failed cover upload's options sheet: retry its saved scan, or discard it from this device. */
@Composable
internal fun BookUploadOptions(
    upload: LocalUpload,
    now: Instant,
    zone: ZoneId,
    locale: Locale,
    covers: ThumbnailCache,
    onRetry: () -> Unit,
    onDiscard: () -> Boolean,
    onDismiss: () -> Unit,
) {
    val config = LocalConfiguration.current
    OptionsSheet(
        title = stringResource(R.string.upload_options),
        deleteLabel = stringResource(R.string.upload_discard),
        deletingLabel = stringResource(R.string.upload_discarding),
        deleteFailedMessage = stringResource(R.string.upload_discard_failed),
        cancelLabel = stringResource(R.string.book_cancel),
        header = {
            BookSummary(
                entry = BookListEntry.Local(upload),
                now = now,
                zone = zone,
                locale = locale,
                expanded =
                    config.fontScale >= 1.3f ||
                        config.screenWidthDp < GohoSpacing.compactWidth.value,
                covers = covers,
            )
        },
        onDelete = onDiscard,
        onDismiss = onDismiss,
        retryLabel = stringResource(R.string.upload_retry),
        onRetry = onRetry,
    )
}
