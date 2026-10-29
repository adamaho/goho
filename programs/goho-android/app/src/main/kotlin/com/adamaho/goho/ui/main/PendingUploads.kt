package com.adamaho.goho.ui.main

import android.content.ContentResolver
import android.net.Uri
import android.util.AtomicFile
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.io.File
import java.io.IOException
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Where a saved photo is in its transfer. [Accepted] uploads are the server's, and stay listed only
 * until a listing that includes them replaces their row.
 */
enum class TransferState {
    Sending,
    Failed,
    Accepted,
}

/** How the server answered one attempt to send an upload. */
enum class SendOutcome {
    /** The server has the upload, in any processing status. */
    Accepted,
    /** The server accepted this key before and the upload has since been deleted. */
    Gone,
    /** Nothing is known to be stored: a network error or any other response. */
    Failed,
}

/** A scanned photo saved on the phone, whose [id] is also its server upload ID. */
data class PendingUpload(
    val id: UUID,
    val kind: ScanKind,
    val createdAt: Instant,
    val state: TransferState,
)

/**
 * Process-owned uploads that outlive their scan preview, section switches and activity. Each one is
 * a copy of the photo and a small record in [directory], which is app-private, excluded from
 * backups and specific to one server. The record is written last, so only complete uploads load.
 *
 * [send] posts one upload with its ID as the idempotency key. Sending uploads resume when the
 * process starts; failed ones wait for [retry]. An accepted upload is never posted again, and its
 * files are removed once [reconcile] confirms a listing has it. One the server reports gone was
 * deleted elsewhere after acceptance, so its files are removed at once. State is read and changed
 * on the main thread; disk work runs on IO, in order.
 */
