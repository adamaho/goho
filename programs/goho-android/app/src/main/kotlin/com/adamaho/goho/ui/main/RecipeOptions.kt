package com.adamaho.goho.ui.main

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.ui.components.OptionsAction
import com.adamaho.goho.ui.components.OptionsSheet

/**
 * A saved recipe's or failed import's options sheet, headed by its display-only Recipes row
 * summary: Share recipe and Copy recipe for a saved recipe when [onShare] and [onCopy] are set,
 * then Delete recipe or Delete import and the shared confirmation. [onDelete] returns whether the
 * deletion was accepted; its request belongs to the activity. [onShare] and [onCopy] run in the
 * sheet's scope, one at a time, so closing the sheet cancels them; the sheet closes once one
 * returns.
 */
@Composable
internal fun RecipeOptions(
    entry: RecipeListEntry,
    thumbnails: ThumbnailCache,
    onDelete: suspend () -> Boolean,
    onDismiss: () -> Unit,
    onDeleted: () -> Unit = onDismiss,
    onShare: (suspend () -> Unit)? = null,
    onCopy: (suspend () -> Unit)? = null,
) {
    val import = entry !is RecipeListEntry.Saved
    val actions =
        if (import) emptyList()
        else
            listOfNotNull(
                onShare?.let {
                    recipeAction(
                        R.drawable.ic_share,
                        R.string.recipe_share,
                        R.string.recipe_sharing,
                        it,
                    )
                },
                onCopy?.let {
                    recipeAction(
                        R.drawable.ic_copy,
                        R.string.recipe_copy,
                        R.string.recipe_copying,
                        it,
                    )
                },
            )
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
        actions = actions,
    )
}

/** One saved-recipe sheet action with its 22dp icon, in the row's colour. */
@Composable
private fun recipeAction(
    @DrawableRes icon: Int,
    @StringRes label: Int,
    @StringRes busyLabel: Int,
    run: suspend () -> Unit,
): OptionsAction {
    val painter = painterResource(icon)
    return OptionsAction(
        label = stringResource(label),
        busyLabel = stringResource(busyLabel),
        icon = { modifier, color ->
            Icon(painter, contentDescription = null, tint = color, modifier = modifier)
        },
        run = run,
    )
}
