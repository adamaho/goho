package com.adamaho.goho.ui.main

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.adamaho.goho.api.isNotFound
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.DeserializationStrategy
import retrofit2.Response

internal enum class DeletionKind {
    Book,
    BookUpload,
    Receipt,
    ReceiptUpload,
}

internal data class DeletionKey(val kind: DeletionKind, val id: String)

/**
 * Activity-owned requests outlive the sheet that confirmed them. Pending IDs mask the live data,
 * rather than removing snapshots that a rollback could restore over newer changes. The caller
 * commits confirmed removal to its raw data before this mask is released.
 */
internal class PendingDeletions(
    private val scope: CoroutineScope,
    private val feedback: Feedback,
) {
    private var pending by mutableStateOf(emptySet<DeletionKey>())

    fun contains(key: DeletionKey): Boolean = key in pending

    /** Returns acceptance immediately; a repeated confirmation cannot send another request. */
    fun start(key: DeletionKey, operation: suspend () -> Boolean): Boolean {
        if (key in pending) return true
        pending = pending + key
        scope.launch {
            try {
                if (!operation()) feedback.send(FeedbackMessage.DeletionFailed(key.kind))
            } finally {
                pending = pending - key
            }
        }
        return true
    }
}

/**
 * A lost acknowledgement is not proof of failure: check the resource before restoring it. A 204
 * from DELETE, or the resource's own [notFound] problem from DELETE or the follow-up GET, means it
 * is already absent; any other 404 does not. If neither request can confirm absence, release the
 * optimistic mask and report the uncertainty; a normal refresh reconciles the cached row. No
 * automatic destructive retry is made.
 */
internal suspend fun deleteAndConfirm(
    delete: suspend () -> Response<*>,
    lookup: suspend () -> Response<*>,
    notFound: DeserializationStrategy<*>,
): Boolean {
    suspend fun confirms(request: suspend () -> Response<*>, absentCode: Int?): Boolean =
        try {
            val response = request()
            response.code() == absentCode || response.isNotFound(notFound)
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w("GohoDeletion", "Deletion could not be confirmed", error)
            false
        }

    return confirms(delete, absentCode = 204) || confirms(lookup, absentCode = null)
}
