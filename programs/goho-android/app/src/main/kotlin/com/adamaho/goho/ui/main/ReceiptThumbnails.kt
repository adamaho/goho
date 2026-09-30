package com.adamaho.goho.ui.main

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import com.adamaho.goho.theme.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext

/** A screen-scoped, bounded cache; failed/missing images stay neutral until the next visit. */
internal class ReceiptThumbnails(private val loadImage: suspend (String) -> ByteArray?) {
    private data class Result(val bitmap: Bitmap?)

    private val cache =
        object : LruCache<String, Result>(4 * 1024 * 1024) {
            override fun sizeOf(key: String, value: Result) =
                maxOf(1024, value.bitmap?.byteCount ?: 0)
        }
    private val requests = Semaphore(3)

    suspend fun get(receiptId: String): Bitmap? =
        withContext(Dispatchers.IO) {
            cache.get(receiptId)?.let {
                return@withContext it.bitmap
            }
            requests.withPermit {
                cache.get(receiptId)?.let {
                    return@withPermit it.bitmap
                }
                val bitmap =
                    try {
                        loadImage(receiptId)?.let { bytes ->
                            val options =
                                BitmapFactory.Options().apply { inJustDecodeBounds = true }
                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
                            if (options.outWidth <= 0 || options.outHeight <= 0) null
                            else {
                                options.inJustDecodeBounds = false
                                options.inSampleSize =
                                    receiptThumbnailSampleSize(options.outWidth, options.outHeight)
                                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
                            }
                        }
                    } catch (error: Exception) {
                        if (error is CancellationException) throw error
                        null
                    }
                cache.put(receiptId, Result(bitmap))
                bitmap
            }
        }
}

/** Bound the longest decoded side, including extreme receipt aspect ratios. */
internal fun receiptThumbnailSampleSize(width: Int, height: Int): Int {
    var sample = 1
    while (maxOf(width, height) / sample > 384 && sample <= Int.MAX_VALUE / 2) sample *= 2
    return sample
}

@Composable
internal fun ReceiptThumbnail(receiptId: String?, thumbnails: ReceiptThumbnails) {
    val c = GohoTheme.colors
    var visible by remember { mutableStateOf(false) }
    val bitmap by
        produceState<Bitmap?>(null, receiptId, visible, thumbnails) {
            value = if (visible && receiptId != null) thumbnails.get(receiptId) else null
        }
    Box(
        Modifier.size(GohoSpacing.thumbWidth, GohoSpacing.thumbHeight)
            .onGloballyPositioned { visible = !it.boundsInWindow().isEmpty }
            .clip(GohoShapes.thumb)
            .background(c.surfaceMuted)
            .border(GohoSpacing.hairline, c.outline, GohoShapes.thumb)
    ) {
        bitmap?.let {
            Image(
                it.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
            )
        }
    }
}
