package com.adamaho.goho.ui.main

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** A scan saved on this device until the server accepts it; [uploading] is false once it fails. */
data class LocalUpload(
    val id: UUID,
    val kind: ScanKind,
    val createdAt: Instant,
    val uploading: Boolean,
) {
    val key: String
        get() = "local:$id"
}

/**
 * Activity-owned uploads that list their row before the server answers. Each scan is first copied
 * into app-private [directory], so a failed or interrupted upload is retried from the same image.
 * The file name holds the kind, creation time and ID; nothing else is persisted. Saved uploads from
 * an earlier run load as failed and are only sent again when asked. [send] returns the server's
 * upload ID once it accepts the scan and has added the server's row, or null. The local row is
 * removed in the same frame, and the server's row keeps its key through [rowKeys].
 */
internal class PendingUploads(
    private val scope: CoroutineScope,
    private val directory: File,
    private val send: suspend (LocalUpload, File) -> UUID?,
) {
    /** Newest first. */
    var uploads by mutableStateOf(emptyList<LocalUpload>())
        private set

    /** Accepted server upload IDs mapped to their local row keys, so their rows update in place. */
    var rowKeys by mutableStateOf(emptyMap<UUID, String>())
        private set

    private val restore = scope.launch {
        val saved =
            withContext(Dispatchers.IO) {
                directory.listFiles().orEmpty().mapNotNull { file ->
                    // Unfinished copies and unknown files are never listed.
                    parse(file.name).also { if (it == null) file.delete() }
                }
            }
        val known = uploads.mapTo(HashSet()) { it.id }
        uploads = (uploads + saved.filter { it.id !in known }).sortedByDescending { it.createdAt }
    }

    fun of(kind: ScanKind): List<LocalUpload> = uploads.filter { it.kind == kind }

    /**
     * Saves the scan from [open] and starts uploading it. Returns the saved upload once its image
     * is stored, or null when it couldn't be saved.
     */
    suspend fun add(kind: ScanKind, open: () -> InputStream?): LocalUpload? {
        restore.join()
        val upload = LocalUpload(UUID.randomUUID(), kind, Instant.now(), uploading = true)
        try {
            withContext(Dispatchers.IO) {
                directory.mkdirs()
                val partial = File(directory, "${file(upload).name}.partial")
                (open() ?: throw IOException("Scanned image is unavailable")).use { input ->
                    partial.outputStream().use { output ->
                        input.copyTo(output)
                        output.fd.sync()
                    }
                }
                if (!partial.renameTo(file(upload))) throw IOException("Scan could not be saved")
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w("GohoUpload", "Scan could not be saved", error)
            return null
        }
        uploads = listOf(upload) + uploads
        start(upload)
        return upload
    }

    /** Sends a failed upload's saved image again. */
    fun retry(id: UUID) {
        uploads.find { it.id == id && !it.uploading }?.let(::start)
    }

    /** Removes a failed upload and its saved image. One that is uploading can't be discarded. */
    fun discard(id: UUID): Boolean {
        val upload = uploads.find { it.id == id } ?: return true
        if (upload.uploading) return false
        uploads = uploads.filterNot { it.id == id }
        scope.launch { delete(upload) }
        return true
    }

    private fun start(upload: LocalUpload) {
        update(upload.copy(uploading = true))
        scope.launch {
            val accepted =
                try {
                    send(upload, file(upload))
                } catch (error: Exception) {
                    if (error is CancellationException) throw error
                    Log.w("GohoUpload", "Upload failed", error)
                    null
                }
            if (accepted != null) {
                rowKeys = rowKeys + (accepted to upload.key)
                uploads = uploads.filterNot { it.id == upload.id }
                delete(upload)
            } else update(upload.copy(uploading = false))
        }
    }

    private fun update(upload: LocalUpload) {
        uploads = uploads.map { if (it.id == upload.id) upload else it }
    }

    private suspend fun delete(upload: LocalUpload) {
        withContext(Dispatchers.IO + NonCancellable) { file(upload).delete() }
    }

    private fun file(upload: LocalUpload) =
        File(directory, "${upload.kind.name}_${upload.createdAt.toEpochMilli()}_${upload.id}.jpg")

    private fun parse(name: String): LocalUpload? {
        val (kind, millis, id) = FILE_NAME.matchEntire(name)?.destructured ?: return null
        return LocalUpload(
            id = runCatching { UUID.fromString(id) }.getOrNull() ?: return null,
            kind = ScanKind.entries.find { it.name == kind } ?: return null,
            createdAt = Instant.ofEpochMilli(millis.toLongOrNull() ?: return null),
            uploading = false,
        )
    }

    private companion object {
        val FILE_NAME = Regex("""([A-Za-z]+)_(\d+)_([0-9a-fA-F-]{36})\.jpg""")
    }
}
