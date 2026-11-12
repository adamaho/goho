package com.adamaho.goho.ui.main

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.ui.components.OptionsSheet

/**
 * A saved recipe's or failed import's options sheet, headed by its display-only Recipes row
 * summary: Delete recipe or Delete import, then the shared confirmation. [onDelete] returns whether
 * the deletion was accepted; its request belongs to the activity.
 */
@Composable
internal fun RecipeOptions(
    entry: RecipeListEntry,
    thumbnails: ThumbnailCache,
    onDelete: suspend () -> Boolean,
    onDismiss: () -> Unit,
    onDeleted: () -> Unit = onDismiss,
) {
    val import = entry !is RecipeListEntry.Saved
    OptionsSheet(
        title =
            stringResource(if (import) R.string.recipe_import_options else R.string.recipe_options),
        deleteLabel =
            stringResource(if (import) R.string.recipe_import_delete else R.string.recipe_delete),
        deletingLabel = stringResource(R.string.recipe_deleting),
        deleteFailedMessage =
            stringResource(
                if (import) R.string.recipe_import_delete_failed else R.string.recipe_delete_failed
            ),
        cancelLabel = stringResource(R.string.recipe_cancel),
        header = { RecipeEntrySummary(entry, thumbnails) },
        onDelete = onDelete,
        onDismiss = onDismiss,
        onDeleted = onDeleted,
    )
}
