package com.adamaho.goho.ui.main

import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Receipt
import com.adamaho.goho.api.generated.model.ReceiptUploadsList200ResponseDataInner
import com.adamaho.goho.theme.GohoTheme

data class ReceiptOverviewState(
    val uploads: List<ReceiptUploadsList200ResponseDataInner> = emptyList(),
    val receipts: List<Receipt> = emptyList(),
    val hasLoaded: Boolean = false,
    val loading: Boolean = false,
    val error: Boolean = false,
)

@Composable
fun ReceiptOverview(
    state: ReceiptOverviewState,
    serverStatus: ServerConnectionStatus,
    uploadStatus: UploadStatus,
    isOpeningScanner: Boolean,
    @StringRes scanError: Int?,
    onScanClick: () -> Unit,
    onRetryServerClick: () -> Unit,
    onReceiptClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val pending =
        state.uploads.filter {
            it.status == ReceiptUploadsList200ResponseDataInner.Status.queued ||
                it.status == ReceiptUploadsList200ResponseDataInner.Status.processing
        }
    val failed =
        state.uploads.filter { it.status == ReceiptUploadsList200ResponseDataInner.Status.failed }

    LazyColumn(
        modifier = modifier.fillMaxSize().safeDrawingPadding(),
        contentPadding = PaddingValues(24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Column(
                modifier = Modifier.fillMaxWidth(),
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
                if (uploadStatus == UploadStatus.Submitted) {
                    Text(text = stringResource(R.string.upload_submitted))
                    Spacer(modifier = Modifier.height(8.dp))
                }
                Text(text = stringResource(R.string.scan_prompt))
                scanError?.let { error ->
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = stringResource(error),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Spacer(modifier = Modifier.height(16.dp))
                Button(onClick = onScanClick, enabled = !isOpeningScanner) {
                    Text(
                        text =
                            stringResource(
                                if (isOpeningScanner) R.string.scan_opening
                                else R.string.scan_receipt
                            )
                    )
                }
                if (isOpeningScanner) {
                    Spacer(modifier = Modifier.height(12.dp))
                    CircularProgressIndicator()
                }
            }
        }
        item {
            Column {
                Spacer(modifier = Modifier.height(24.dp))
                if (state.loading && !state.hasLoaded) {
                    Text(text = stringResource(R.string.receipts_loading))
                }
                if (state.error) {
                    Text(
                        text = stringResource(R.string.receipts_load_failed),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = stringResource(R.string.receipt_queue_title),
                    style = MaterialTheme.typography.titleLarge,
                )
            }
        }
        if (pending.isEmpty() && state.hasLoaded) {
            item { Text(text = stringResource(R.string.receipt_queue_empty)) }
        } else {
            items(pending, key = { it.id }) { upload ->
                ListItem(
                    headlineContent = { Text(upload.fileName) },
                    supportingContent = {
                        Text(
                            text =
                                stringResource(
                                    if (
                                        upload.status ==
                                            ReceiptUploadsList200ResponseDataInner.Status.queued
                                    )
                                        R.string.upload_queued
                                    else R.string.upload_processing
                                ) + " · " + upload.createdAt.take(16)
                        )
                    },
                )
                HorizontalDivider()
            }
        }
        item {
            Column {
                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    text = stringResource(R.string.receipts_processed_title),
                    style = MaterialTheme.typography.titleLarge,
                )
            }
        }
        if (state.receipts.isEmpty() && state.hasLoaded) {
            item { Text(text = stringResource(R.string.receipts_processed_empty)) }
        } else {
            items(state.receipts, key = { it.id }) { receipt ->
                ListItem(
                    modifier = Modifier.clickable { onReceiptClick(receipt.id) },
                    headlineContent = { Text(receipt.storeName) },
                    supportingContent = { Text(receipt.receiptDate) },
                    trailingContent = {
                        Text(
                            text = listOfNotNull(receipt.total, receipt.currency).joinToString(" ")
                        )
                    },
                )
                HorizontalDivider()
            }
        }
        if (failed.isNotEmpty()) {
            item {
                Column {
                    Spacer(modifier = Modifier.height(24.dp))
                    Text(
                        text = stringResource(R.string.receipts_failed_title),
                        style = MaterialTheme.typography.titleLarge,
                    )
                }
            }
            items(failed, key = { it.id }) { upload ->
                ListItem(
                    headlineContent = { Text(upload.fileName) },
                    supportingContent = {
                        Text(text = stringResource(R.string.receipts_failed_item))
                    },
                )
                HorizontalDivider()
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun ReceiptOverviewPreview() {
    GohoTheme {
        ReceiptOverview(
            state = ReceiptOverviewState(),
            serverStatus = ServerConnectionStatus.Connected,
            uploadStatus = UploadStatus.Ready,
            isOpeningScanner = false,
            scanError = null,
            onScanClick = {},
            onRetryServerClick = {},
            onReceiptClick = {},
        )
    }
}
