package com.adamaho.goho.ui.main

import android.app.Activity
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.tooling.preview.Preview
import androidx.core.view.WindowCompat
import com.adamaho.goho.theme.GohoTheme
import java.io.File

// Synthetic capture for visual previews; no real receipt or server request is used.
private fun sampleReceipt(): Bitmap =
    Bitmap.createBitmap(480, 680, Bitmap.Config.ARGB_8888).apply {
        eraseColor(Color.rgb(238, 236, 230))
        val canvas = Canvas(this)
        val paint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.rgb(45, 44, 40)
                typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
                textSize = 32f
                textAlign = Paint.Align.CENTER
            }
        canvas.drawText("FOODLAND", 240f, 70f, paint)
        paint.textAlign = Paint.Align.LEFT
        paint.textSize = 21f
        paint.strokeWidth = 3f
        canvas.drawLine(36f, 140f, 444f, 140f, paint)
        listOf("Produce" to "12.50", "Bread" to "4.99", "Milk" to "6.29", "Groceries" to "23.00")
            .forEachIndexed { index, (name, price) ->
                val y = 195f + index * 50
                canvas.drawText(name, 40f, y, paint)
                canvas.drawText(price, 355f, y, paint)
            }
        canvas.drawLine(36f, 390f, 444f, 390f, paint)
        paint.textSize = 27f
        canvas.drawText("TOTAL", 40f, 440f, paint)
        canvas.drawText("46.78", 330f, 440f, paint)
        for (x in 88..390 step 7) canvas.drawRect(x.toFloat(), 550f, x + 3f, 616f, paint)
    }

@Composable
private fun PreviewCapture(initialStatus: UploadStatus) {
    val context = LocalContext.current
    val uri = remember {
        val file = File(context.cacheDir, "preview-receipt.png")
        val bitmap = sampleReceipt()
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        Uri.fromFile(file)
    }
    var status by remember { mutableStateOf(initialStatus) }
    var cancelled by remember { mutableStateOf(false) }
    GohoTheme {
        val view = LocalView.current
        val dark = GohoTheme.colors.isDark
        if (!view.isInEditMode)
            SideEffect {
                (view.context as? Activity)?.window?.let { window ->
                    WindowCompat.getInsetsController(window, view).apply {
                        isAppearanceLightStatusBars = !dark
                        isAppearanceLightNavigationBars = !dark
                    }
                }
            }
        if (cancelled)
            ReceiptOverview(
                receiptListPreviewState,
                false,
                null,
                {},
                {},
                {},
                loadReceiptImage = { null },
            )
        else
            ScanPreviewScreen(
                uri,
                status,
                { status = UploadStatus.Uploading },
                { cancelled = true },
            )
    }
}

@Preview(name = "Light", uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(name = "Dark", uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(name = "Large text", fontScale = 1.5f)
@Composable
fun ScanPreview() = PreviewCapture(UploadStatus.Ready)

@Preview @Composable fun ScanUploadingPreview() = PreviewCapture(UploadStatus.Uploading)

@Preview @Composable fun ScanUploadFailedPreview() = PreviewCapture(UploadStatus.Failed)
