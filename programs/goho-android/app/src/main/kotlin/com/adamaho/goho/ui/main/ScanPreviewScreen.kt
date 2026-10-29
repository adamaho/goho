package com.adamaho.goho.ui.main

import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.*
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.ActionButton
import com.adamaho.goho.ui.components.ButtonColor
import com.adamaho.goho.ui.components.Tag
import com.adamaho.goho.ui.components.UploadIcon
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Upload saves the photo on the phone before the preview closes; the transfer continues from its
 * list row. A failed save keeps the preview so the photo is not lost.
 */
enum class UploadStatus {
    Ready,
    Saving,
    SaveFailed,
}

/** What a scan captures: it chooses the preview copy and, in the activity, the upload endpoint. */
enum class ScanKind(
    @StringRes val title: Int,
    @StringRes val imageDescription: Int,
    @StringRes val upload: Int,
) {
    Receipt(R.string.receipt_new, R.string.scan_image_description, R.string.upload_receipt),
    Book(R.string.book_new, R.string.scan_cover_description, R.string.upload_cover),
}

@Composable
fun ScanPreviewScreen(
    kind: ScanKind,
    scannedImageUri: Uri,
    uploadStatus: UploadStatus,
    onUploadClick: () -> Unit,
    onCancelClick: () -> Unit,
) {
    val resolver = LocalContext.current.contentResolver
    var loading by remember(scannedImageUri) { mutableStateOf(true) }
    val preview by
        produceState<ImageBitmap?>(null, scannedImageUri) {
            value = null
            value =
                withContext(Dispatchers.IO) {
                    try {
                        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                        resolver.openInputStream(scannedImageUri)?.use {
                            BitmapFactory.decodeStream(it, null, bounds)
                        }
                        val largest = maxOf(bounds.outWidth, bounds.outHeight)
                        val sample = generateSequence(1) { it * 2 }.first { largest / it <= 1600 }
                        resolver.openInputStream(scannedImageUri)?.use {
                            BitmapFactory.decodeStream(
                                    it,
                                    null,
                                    BitmapFactory.Options().apply { inSampleSize = sample },
                                )
                                ?.asImageBitmap()
                        }
                    } catch (error: Exception) {
                        if (error is CancellationException) throw error
                        null
                    }
                }
            loading = false
        }
    ScanPreviewContent(kind, preview, loading, uploadStatus, onUploadClick, onCancelClick)
}

@Composable
internal fun ScanPreviewContent(
    kind: ScanKind,
    image: ImageBitmap?,
    loading: Boolean,
    uploadStatus: UploadStatus,
    onUploadClick: () -> Unit,
    onCancelClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = GohoTheme.colors
    val busy = uploadStatus == UploadStatus.Saving
    // Keep the capture on screen until its local copy is saved.
    BackHandler { if (!busy) onCancelClick() }
    val fontScale = LocalDensity.current.fontScale
    BoxWithConstraints(modifier.fillMaxSize().background(c.background).safeDrawingPadding()) {
        // Short screens and enlarged text can scroll without squeezing the actions out of view.
        val height = maxHeight.coerceAtLeast(GohoSpacing.previewMinHeight * fontScale)
        Column(
            Modifier.fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .height(height)
                .padding(top = GohoSpacing.headerTop, bottom = GohoSpacing.fabBottom)
        ) {
            Box(
                Modifier.fillMaxWidth()
                    .heightIn(min = GohoSpacing.headerHeight)
                    .padding(horizontal = GohoSpacing.textInset),
                contentAlignment = Alignment.CenterStart,
            ) {
                Text(
                    stringResource(kind.title),
                    style = GohoTheme.type.title,
                    color = c.textPrimary,
                )
            }
            Spacer(Modifier.height(GohoSpacing.contentGap))
            ScanPreviewPhoto(
                image,
                stringResource(kind.imageDescription),
                loading,
                Modifier.weight(1f).padding(horizontal = GohoSpacing.screenMargin),
            )
            if (uploadStatus == UploadStatus.SaveFailed) {
                Tag(
                    label = stringResource(R.string.upload_save_failed),
                    icon = painterResource(R.drawable.ic_tag_failed),
                    color = TagColor.Orange,
                    modifier =
                        Modifier.padding(horizontal = GohoSpacing.textInset)
                            .padding(top = GohoSpacing.contentGap)
                            .semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
            Column(
                Modifier.padding(horizontal = GohoSpacing.screenMargin)
                    .padding(top = GohoSpacing.previewFooterTop),
                verticalArrangement = Arrangement.spacedBy(GohoSpacing.buttonGap),
            ) {
                ActionButton(
                    stringResource(
                        if (uploadStatus == UploadStatus.SaveFailed) R.string.upload_retry
                        else kind.upload
                    ),
                    onUploadClick,
                    enabled = !busy,
                    icon = { UploadIcon() },
                )
                ActionButton(
                    stringResource(R.string.scan_cancel),
                    onCancelClick,
                    variant = 2,
                    color = ButtonColor.Grey,
                    enabled = !busy,
                )
            }
        }
    }
}

@Composable
private fun ScanPreviewPhoto(
    image: ImageBitmap?,
    description: String,
    loading: Boolean,
    modifier: Modifier,
) {
    val c = GohoTheme.colors
    BoxWithConstraints(
        modifier
            .fillMaxWidth()
            .clip(GohoShapes.card)
            .background(Brush.radialGradient(listOf(c.photoWellCenter, c.photoWellEdge)))
            .padding(GohoSpacing.photoPadding),
        contentAlignment = Alignment.Center,
    ) {
        if (image != null) {
            val ratio = image.width.toFloat() / image.height
            val width = minOf(maxWidth, maxHeight * ratio)
            Image(
                image,
                description,
                Modifier.size(width, width / ratio)
                    .shadow(
                        GohoSpacing.photoElevation,
                        ambientColor = Color.Black,
                        spotColor = Color.Black,
                    ),
                contentScale = ContentScale.Fit,
            )
        } else if (!loading) {
            Text(
                stringResource(R.string.scan_preview_unavailable),
                style = GohoTheme.type.meta,
                color = GohoDarkColors.textSecondary,
            )
        }
    }
}
