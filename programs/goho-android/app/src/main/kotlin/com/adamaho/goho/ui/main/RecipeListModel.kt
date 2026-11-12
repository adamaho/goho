package com.adamaho.goho.ui.main

import androidx.annotation.StringRes
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Recipe
import com.adamaho.goho.api.generated.model.RecipeSummary
import com.adamaho.goho.api.generated.model.RecipeUpload
import com.adamaho.goho.api.generated.model.RecipeUploadFailureCode
import com.adamaho.goho.api.generated.model.RecipeUploadStatus
import java.util.UUID

data class RecipeListState(
    val recipes: List<RecipeSummary> = emptyList(),
    val uploads: List<RecipeUpload> = emptyList(),
    val hasLoaded: Boolean = false,
    val loading: Boolean = false,
    val error: Boolean = false,
    val refreshing: Boolean = false,
    val refreshError: Boolean = false,
)

/** One Recipes row: a saved recipe, or a link import that has not produced one. */
sealed interface RecipeListEntry {
    val key: String

    data class Saved(val recipe: RecipeSummary) : RecipeListEntry {
        override val key = "recipe:${recipe.id}"
    }

    /** [failure] is null while the import is queued or processing. */
    data class Import(
        val uploadId: UUID,
        val url: String,
        val failed: Boolean,
        val failure: RecipeUploadFailureCode?,
    ) : RecipeListEntry {
        override val key = "upload:$uploadId"
    }
}

val RecipeListEntry.needsAttention: Boolean
    get() = this is RecipeListEntry.Import && failed

/**
 * Unfinished and failed imports come first in server order, newest first, then saved recipes in
 * server order, which is already A–Z by title ignoring case, newest first among equal titles. A
 * succeeded import is shown only as its recipe.
 */
fun recipeListEntries(
    recipes: List<RecipeSummary>,
    uploads: List<RecipeUpload>,
): List<RecipeListEntry> =
    uploads
        .filter { it.status != RecipeUploadStatus.succeeded }
        .map {
            RecipeListEntry.Import(
                uploadId = it.id,
                url = it.source.url,
                failed = it.status == RecipeUploadStatus.failed,
                failure = it.failureCode,
            )
        } + recipes.map(RecipeListEntry::Saved)

/** The short failed-import tag, two words at most; unexpected failures read “Not processed”. */
@StringRes
internal fun recipeFailureLabel(code: RecipeUploadFailureCode?): Int =
    when (code) {
        RecipeUploadFailureCode.page_unavailable -> R.string.recipe_failed_page_unavailable
        RecipeUploadFailureCode.no_recipe_found -> R.string.recipe_failed_no_recipe
        RecipeUploadFailureCode.ambiguous_recipe -> R.string.recipe_failed_ambiguous
        RecipeUploadFailureCode.incomplete_recipe -> R.string.recipe_failed_incomplete
        RecipeUploadFailureCode.processing_failed,
        RecipeUploadFailureCode.recipe_creation_failed,
        RecipeUploadFailureCode.internal_error,
        null -> R.string.not_processed
    }

/** A recipe details request's outcome; [Missing] is only the API's own `RecipeNotFound`. */
sealed interface RecipeLoad {
    data class Loaded(val recipe: Recipe) : RecipeLoad

    data object Missing : RecipeLoad

    data object Failed : RecipeLoad
}
