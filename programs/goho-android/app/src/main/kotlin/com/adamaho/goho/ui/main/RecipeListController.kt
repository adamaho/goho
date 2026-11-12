package com.adamaho.goho.ui.main

import android.content.ContentResolver
import android.graphics.Bitmap
import android.net.Uri
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.adamaho.goho.api.generated.RecipeUploadsApi
import com.adamaho.goho.api.generated.RecipesApi
import com.adamaho.goho.api.generated.model.CreateRecipeUploadRequest
import com.adamaho.goho.api.generated.model.RecipeImageNotFound
import com.adamaho.goho.api.generated.model.RecipeNotFound
import com.adamaho.goho.api.generated.model.RecipeSource
import com.adamaho.goho.api.generated.model.RecipeSourceKind
import com.adamaho.goho.api.generated.model.RecipeUpload
import com.adamaho.goho.api.generated.model.RecipeUploadNotFound
import com.adamaho.goho.api.generated.model.RecipeUploadStatus
import com.adamaho.goho.api.isNotFound
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException

/**
 * Recipes data owned by the activity, independent of receipts and books. Recipes and their link
 * imports refresh together; a refresh joins or queues behind one already running, and a failure
 * keeps the cached list. A refresh that began before an accepted link or a deletion never drops the
 * import, restores the deleted recipe or failed import, or downgrades a newer import status.
 *
 * Links being sent are kept apart from the server data as [adding] rows until the server answers,
 * and photos being sent as [photoUploads]. Requests belong to the activity's scope, so they outlive
 * the Add recipe sheet, sheets and details, and end with the activity; nothing is retried
 * automatically or kept across process death.
 */
