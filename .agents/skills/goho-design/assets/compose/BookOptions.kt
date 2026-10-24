package com.adamaho.goho.ui.main

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Book
import com.adamaho.goho.theme.GohoSpacing
import com.adamaho.goho.ui.components.OptionsSheet
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

/** A saved book's options sheet, headed by its Books row summary with a plain cover. */
@Composable
internal fun BookOptions(
    book: Book,
    now: Instant,
    zone: ZoneId,
    locale: Locale,
    covers: ThumbnailCache,
    onDelete: suspend () -> Boolean,
    onDismiss: () -> Unit,
) {
    val config = LocalConfiguration.current
    OptionsSheet(
        title = stringResource(R.string.book_options),
        deleteLabel = stringResource(R.string.book_delete),
        deletingLabel = stringResource(R.string.book_deleting),
        deleteFailedMessage = stringResource(R.string.book_delete_failed),
        cancelLabel = stringResource(R.string.book_cancel),
        header = {
            BookSummary(
                entry = BookListEntry.Saved(book),
                now = now,
                zone = zone,
                locale = locale,
                expanded =
                    config.fontScale >= 1.3f ||
                        config.screenWidthDp < GohoSpacing.compactWidth.value,
                covers = covers,
            )
        },
        onDelete = onDelete,
        onDismiss = onDismiss,
    )
}
