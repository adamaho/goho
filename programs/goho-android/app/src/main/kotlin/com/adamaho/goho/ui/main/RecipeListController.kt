package com.adamaho.goho.ui.main

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import com.adamaho.goho.api.generated.RecipeUploadsApi
import com.adamaho.goho.api.generated.RecipesApi
import com.adamaho.goho.api.generated.model.RecipeImageNotFound
import com.adamaho.goho.api.generated.model.RecipeNotFound
import com.adamaho.goho.api.generated.model.RecipeUploadStatus
import com.adamaho.goho.api.isNotFound
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Read-only Recipes data owned by the activity, independent of receipts and books. Recipes and
 * their link imports refresh together; a refresh joins or queues behind one already running, and a
 * failure keeps the cached list. Nothing changes the list locally yet, so a listing is never stale
 * against a local change.
 */
internal class RecipeListController(
    private val scope: CoroutineScope,
    private val recipesApi: RecipesApi,
    private val uploadsApi: RecipeUploadsApi,
) {
    var state by mutableStateOf(RecipeListState())
        private set

    private var refreshAfterCurrent = false

    /** Keeps loaded row photos across section switches; only recipes with a photo request one. */
    val thumbnails = ThumbnailCache(::loadImage)

    fun refresh(userInitiated: Boolean = false) {
        if (state.loading) {
            if (userInitiated) {
                // Join the in-flight request instead of scheduling a duplicate pull refresh.
                state = state.copy(refreshing = true, refreshError = false)
            } else refreshAfterCurrent = true
            return
        }

        state = state.copy(loading = true, refreshing = userInitiated, refreshError = false)
        scope.launch {
            try {
                // An import succeeds in the same transaction that saves its recipe, so listing
                // imports first guarantees every succeeded import's recipe is in the following
                // list.
                val uploadsResponse = uploadsApi.recipeUploadsList()
                val recipesResponse = recipesApi.recipesList()
                val uploads = uploadsResponse.body()?.data
                val recipes = recipesResponse.body()?.data
                state =
                    if (
                        uploadsResponse.isSuccessful &&
                            recipesResponse.isSuccessful &&
                            uploads != null &&
                            recipes != null
                    )
                        RecipeListState(recipes = recipes, uploads = uploads, hasLoaded = true)
                    else failed()
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                Log.w("GohoRecipes", "Recipe listing failed", error)
                state = failed()
            } finally {
                if (refreshAfterCurrent) {
                    refreshAfterCurrent = false
                    refresh(userInitiated = state.refreshing)
                }
            }
        }
    }

    /** Polls while an import is queued or processing. Run it only while the activity is started. */
    suspend fun pollPendingUploads() {
        snapshotFlow {
            state.uploads.any {
                it.status == RecipeUploadStatus.queued || it.status == RecipeUploadStatus.processing
            }
        }
            .collectLatest { hasPendingUploads ->
                if (hasPendingUploads) {
                    while (true) {
                        delay(5_000)
                        if (!state.loading) refresh()
                    }
                }
            }
    }

    /** The full recipe for details. Only the API's own `RecipeNotFound` 404 counts as missing. */
    suspend fun load(recipeId: String): RecipeLoad =
        try {
            val response = recipesApi.recipesGet(recipeId)
            when {
                response.isSuccessful ->
                    response.body()?.data?.let { RecipeLoad.Loaded(it) } ?: RecipeLoad.Failed
                response.isNotFound(RecipeNotFound.serializer()) -> RecipeLoad.Missing
                else -> {
                    Log.w("GohoRecipes", "Recipe request failed: ${response.code()}")
                    RecipeLoad.Failed
                }
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w("GohoRecipes", "Recipe failed to load", error)
            RecipeLoad.Failed
        }

    /**
     * A recipe's photo bytes, or null without one. A missing photo (`RecipeImageNotFound`) is
     * expected; other failures are logged. Call it only for recipes with `hasImage`.
     */
    suspend fun loadImage(recipeId: String): ByteArray? =
        try {
            val response = recipesApi.recipesGetImage(recipeId)
            when {
                response.isSuccessful ->
                    withContext(Dispatchers.IO) { response.body()?.use { it.bytes() } }
                response.isNotFound(RecipeImageNotFound.serializer()) -> null
                else -> {
                    Log.w("GohoRecipes", "Recipe photo request failed: ${response.code()}")
                    null
                }
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w("GohoRecipes", "Recipe photo failed to load", error)
            null
        }

    private fun failed() =
        state.copy(
            loading = false,
            refreshing = false,
            error = !state.hasLoaded,
            refreshError = state.hasLoaded,
        )
}
