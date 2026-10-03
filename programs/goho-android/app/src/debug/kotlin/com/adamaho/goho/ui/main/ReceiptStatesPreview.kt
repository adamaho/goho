package com.adamaho.goho.ui.main

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*

@Composable
private fun StatePreview(content: @Composable () -> Unit) {
    GohoTheme {
        Box(Modifier.background(GohoTheme.colors.background).padding(GohoSpacing.screenMargin)) {
            content()
        }
    }
}

@Preview(name = "No receipts – light", widthDp = 412)
@Preview(name = "No receipts – dark", widthDp = 412, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(name = "No receipts – large text", widthDp = 320, fontScale = 1.5f)
@Composable
fun NoReceiptsPreview() = StatePreview { NoReceiptsState() }

@Preview(name = "Connection error – light", widthDp = 412)
@Preview(name = "Connection error – dark", widthDp = 412, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(name = "Connection error – large text", widthDp = 320, fontScale = 1.5f)
@Composable
fun ReceiptsConnectionErrorPreview() = StatePreview { ReceiptsConnectionErrorState(onRetry = {}) }

@Preview(name = "Retrying", widthDp = 412)
@Composable
fun ReceiptsRetryingPreview() = StatePreview {
    ReceiptsConnectionErrorState(onRetry = {}, isRetrying = true)
}

@Preview(name = "Nothing needs attention – light", widthDp = 412)
@Preview(
    name = "Nothing needs attention – dark",
    widthDp = 412,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
)
@Preview(name = "Nothing needs attention – large text", widthDp = 320, fontScale = 1.5f)
@Composable
fun NoNeedsAttentionPreview() = StatePreview { NoNeedsAttentionState() }
