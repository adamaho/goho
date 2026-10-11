package com.adamaho.goho.ui.main

import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.adamaho.goho.theme.GohoTheme
import kotlinx.coroutines.awaitCancellation

@Preview(name = "Loading receipt – light", widthDp = 412, heightDp = 915)
@Preview(
    name = "Loading receipt – dark",
    widthDp = 412,
    heightDp = 915,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
)
@Preview(name = "Loading receipt – large text", widthDp = 320, heightDp = 640, fontScale = 2f)
@Composable
fun ReceiptDetailLoadingPreview() {
    GohoTheme {
        ReceiptDetailScreen(
            receiptId = "preview-loading",
            loadReceipt = { awaitCancellation() },
            loadReceiptImage = { awaitCancellation() },
            onBack = {},
            deleteReceipt = { false },
            hasUpload = true,
        )
    }
}
