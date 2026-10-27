package com.adamaho.goho.ui.main

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import retrofit2.Response

internal enum class DeletionKind {
    Book,
    Receipt,
    ReceiptUpload,
}

internal data class DeletionKey(val kind: DeletionKind, val id: String)

/**
 * Activity-owned requests outlive the sheet that confirmed them. Pending IDs mask the live data,
 * rather than removing snapshots that a rollback could restore over newer changes. The caller
 * commits confirmed removal to its raw data before this mask is released.
 */
internal class PendingDeletions(private val scope: CoroutineScope) {
    private var pending by mutableStateOf(emptySet<DeletionKey>())
    private val failures = Channel<DeletionKind>(Channel.UNLIMITED)
    val errors = failures.receiveAsFlow()

    fun contains(key: DeletionKey): Boolean = key in pending

    /** Returns acceptance immediately; a repeated confirmation cannot send another request. */
    fun start(key: DeletionKey, operation: suspend () -> Boolean): Boolean {
        if (key in pending) return true
        pending = pending + key
        scope.launch {
            try {
                if (!operation()) failures.send(key.kind)
            } finally {
                pending = pending - key
            }
        }
        return true
    }
}

/**
 * A lost acknowledgement is not proof of failure: check the resource before restoring it. A 404
 * from DELETE or the follow-up GET means it is already absent. If neither request can confirm
 * absence, release the optimistic mask and report the uncertainty; a normal refresh reconciles the
 * cached row. No automatic destructive retry is made.
 */
internal suspend fun deleteAndConfirm(
    delete: suspend () -> Response<*>,
    lookup: suspend () -> Response<*>,
): Boolean {
    suspend fun status(request: suspend () -> Response<*>): Int? =
        try {
            val response = request()
            response.errorBody()?.close()
            response.code()
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w("GohoDeletion", "Deletion could not be confirmed", error)
            null
        }

    val result = status(delete)
    return result == 204 || result == 404 || status(lookup) == 404
}
