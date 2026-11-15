package com.adamaho.goho.ui.main

import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.ui.components.OptionsAction
import com.adamaho.goho.ui.components.OptionsSheet

/**
 * A saved recipe's or failed import's options sheet, headed by its display-only Recipes row
 * summary: Copy recipe for a saved recipe when [onCopy] is set, then Delete recipe or Delete import
 * and the shared confirmation. [onDelete] returns whether the deletion was accepted; its request
 * belongs to the activity. [onCopy] runs in the sheet's scope, so closing the sheet cancels it; the
 * sheet closes once it returns.
 */
@Composable
internal fun RecipeOptions(
    entry: RecipeListEntry,
    thumbnails: ThumbnailCache,
    onDelete: suspend () -> Boolean,
    onDismiss: () -> Unit,
    onDeleted: () -> Unit = onDismiss,
    onCopy: (suspend () -> Unit)? = null,
) {
    val import = entry !is RecipeListEntry.Saved
    val copy =
        onCopy
            ?.takeIf { !import }
            ?.let { run ->
                val icon = painterResource(R.drawable.ic_copy)
                OptionsAction(
                    label = stringResource(R.string.recipe_copy),
                    busyLabel = stringResource(R.string.recipe_copying),
                    icon = { modifier, color ->
                        Icon(icon, contentDescription = null, tint = color, modifier = modifier)
                    },
                    run = run,
                )
            }
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
        action = copy,
    )
}
