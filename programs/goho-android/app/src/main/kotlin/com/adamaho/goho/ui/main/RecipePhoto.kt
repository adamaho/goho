package com.adamaho.goho.ui.main

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.graphics.scale
import java.io.IOException
import java.nio.ByteBuffer
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okio.BufferedSink

/** Why a picked recipe photo wasn't added, which decides the snackbar's detail. */
internal enum class RecipePhotoProblem {
    /** Not a JPEG, PNG or WebP under the server's 20 MB limit, by its type, size or bytes. */
    Unsupported,
    /** No answer arrived and the device has no network. */
    Offline,
    Failed,
}

/** The types the server accepts, checked again there from the bytes. */
private val recipePhotoTypes = setOf("image/jpeg", "image/png", "image/webp")

/**
 * The server's 20 MB file limit read as 20 MiB, the larger reading, so only a photo the server
 * would refuse either way is refused before sending.
 */
private const val RECIPE_PHOTO_MAX_BYTES = 20L * 1024 * 1024

/**
 * The type to label a picked photo's upload with, or null to refuse it before sending when the
 * provider reports a type the server doesn't accept or a size over its limit. The provider isn't
 * trusted beyond that: an unknown type or size is sent, and the server checks the bytes.
 */
internal suspend fun ContentResolver.recipePhotoType(uri: Uri): String? =
    withContext(Dispatchers.IO) {
        val type = getType(uri)
        val size =
            try {
                query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use {
                    if (it.moveToFirst() && !it.isNull(0)) it.getLong(0) else null
                }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                null
            }
        when {
            (size ?: 0) > RECIPE_PHOTO_MAX_BYTES -> null
            type == null -> "application/octet-stream"
            else -> type.takeIf { it in recipePhotoTypes }
        }
    }

/**
 * Decodes [source] upright by its EXIF orientation, mirrored ones included, as a software bitmap
 * sampled by [sampleSize] from the stored size. Recipe photos are stored as sent, so every recipe
 * decode goes through here to look the same as the picked photo did. Null when it can't be read.
 */
private fun decodeUpright(source: ImageDecoder.Source, sampleSize: (Int, Int) -> Int): Bitmap? =
    try {
        ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            decoder.setTargetSampleSize(sampleSize(info.size.width, info.size.height))
        }
    } catch (error: Exception) {
        null
    }

/** A picked photo for the details hero, within [photoSampleSize]'s 4096px and 8MP. */
internal suspend fun ContentResolver.decodeRecipePhoto(uri: Uri): Bitmap? =
    withContext(Dispatchers.IO) {
        decodeUpright(ImageDecoder.createSource(this@decodeRecipePhoto, uri), ::photoSampleSize)
    }

/** A fetched recipe photo for the details hero, bounded as [decodeRecipePhoto]. */
internal suspend fun decodeRecipePhoto(bytes: ByteArray): ImageBitmap? =
    withContext(Dispatchers.Default) {
        decodeUpright(ImageDecoder.createSource(ByteBuffer.wrap(bytes)), ::photoSampleSize)
            ?.asImageBitmap()
    }

/** A fetched recipe photo for its row, sampled as [ThumbnailCache] samples other thumbnails. */
internal fun decodeRecipeThumbnail(bytes: ByteArray): Bitmap? =
    decodeUpright(ImageDecoder.createSource(ByteBuffer.wrap(bytes)), ::thumbnailSampleSize)

/** A list-sized copy of a decoded photo, sampled as [ThumbnailCache] samples fetched ones. */
internal suspend fun recipeThumbnail(photo: Bitmap): Bitmap =
    withContext(Dispatchers.Default) {
        val sample = thumbnailSampleSize(photo.width, photo.height)
        if (sample == 1) photo
        else photo.scale(maxOf(1, photo.width / sample), maxOf(1, photo.height / sample))
    }

/**
 * Streams [uri] as the single multipart `file` part the upload endpoints expect, without reading it
 * into memory. [type] labels the part; servers check the bytes themselves.
 */
internal fun ContentResolver.filePart(
    uri: Uri,
    fileName: String,
    type: String,
): MultipartBody.Part {
    val body =
        object : RequestBody() {
            override fun contentType() = type.toMediaType()

            override fun isOneShot() = true

            override fun writeTo(sink: BufferedSink) {
                val input = openInputStream(uri) ?: throw IOException("Image is unavailable")
                input.use { it.copyTo(sink.outputStream()) }
            }
        }
    return MultipartBody.Part.createFormData("file", fileName, body)
}