internal class PendingUploads(
    private val directory: File,
    private val resolver: ContentResolver,
    private val scope: CoroutineScope,
    private val send: suspend (PendingUpload, File) -> SendOutcome,
) {
    var entries by mutableStateOf(emptyList<PendingUpload>())
        private set

    private val transfers = mutableMapOf<UUID, Job>()
    private val disk = Mutex()
    private val answered = MutableSharedFlow<ScanKind>(extraBufferCapacity = 16)

    /**
     * The kind of each upload the server accepted or reported gone, so its list can refresh now.
     */
    val refreshes: SharedFlow<ScanKind> = answered

    /** Loads saved uploads and resumes the ones that were sending. Call once per process. */
    fun start() {
        scope.launch {
            val loaded = disk.withLock { withContext(Dispatchers.IO) { load() } }
            entries = loaded + entries.filter { entry -> loaded.none { it.id == entry.id } }
            loaded.filter { it.state == TransferState.Sending }.forEach(::transfer)
        }
    }

    /**
     * Copies the scanned image, saves its record and starts sending it. Returns null, keeping
     * nothing, when the photo can't be saved. The copy continues if the caller leaves.
     */
    suspend fun add(kind: ScanKind, image: Uri): PendingUpload? =
        scope
            .async {
                val upload =
                    PendingUpload(UUID.randomUUID(), kind, Instant.now(), TransferState.Sending)
                val saved = disk.withLock {
                    withContext(Dispatchers.IO) {
                        try {
                            savePhoto(upload.id, image)
                            saveRecord(upload)
                            true
                        } catch (error: Exception) {
                            if (error is CancellationException) throw error
                            Log.w("GohoUpload", "Scanned photo could not be saved", error)
                            deleteFiles(upload.id)
                            false
                        }
                    }
                }
                if (saved) {
                    entries = listOf(upload) + entries
                    transfer(upload)
                    upload
                } else null
            }
            .await()

    /** Sends a failed upload again with the same key. */
    fun retry(id: UUID) {
        val upload = entries.find { it.id == id && it.state == TransferState.Failed } ?: return
        transfer(update(upload, TransferState.Sending))
    }

    /**
     * Deletes a failed upload's photo and record from the phone. This cannot withdraw a request the
     * server already accepted; such an upload appears in the next listing.
     */
    fun remove(id: UUID) {
        if (entries.any { it.id == id && it.state == TransferState.Failed }) discard(id)
    }

    /** Accepted uploads, so a listing that starts now can confirm them. */
    fun acceptedIds(kind: ScanKind): Set<UUID> =
        entries
            .filter { it.kind == kind && it.state == TransferState.Accepted }
            .mapTo(HashSet()) { it.id }

    /**
     * Drops [kind] uploads that a successful listing has: those accepted before it started, and any
     * whose ID it lists, which only the server's acceptance of this key can produce.
     */
    fun reconcile(kind: ScanKind, ids: Set<UUID>) {
        entries.filter { it.kind == kind && it.id in ids }.forEach { discard(it.id) }
    }

    /** The saved photo's bytes for list thumbnails; call off the main thread. */
    fun readPhoto(id: UUID): ByteArray? =
        try {
            photo(id).takeIf { it.isFile }?.readBytes()
        } catch (error: IOException) {
            Log.w("GohoUpload", "Saved photo could not be read", error)
            null
        }

    private fun transfer(upload: PendingUpload) {
        if (transfers[upload.id]?.isActive == true) return
        transfers[upload.id] = scope.launch {
            val job = currentCoroutineContext()[Job]
            try {
                val outcome =
                    try {
                        send(upload, photo(upload.id))
                    } catch (error: Exception) {
                        if (error is CancellationException) throw error
                        Log.w("GohoUpload", "Upload could not be sent", error)
                        SendOutcome.Failed
                    }
                // Reconciled meanwhile: a listing already has it.
                val current = entries.find { it.id == upload.id } ?: return@launch
                if (outcome != SendOutcome.Failed) answered.tryEmit(upload.kind)
                when (outcome) {
                    SendOutcome.Accepted -> update(current, TransferState.Accepted)
                    // Already removed on the server; keeping or resending it would resurrect it.
                    SendOutcome.Gone -> discard(upload.id)
                    SendOutcome.Failed -> update(current, TransferState.Failed)
                }
            } finally {
                if (transfers[upload.id] == job) transfers.remove(upload.id)
            }
        }
    }

    private fun update(upload: PendingUpload, state: TransferState): PendingUpload {
        val updated = upload.copy(state = state)
        entries = entries.map { if (it.id == upload.id) updated else it }
        scope.launch {
            disk.withLock {
                // A removal queued first has already deleted the files.
                if (entries.none { it.id == upload.id }) return@withLock
                try {
                    withContext(Dispatchers.IO) { saveRecord(updated) }
                } catch (error: IOException) {
                    // The older state stays on disk; resending it is safe with the same key.
                    Log.w("GohoUpload", "Upload record could not be updated", error)
                }
            }
        }
        return updated
    }

    private fun discard(id: UUID) {
        entries = entries.filterNot { it.id == id }
        transfers.remove(id)?.cancel()
        scope.launch { disk.withLock { withContext(Dispatchers.IO) { deleteFiles(id) } } }
    }

    private fun photo(id: UUID) = File(directory, "$id.jpg")

    private fun record(id: UUID) = AtomicFile(File(directory, "$id.json"))

    private fun savePhoto(id: UUID, image: Uri) {
        directory.mkdirs()
        val target = AtomicFile(photo(id))
        val output = target.startWrite()
        try {
            val copied =
                resolver.openInputStream(image)?.use { it.copyTo(output) }
                    ?: throw IOException("Scanned image is unavailable")
            if (copied == 0L) throw IOException("Scanned image is empty")
            target.finishWrite(output)
        } catch (error: Exception) {
            target.failWrite(output)
            throw error
        }
    }

    private fun saveRecord(upload: PendingUpload) {
        val target = record(upload.id)
        val output = target.startWrite()
        try {
            output.write(
                JSONObject()
                    .put("id", upload.id.toString())
                    .put("kind", upload.kind.name)
                    .put("createdAt", upload.createdAt.toString())
                    .put("state", upload.state.name)
                    .toString()
                    .toByteArray()
            )
            target.finishWrite(output)
        } catch (error: Exception) {
            target.failWrite(output)
            throw error
        }
    }

    /** Record first, so an interrupted removal leaves only a photo that the next load deletes. */
    private fun deleteFiles(id: UUID) {
        record(id).delete()
        AtomicFile(photo(id)).delete()
    }

    /** Readable records with photos, newest first; files belonging to nothing are deleted. */
    private fun load(): List<PendingUpload> {
        val files = directory.listFiles().orEmpty()
        // Older Android versions can leave only a record's backup after a crash mid-update;
        // reading through AtomicFile restores it.
        val uploads =
            files
                .filter { it.name.contains(".json") }
                .map { it.name.substringBefore('.') }
                .distinct()
                .mapNotNull { id ->
                    try {
                        val json =
                            JSONObject(String(AtomicFile(File(directory, "$id.json")).readFully()))
                        PendingUpload(
                                id = UUID.fromString(json.getString("id")),
                                kind = ScanKind.valueOf(json.getString("kind")),
                                createdAt = Instant.parse(json.getString("createdAt")),
                                state = TransferState.valueOf(json.getString("state")),
                            )
                            .takeIf { it.id.toString() == id && photo(it.id).isFile }
                    } catch (error: Exception) {
                        Log.w("GohoUpload", "Ignoring an unreadable upload record", error)
                        null
                    }
                }
        val kept = uploads.mapTo(HashSet()) { it.id.toString() }
        files.filter { it.name.substringBefore('.') !in kept }.forEach { it.delete() }
        return uploads.sortedByDescending { it.createdAt }
    }
}
