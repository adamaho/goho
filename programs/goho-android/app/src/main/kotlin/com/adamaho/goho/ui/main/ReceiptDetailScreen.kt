package com.adamaho.goho.ui.main

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Receipt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun ReceiptDetailScreen(
    receiptId: String,
    loadReceipt: suspend (String) -> Receipt?,
    loadReceiptImage: suspend (String) -> ByteArray?,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var reloadKey by remember { mutableIntStateOf(0) }
    var receipt by remember(receiptId) { mutableStateOf<Receipt?>(null) }
    var loading by remember(receiptId) { mutableStateOf(true) }
    var failed by remember(receiptId) { mutableStateOf(false) }
    var image by remember(receiptId) { mutableStateOf<ImageBitmap?>(null) }

    LaunchedEffect(receiptId, reloadKey) {
        loading = true
        failed = false
        receipt = loadReceipt(receiptId)
        failed = receipt == null
        loading = false
    }

    LaunchedEffect(receiptId) {
        image =
            loadReceiptImage(receiptId)?.let { bytes ->
                withContext(Dispatchers.Default) {
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                    val largestDimension = maxOf(bounds.outWidth, bounds.outHeight)
                    if (largestDimension <= 0) return@withContext null
                    val sampleSize =
                        generateSequence(1) { it * 2 }.first { largestDimension / it <= 1600 }
                    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)?.asImageBitmap()
                }
            }
    }

    LazyColumn(
        modifier = modifier.fillMaxSize().safeDrawingPadding(),
        contentPadding = PaddingValues(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Column {
                TextButton(onClick = onBack) { Text(stringResource(R.string.receipt_back)) }
                Text(
                    text = stringResource(R.string.receipt_detail_title),
                    style = MaterialTheme.typography.headlineLarge,
                )
            }
        }

        if (loading) {
            item { CircularProgressIndicator() }
        } else if (failed) {
            item {
                Column {
                    Text(
                        text = stringResource(R.string.receipt_detail_load_failed),
                        color = MaterialTheme.colorScheme.error,
                    )
                    TextButton(onClick = { reloadKey++ }) {
                        Text(stringResource(R.string.receipt_detail_retry))
                    }
                }
            }
        } else {
            receipt?.let { savedReceipt ->
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = savedReceipt.storeName,
                            style = MaterialTheme.typography.headlineSmall,
                        )
                        Text(
                            text = savedReceipt.receiptDate,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = savedReceipt.category,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                image?.let { bitmap ->
                    item {
                        Image(
                            bitmap = bitmap,
                            contentDescription = stringResource(R.string.receipt_image_description),
                            modifier = Modifier.fillMaxWidth().heightIn(max = 440.dp),
                            contentScale = ContentScale.Fit,
                        )
                    }
                }
                item {
                    Text(
                        text = stringResource(R.string.receipt_items_title),
                        style = MaterialTheme.typography.titleLarge,
                    )
                }
                if (savedReceipt.items.isEmpty()) {
                    item { Text(stringResource(R.string.receipt_items_empty)) }
                } else {
                    items(savedReceipt.items, key = { it.position }) { receiptItem ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            Text(
                                text = receiptItem.name,
                                modifier = Modifier.weight(1f),
                            )
                            Text(text = receiptItem.amount)
                        }
                        HorizontalDivider()
                    }
                }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        ReceiptAmountRow(
                            label = stringResource(R.string.receipt_subtotal),
                            amount = savedReceipt.subtotal,
                        )
                        ReceiptAmountRow(
                            label = stringResource(R.string.receipt_tax),
                            amount = savedReceipt.tax,
                        )
                        ReceiptAmountRow(
                            label = stringResource(R.string.receipt_total),
                            amount =
                                listOfNotNull(savedReceipt.total, savedReceipt.currency)
                                    .joinToString(" "),
                            prominent = true,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ReceiptAmountRow(label: String, amount: String, prominent: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        val style =
            if (prominent) MaterialTheme.typography.titleMedium
            else MaterialTheme.typography.bodyLarge
        Text(text = label, style = style)
        Text(text = amount, style = style)
    }
}
