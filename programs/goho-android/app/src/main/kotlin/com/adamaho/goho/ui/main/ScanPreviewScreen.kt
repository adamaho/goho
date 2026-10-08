package com.adamaho.goho.ui.main

import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.BackHandler
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.GohoActionButton
import com.adamaho.goho.ui.components.GohoButtonVariant
import com.adamaho.goho.ui.components.UploadIcon
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

enum class UploadStatus {
    Ready,
    Uploading,
    Submitted,
    Failed,
}

@Composable
fun ScanPreviewScreen(
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
    ScanPreviewContent(preview, loading, uploadStatus, onUploadClick, onCancelClick)
}

@Composable
internal fun ScanPreviewContent(
    image: ImageBitmap?,
    loading: Boolean,
    uploadStatus: UploadStatus,
    onUploadClick: () -> Unit,
    onCancelClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = GohoTheme.colors
    val busy = uploadStatus == UploadStatus.Uploading || uploadStatus == UploadStatus.Submitted
    // Keep the capture on screen until the existing upload completes.
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
                    stringResource(R.string.receipt_new),
                    style = GohoTheme.type.title,
                    color = c.textPrimary,
                )
            }
            Spacer(Modifier.height(GohoSpacing.contentGap))
            ScanPreviewPhoto(
                image,
                loading,
                Modifier.weight(1f).padding(horizontal = GohoSpacing.screenMargin),
            )
            val statusText =
                when (uploadStatus) {
                    UploadStatus.Ready -> null
                    UploadStatus.Uploading -> R.string.upload_progress
                    UploadStatus.Submitted -> R.string.upload_submitted
                    UploadStatus.Failed -> R.string.upload_failed
                }
            if (statusText != null) {
                Text(
                    stringResource(statusText),
                    style = GohoTheme.type.meta,
                    color =
                        if (uploadStatus == UploadStatus.Failed) c.attention else c.textTertiary,
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
                GohoActionButton(
                    stringResource(
                        if (busy) R.string.upload_busy
                        else if (uploadStatus == UploadStatus.Failed) R.string.upload_retry
                        else R.string.upload_receipt
                    ),
                    onUploadClick,
                    enabled = !busy,
                    icon = { UploadIcon() },
                )
                GohoActionButton(
                    stringResource(R.string.scan_cancel),
                    onCancelClick,
                    variant = GohoButtonVariant.Secondary,
                    enabled = !busy,
                )
            }
        }
    }
}

@Composable
private fun ScanPreviewPhoto(image: ImageBitmap?, loading: Boolean, modifier: Modifier) {
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
                stringResource(R.string.scan_image_description),
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