internal class RecipeListController(
    private val scope: CoroutineScope,
    private val recipesApi: RecipesApi,
    private val uploadsApi: RecipeUploadsApi,
    private val deletions: PendingDeletions,
    private val feedback: Feedback,
    private val isOffline: () -> Boolean,
    private val contentResolver: ContentResolver,
) {
    var state by mutableStateOf(RecipeListState())
        private set

    /**
     * Recipes whose picked photo is being sent, each with that photo once decoded, for details to
     * show in place of the Add photo button.
     */
    var photoUploads by mutableStateOf(emptyMap<String, ImageBitmap?>())
        private set

    /**
     * Recipes given a photo from this device, so details already loaded without one show it. Kept
     * for the activity's life; the server's `hasImage` never goes back to false here.
     */
    var photosAdded by mutableStateOf(emptySet<String>())
        private set

    /** A link being sent: [known] holds the uploads listed when it was sent, if any had loaded. */
    private class Submission(val attempt: Long, val url: String, val known: Set<UUID>?) {
        /** Uploads listed while it was waiting, so a late answer can't restore one that's gone. */
        val seen = HashSet<UUID>()
    }

    /** Links waiting for the server's answer, newest first. */
    private var submissions by mutableStateOf(emptyList<Submission>())
    private var lastAttempt = 0L
    /** Uploads accepted while other links were waiting, so none of those claims them. */
    private val answered = HashSet<UUID>()

    private var refreshAfterCurrent = false
    /** Counts local changes that a listing started earlier would miss. */
    private var changeRevision = 0L

    /**
     * Pending deletions stay hidden, with the succeeded imports of a recipe being deleted, even
     * when an overlapping refresh still returns them.
     */
    val visibleState: RecipeListState
        get() =
            state.copy(
                recipes =
                    state.recipes.filterNot {
                        deletions.contains(DeletionKey(DeletionKind.Recipe, it.id))
                    },
                uploads =
                    state.uploads.filterNot {
                        deletions.contains(
                            DeletionKey(DeletionKind.RecipeUpload, it.id.toString())
                        ) ||
                            (it.status == RecipeUploadStatus.succeeded &&
                                it.recipeId?.let { id ->
                                    deletions.contains(DeletionKey(DeletionKind.Recipe, id))
                                } == true)
                    },
            )

    /**
     * Links still being sent, newest first, shown above the listed imports. A listing can include a
     * link's new import before its answer arrives; that import then stands in for the oldest
     * waiting send of the same link, so the link is shown once.
     */
    val adding: List<RecipeListEntry.Adding>
        get() {
            val claimed = HashSet<UUID>()
            return submissions
                .asReversed()
                .filter { submission ->
                    val known = submission.known ?: return@filter true
                    val match =
                        state.uploads.firstOrNull {
                            it.source.url == submission.url &&
                                it.id !in known &&
                                it.id !in answered &&
                                it.id !in claimed
                        }
                    if (match != null) claimed += match.id
                    match == null
                }
                .asReversed()
                .map { RecipeListEntry.Adding(it.attempt, it.url) }
        }

    /** Keeps loaded row photos across section switches; only recipes with a photo request one. */
    val thumbnails = ThumbnailCache(::decodeRecipeThumbnail, ::loadImage)

    fun refresh(userInitiated: Boolean = false) {
        if (state.loading) {
            if (userInitiated) {
                // Join the in-flight request instead of scheduling a duplicate pull refresh.
                state = state.copy(refreshing = true, refreshError = false)
            } else refreshAfterCurrent = true
            return
        }

        val revision = changeRevision
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
                    if (revision != changeRevision) reloadAfterChange()
                    else if (
                        uploadsResponse.isSuccessful &&
                            recipesResponse.isSuccessful &&
                            uploads != null &&
                            recipes != null
                    ) {
                        submissions.forEach { submission ->
                            uploads.mapTo(submission.seen) { it.id }
                        }
                        RecipeListState(recipes = recipes, uploads = uploads, hasLoaded = true)
                    } else failed()
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                Log.w("GohoRecipes", "Recipe listing failed", error)
                state = if (revision != changeRevision) reloadAfterChange() else failed()
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

    /**
     * Sends [url], already checked by [recipeLink], as a new import. It shows at once as an
     * [adding] row until the server answers. Only a 202 with an import counts as accepted: the
     * import replaces the row and the list refreshes. Anything else drops the row, refreshes in
     * case the server took it anyway, and reports through [feedback] with Try again. Each call is
     * its own attempt, so sending a link twice makes two imports, as the API does.
     */
    fun add(url: String) {
        val submission =
            Submission(
                attempt = ++lastAttempt,
                url = url,
                known = if (state.hasLoaded) state.uploads.mapTo(HashSet()) { it.id } else null,
            )
        submissions = listOf(submission) + submissions
        scope.launch {
            try {
                when (val sent = send(url)) {
                    is Sent.Accepted -> accept(submission, sent.upload)
                    is Sent.Refused -> {
                        feedback.send(
                            FeedbackMessage.RecipeImportFailed(
                                submission.attempt,
                                url,
                                offline = !sent.answered && isOffline(),
                            )
                        )
                        refresh()
                    }
                }
            } finally {
                // Accepted, refused or cancelled, this attempt's row goes in the same frame.
                submissions = submissions.filterNot { it === submission }
                if (submissions.isEmpty()) answered.clear()
            }
        }
    }

    private sealed interface Sent {
        data class Accepted(val upload: RecipeUpload) : Sent

        /** Not accepted; [answered] is false when no response arrived. */
        data class Refused(val answered: Boolean) : Sent
    }

    private suspend fun send(url: String): Sent =
        try {
            val response =
                uploadsApi.recipeUploadsCreate(
                    CreateRecipeUploadRequest(RecipeSource(RecipeSourceKind.url, url))
                )
            val upload = response.body()?.data
            if (response.code() == 202 && upload != null) Sent.Accepted(upload)
            else {
                response.errorBody()?.close()
                Log.w("GohoRecipes", "Recipe link was not accepted: ${response.code()}")
                Sent.Refused(answered = true)
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w("GohoRecipes", "Recipe link failed to send", error)
            // A body that doesn't decode still came from the server.
            Sent.Refused(answered = error is SerializationException)
        }

    /**
     * Lists an accepted import at once, unless a listing already has it, which is as new or newer,
     * or had it and has since lost it, so a late answer can't downgrade or restore it.
     */
    private fun accept(submission: Submission, upload: RecipeUpload) {
        changeRevision++
        if (submissions.size > 1) answered += upload.id
        if (upload.id !in submission.seen && state.uploads.none { it.id == upload.id })
            state = state.copy(uploads = listOf(upload) + state.uploads)
        refresh()
    }

    /** The full recipe for details. Only the API's own `RecipeNotFound` 404 counts as missing. */
    suspend fun load(recipeId: String): RecipeLoad {
        // A photo added before this request started is in its answer, which is then the authority;
        // one added while it's waiting isn't, so it keeps its mark.
        val added = recipeId in photosAdded
        return try {
            val response = recipesApi.recipesGet(recipeId)
            when {
                response.isSuccessful ->
                    response.body()?.data?.let {
                        if (added) photosAdded = photosAdded - recipeId
                        RecipeLoad.Loaded(it)
                    } ?: RecipeLoad.Failed
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

    /**
     * Sends [uri], picked for a recipe without a photo, as its photo, once per recipe at a time. It
     * shows in details as soon as it decodes, and a 201 or 204 (both without a body) keeps it: the
     * recipe lists with its photo, the row's thumbnail comes from the decoded photo rather than a
     * fetch, and the list refreshes. Anything else drops it and reports through [feedback], unless
     * the recipe is being deleted or is gone. Nothing is retried.
     */
    fun addPhoto(recipeId: String, uri: Uri) {
        if (
            recipeId in photoUploads ||
                recipeId in photosAdded ||
                deletions.contains(DeletionKey(DeletionKind.Recipe, recipeId))
        )
            return
        photoUploads = photoUploads + (recipeId to null)
        scope.launch {
            val problem =
                try {
                    sendPhoto(recipeId, uri)
                } finally {
                    photoUploads = photoUploads - recipeId
                }
            if (
                problem != null &&
                    !deletions.contains(DeletionKey(DeletionKind.Recipe, recipeId)) &&
                    (!state.hasLoaded || state.recipes.any { it.id == recipeId })
            )
                feedback.send(FeedbackMessage.RecipePhotoFailed(problem))
        }
    }

    /** Null once the server has the photo. */
    private suspend fun sendPhoto(recipeId: String, uri: Uri): RecipePhotoProblem? {
        val type = contentResolver.recipePhotoType(uri) ?: return RecipePhotoProblem.Unsupported
        val photo = contentResolver.decodeRecipePhoto(uri) ?: return RecipePhotoProblem.Unsupported
        photoUploads = photoUploads + (recipeId to photo.asImageBitmap())
        val response =
            try {
                recipesApi.recipesPutImage(recipeId, contentResolver.filePart(uri, "photo", type))
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                Log.w("GohoRecipes", "Recipe photo failed to send", error)
                // The server may have saved it anyway; the list shows whether it did.
                refresh()
                return if (error is IOException && isOffline()) RecipePhotoProblem.Offline
                else RecipePhotoProblem.Failed
            }
        response.errorBody()?.close()
        return when (response.code()) {
            201,
            204 -> {
                photoAdded(recipeId, photo)
                null
            }
            400,
            413 -> RecipePhotoProblem.Unsupported
            else -> {
                Log.w("GohoRecipes", "Recipe photo was not saved: ${response.code()}")
                if (response.code() == 404) refresh()
                RecipePhotoProblem.Failed
            }
        }
    }

    /**
     * Lists the recipe with its photo at once; a listing that began before the upload is dropped,
     * so it can't take the photo away again. A recipe deleted meanwhile isn't listed again.
     */
    private suspend fun photoAdded(recipeId: String, photo: Bitmap) {
        thumbnails.put(recipeId, recipeThumbnail(photo))
        changeRevision++
        photosAdded = photosAdded + recipeId
        state =
            state.copy(
                recipes =
                    state.recipes.map { if (it.id == recipeId) it.copy(hasImage = true) else it }
            )
        refresh()
    }

    /** Deletes a held Recipes row: a saved recipe or a failed import. Others are never accepted. */
    suspend fun delete(entry: RecipeListEntry): Boolean =
        when (entry) {
            is RecipeListEntry.Saved -> deleteRecipe(entry.recipe.id)
            is RecipeListEntry.Import -> entry.failed && deleteUpload(entry.uploadId)
            is RecipeListEntry.Adding -> false
        }

    /**
     * Accepts a confirmed deletion immediately; the activity-owned operation reconciles failures
     * before the recipe can return. The server also deletes the recipe's imports and photo, so a
     * confirmed absence removes its imports from the raw data too, before the mask is released.
     */
    fun deleteRecipe(recipeId: String): Boolean =
        deletions.start(DeletionKey(DeletionKind.Recipe, recipeId)) {
            val deleted =
                deleteAndConfirm(
                    delete = { recipesApi.recipesDelete(recipeId) },
                    lookup = { recipesApi.recipesGet(recipeId) },
                    notFound = RecipeNotFound.serializer(),
                )
            if (deleted) {
                changeRevision++
                state =
                    state.copy(
                        recipes = state.recipes.filterNot { it.id == recipeId },
                        uploads = state.uploads.filterNot { it.recipeId == recipeId },
                    )
            } else refresh()
            deleted
        }

    /**
     * Deletes a failed import in the same way. The API refuses queued, processing and succeeded
     * imports with 409, which the follow-up GET doesn't confirm, so the import returns.
     */
    private fun deleteUpload(uploadId: UUID): Boolean =
        deletions.start(DeletionKey(DeletionKind.RecipeUpload, uploadId.toString())) {
            val deleted =
                deleteAndConfirm(
                    delete = { uploadsApi.recipeUploadsDelete(uploadId) },
                    lookup = { uploadsApi.recipeUploadsGet(uploadId) },
                    notFound = RecipeUploadNotFound.serializer(),
                )
            if (deleted) {
                changeRevision++
                state = state.copy(uploads = state.uploads.filterNot { it.id == uploadId })
            } else refresh()
            deleted
        }

    /**
     * A listing that began before a local change may still include a deleted row, miss an accepted
     * import or hold an older status, so its result, success or failure, is dropped and the list
     * reloads.
     */
    private fun reloadAfterChange(): RecipeListState {
        refreshAfterCurrent = true
        return state.copy(loading = false)
    }

    private fun failed() =
        state.copy(
            loading = false,
            refreshing = false,
            error = !state.hasLoaded,
            refreshError = state.hasLoaded,
        )
}
