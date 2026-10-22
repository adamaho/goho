package com.adamaho.goho.ui.main

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.skeleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext

/**
 * A bounded receipt-photo or book-cover cache keyed by record ID. Only decoded images are kept, so
 * a missing, failed or undecodable image is requested again the next time its row needs it.
 */
internal class ThumbnailCache(private val loadImage: suspend (String) -> ByteArray?) {
    private val cache =
        object : LruCache<String, Bitmap>(4 * 1024 * 1024) {
            override fun sizeOf(key: String, value: Bitmap) = value.byteCount
        }
    private val requests = Semaphore(3)

    suspend fun get(id: String): Bitmap? =
        withContext(Dispatchers.IO) {
            cache.get(id)?.let {
                return@withContext it
            }
            requests.withPermit {
                cache.get(id)?.let {
                    return@withPermit it
                }
                val bitmap =
                    try {
                        loadImage(id)?.let { bytes ->
                            val options =
                                BitmapFactory.Options().apply { inJustDecodeBounds = true }
                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
                            if (options.outWidth <= 0 || options.outHeight <= 0) null
                            else {
                                options.inJustDecodeBounds = false
                                options.inSampleSize =
                                    thumbnailSampleSize(options.outWidth, options.outHeight)
                                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
                            }
                        }
                    } catch (error: Exception) {
                        if (error is CancellationException) throw error
                        null
                    }
                bitmap?.also { cache.put(id, it) }
            }
        }
}

/** Bound the longest decoded side, including extreme receipt and cover aspect ratios. */
internal fun thumbnailSampleSize(width: Int, height: Int): Int {
    var sample = 1
    while (maxOf(width, height) / sample > 384 && sample <= Int.MAX_VALUE / 2) sample *= 2
    return sample
}

@Composable
internal fun ReceiptThumbnail(
    receiptId: String?,
    status: ReceiptListStatus,
    thumbnails: ThumbnailCache,
) {
    var visible by remember { mutableStateOf(false) }
    val bitmap by
        produceState<Bitmap?>(null, receiptId, visible, thumbnails) {
            value = if (visible && receiptId != null) thumbnails.get(receiptId) else null
        }
    ReceiptThumbnail(
        image = bitmap?.asImageBitmap(),
        status = status,
        modifier = Modifier.onGloballyPositioned { visible = !it.boundsInWindow().isEmpty },
    )
}

/** Reuse an already loaded details photo without fetching or decoding it again. */
@Composable
internal fun ReceiptThumbnail(
    image: ImageBitmap?,
    status: ReceiptListStatus,
    modifier: Modifier = Modifier,
) {
    val c = GohoTheme.colors
    val shape = GohoShapes.thumb
    val background =
        when (status) {
            ReceiptListStatus.Processed -> c.surfaceMuted
            ReceiptListStatus.Processing -> c.accentContainer
            ReceiptListStatus.NotProcessed -> c.attentionContainer
        }
    Box(
        modifier
            .size(GohoSpacing.thumbWidth, GohoSpacing.thumbHeight)
            .clip(shape)
            .skeleton(block = true)
            .background(background)
            .border(GohoSpacing.hairline, c.outline, shape),
        contentAlignment = Alignment.Center,
    ) {
        if (image != null) {
            Image(
                image,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
            )
        } else ReceiptPlaceholder(status)
    }
}

@Composable
private fun ReceiptPlaceholder(status: ReceiptListStatus) {
    val c = GohoTheme.colors
    val color =
        when (status) {
            ReceiptListStatus.Processed -> c.textSecondary
            ReceiptListStatus.Processing -> c.onAccentContainer
            ReceiptListStatus.NotProcessed -> c.attention
        }
    Canvas(Modifier.size(GohoSpacing.placeholderWidth, GohoSpacing.placeholderHeight)) {
        val stroke = GohoSpacing.placeholderStroke.toPx()
        fun point(x: Float, y: Float) = Offset(size.width * x, size.height * y)
        fun line(x1: Float, y1: Float, x2: Float, y2: Float) =
            drawLine(color, point(x1, y1), point(x2, y2), stroke, StrokeCap.Round)
        val paper =
            Path().apply {
                moveTo(size.width * 0.14f, size.height * 0.08f)
                lineTo(size.width * 0.86f, size.height * 0.08f)
                lineTo(size.width * 0.86f, size.height * 0.9f)
                lineTo(size.width * 0.68f, size.height * 0.81f)
                lineTo(size.width * 0.5f, size.height * 0.9f)
                lineTo(size.width * 0.32f, size.height * 0.81f)
                lineTo(size.width * 0.14f, size.height * 0.9f)
                close()
            }
        drawPath(paper, color, style = Stroke(stroke))
        when (status) {
            ReceiptListStatus.NotProcessed -> {
                line(0.5f, 0.3f, 0.5f, 0.52f)
                drawCircle(color, stroke / 2, point(0.5f, 0.66f))
            }
            ReceiptListStatus.Processing -> {
                line(0.3f, 0.29f, 0.7f, 0.29f)
                line(0.02f, 0.49f, 0.98f, 0.49f)
                line(0.3f, 0.69f, 0.56f, 0.69f)
            }
            ReceiptListStatus.Processed -> {
                line(0.3f, 0.29f, 0.7f, 0.29f)
                line(0.3f, 0.47f, 0.7f, 0.47f)
                line(0.3f, 0.65f, 0.56f, 0.65f)
            }
        }
    }
}
