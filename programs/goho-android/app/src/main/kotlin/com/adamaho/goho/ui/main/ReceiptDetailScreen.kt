package com.adamaho.goho.ui.main

import android.graphics.BitmapFactory
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Receipt
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Currency
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
    var image by remember(receiptId) { mutableStateOf<ImageBitmap?>(null) }
    var imageLoading by remember(receiptId) { mutableStateOf(true) }

    LaunchedEffect(receiptId, reloadKey) {
        loading = true
        receipt = loadReceipt(receiptId)
        loading = false
    }
    LaunchedEffect(receiptId, reloadKey) {
        imageLoading = true
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
        imageLoading = false
    }

    val c = GohoTheme.colors
    val config = LocalConfiguration.current
    val locale = config.locales[0]
    val stacked = config.fontScale >= 1.3f || config.screenWidthDp < GohoSpacing.compactWidth.value
    Column(modifier.fillMaxSize().background(c.background).safeDrawingPadding()) {
        Box(
            Modifier.fillMaxWidth()
                .heightIn(min = GohoSpacing.detailTopBarHeight)
                .padding(horizontal = GohoSpacing.screenMargin),
            contentAlignment = Alignment.CenterStart,
        ) {
            ReceiptBackButton(onBack)
        }
        val saved = receipt
        if (loading || saved == null) {
            Column(
                Modifier.fillMaxSize().padding(horizontal = GohoSpacing.textInset),
                verticalArrangement =
                    Arrangement.spacedBy(GohoSpacing.contentGap, Alignment.CenterVertically),
            ) {
                Text(
                    stringResource(
                        if (loading) R.string.receipt_detail_loading
                        else R.string.receipt_detail_load_failed
                    ),
                    style = GohoTheme.type.meta,
                    color = c.textSecondary,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                if (!loading)
                    GohoActionButton(
                        stringResource(R.string.receipt_detail_retry),
                        { reloadKey++ },
                        primary = false,
                    )
            }
        } else {
            val date =
                remember(saved.receiptDate) {
                    runCatching { LocalDate.parse(saved.receiptDate) }.getOrNull()
                }
            val fullDate =
                date?.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL).withLocale(locale))
                    ?: saved.receiptDate.ifBlank { "—" }
            val shortDate =
                date?.format(
                    DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale)
                ) ?: saved.receiptDate.ifBlank { "—" }
            val code = saved.currency?.takeIf { it.isNotBlank() }
            val currency = code?.let { runCatching { Currency.getInstance(it) }.getOrNull() }
            // There is no home-currency setting in the API; use the phone locale for presentation.
            val homeCurrency = runCatching { Currency.getInstance(locale).currencyCode }.getOrNull()
            val foreign = code != null && code != homeCurrency
            val prefix = if (foreign) currency?.getSymbol(locale) ?: code.orEmpty() else ""
            val amount = receiptAmount(saved.total, saved.currency, locale)
            val total = if (prefix.isEmpty()) amount else "$prefix $amount"
            val merchant = saved.storeName.ifBlank { stringResource(R.string.receipt_unknown) }
            val rows = buildList {
                add(stringResource(R.string.receipt_merchant) to merchant)
                add(stringResource(R.string.receipt_date) to shortDate)
                if (saved.category.isNotBlank())
                    add(stringResource(R.string.receipt_category) to saved.category)
                add(stringResource(R.string.receipt_total) to total)
                if (foreign)
                    add(
                        stringResource(R.string.receipt_currency) to
                            (currency?.getDisplayName(locale) ?: code.orEmpty())
                    )
            }
            LazyColumn(
                Modifier.fillMaxSize().headerFade(c.background),
                contentPadding =
                    PaddingValues(
                        start = GohoSpacing.screenMargin,
                        end = GohoSpacing.screenMargin,
                        bottom = GohoSpacing.detailBottom,
                    ),
            ) {
                item("hero") {
                    Column(
                        Modifier.fillMaxWidth()
                            .padding(horizontal = GohoSpacing.textInsetFromMargin)
                            .padding(top = GohoSpacing.contentGap),
                        verticalArrangement = Arrangement.spacedBy(GohoSpacing.detailHeroGap),
                    ) {
                        Text(
                            merchant,
                            style = GohoTheme.type.rowTitle,
                            color = c.textSecondary,
                            modifier = Modifier.semantics { heading() },
                        )
                        Text(
                            buildAnnotatedString {
                                if (prefix.isNotEmpty())
                                    withStyle(
                                        GohoTheme.type.currencyPrefix
                                            .copy(color = c.textTertiary)
                                            .toSpanStyle()
                                    ) {
                                        append("$prefix ")
                                    }
                                append(amount)
                            },
                            style = GohoTheme.type.display,
                            color = c.textPrimary,
                        )
                        Text(fullDate, style = GohoTheme.type.meta, color = c.textTertiary)
                    }
                }
                item("photo") {
                    Box(Modifier.padding(top = GohoSpacing.detailPhotoTop)) {
                        ReceiptDetailPhoto(image, imageLoading)
                    }
                }
                item("details") {
                    DetailSectionHeading(stringResource(R.string.receipt_details_section))
                    ReceiptCard {
                        rows.forEachIndexed { index, (label, value) ->
                            if (index > 0) ReceiptDetailDivider()
                            ReceiptDetailRow(label, value, stacked)
                        }
                    }
                }
                // Keep the existing item and totals content available during the layout rollout.
                item("items-heading") {
                    DetailSectionHeading(stringResource(R.string.receipt_items_title))
                }
                if (saved.items.isEmpty())
                    item("items-empty") {
                        Text(
                            stringResource(R.string.receipt_items_empty),
                            style = GohoTheme.type.meta,
                            color = c.textSecondary,
                            modifier =
                                Modifier.padding(horizontal = GohoSpacing.textInsetFromMargin),
                        )
                    }
                else
                    items(saved.items, key = { "item:${it.position}" }) { item ->
                        Column(
                            Modifier.padding(
                                horizontal = GohoSpacing.textInsetFromMargin,
                                vertical = GohoSpacing.detailRowVertical,
                            )
                        ) {
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(GohoSpacing.contentGap),
                            ) {
                                Text(
                                    item.name,
                                    Modifier.weight(1f),
                                    style = GohoTheme.type.listRow,
                                    color = c.textPrimary,
                                )
                                Text(
                                    item.amount,
                                    style = GohoTheme.type.listValue,
                                    color = c.textPrimary,
                                )
                            }
                        }
                    }
                item("totals") {
                    Column(Modifier.padding(top = GohoSpacing.contentGap)) {
                        ReceiptDetailRow(
                            stringResource(R.string.receipt_subtotal),
                            saved.subtotal,
                            stacked,
                        )
                        ReceiptDetailRow(stringResource(R.string.receipt_tax), saved.tax, stacked)
                        ReceiptDetailRow(stringResource(R.string.receipt_total), total, stacked)
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailSectionHeading(text: String) {
    Text(
        text,
        style = GohoTheme.type.section,
        color = GohoTheme.colors.textTertiary,
        modifier =
            Modifier.padding(
                    start = GohoSpacing.textInsetFromMargin,
                    top = GohoSpacing.sectionTop,
                    bottom = GohoSpacing.sectionLabelBottom,
                )
                .semantics { heading() },
    )
}
