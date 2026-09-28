package com.adamaho.goho.ui.main

import android.graphics.BitmapFactory
import android.net.Uri
import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.adamaho.goho.R
import com.adamaho.goho.theme.GohoTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

enum class ServerConnectionStatus {
    Checking,
    Connected,
    Unavailable,
}

@Composable
fun MainScreen(
    scannedImageUri: Uri?,
    isOpeningScanner: Boolean,
    @StringRes scanError: Int?,
    serverStatus: ServerConnectionStatus,
    onScanClick: () -> Unit,
    onRetryServerClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val receiptPreview =
        produceState<ImageBitmap?>(initialValue = null, key1 = scannedImageUri) {
            value = scannedImageUri?.let { uri ->
                withContext(Dispatchers.IO) {
                    runCatching {
                        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                        context.contentResolver.openInputStream(uri)?.use { stream ->
                            BitmapFactory.decodeStream(stream, null, bounds)
                        }
                        val largestDimension = maxOf(bounds.outWidth, bounds.outHeight)
                        val sampleSize =
                            generateSequence(1) { it * 2 }.first { largestDimension / it <= 1600 }
                        val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
                        context.contentResolver.openInputStream(uri)?.use { stream ->
                            BitmapFactory.decodeStream(stream, null, options)?.asImageBitmap()
                        }
                    }
                        .getOrNull()
                }
            }
        }

    Column(
        modifier = modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.app_name),
            style = MaterialTheme.typography.headlineLarge,
        )
        Spacer(modifier = Modifier.height(8.dp))
        val serverStatusText =
            when (serverStatus) {
                ServerConnectionStatus.Checking -> R.string.server_checking
                ServerConnectionStatus.Connected -> R.string.server_connected
                ServerConnectionStatus.Unavailable -> R.string.server_unavailable
            }
        Text(
            text = stringResource(serverStatusText),
            color =
                if (serverStatus == ServerConnectionStatus.Unavailable)
                    MaterialTheme.colorScheme.error
                else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (serverStatus == ServerConnectionStatus.Unavailable) {
            TextButton(onClick = onRetryServerClick) {
                Text(text = stringResource(R.string.server_retry))
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
        if (scannedImageUri == null) {
            Text(
                text = stringResource(R.string.scan_prompt),
                style = MaterialTheme.typography.bodyLarge,
            )
        } else {
            Text(
                text = stringResource(R.string.scan_ready),
                style = MaterialTheme.typography.bodyLarge,
            )
            receiptPreview.value?.let { image ->
                Spacer(modifier = Modifier.height(16.dp))
                Image(
                    bitmap = image,
                    contentDescription = stringResource(R.string.scan_image_description),
                    modifier = Modifier.fillMaxWidth().heightIn(max = 440.dp),
                    contentScale = ContentScale.Fit,
                )
            }
        }
        scanError?.let { error ->
            Spacer(modifier = Modifier.height(16.dp))
            Text(text = stringResource(error), color = MaterialTheme.colorScheme.error)
        }
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onScanClick, enabled = !isOpeningScanner) {
            Text(
                text =
                    stringResource(
                        if (isOpeningScanner) R.string.scan_opening
                        else if (scannedImageUri == null) R.string.scan_receipt
                        else R.string.scan_another_receipt
                    )
            )
        }
        if (isOpeningScanner) {
            Spacer(modifier = Modifier.height(16.dp))
            CircularProgressIndicator()
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun MainScreenPreview() {
    GohoTheme {
        MainScreen(
            scannedImageUri = null,
            isOpeningScanner = false,
            scanError = null,
            serverStatus = ServerConnectionStatus.Connected,
            onScanClick = {},
            onRetryServerClick = {},
        )
    }
}
