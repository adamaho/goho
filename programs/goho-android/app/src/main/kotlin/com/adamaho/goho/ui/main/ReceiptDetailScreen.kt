package com.adamaho.goho.ui.main

import android.graphics.BitmapFactory
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
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
import java.time.ZoneId
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
    deleteReceipt: suspend (ReceiptListEntry) -> Boolean,
    modifier: Modifier = Modifier,
) {
    var optionsOpen by rememberSaveable(receiptId) { mutableStateOf(false) }
    var photoOpen by rememberSaveable(receiptId) { mutableStateOf(false) }
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
                        generateSequence(1) { it * 2 }
                            .first {
                                largestDimension / it <= 4096 &&
                                    bounds.outWidth.toLong() * bounds.outHeight / it / it <=
                                        8_000_000
                            }
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
        Row(
            Modifier.fillMaxWidth()
                .heightIn(min = GohoSpacing.detailTopBarHeight)
                .padding(horizontal = GohoSpacing.screenMargin),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ReceiptBackButton(onBack)
            if (!loading && receipt != null) ReceiptMoreButton { optionsOpen = true }
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
            val code = saved.currency
            val currency = runCatching { Currency.getInstance(code) }.getOrNull()
            // There is no home-currency setting in the API; use the phone locale for presentation.
            val homeCurrency = runCatching { Currency.getInstance(locale).currencyCode }.getOrNull()
            val foreign = code != homeCurrency
            val prefix = currency?.getSymbol(locale) ?: code
            val amount = receiptAmount(saved.total, locale)
            fun withCurrency(value: String) = "$prefix $value"
            val total = withCurrency(amount)
            val merchant = saved.storeName.ifBlank { stringResource(R.string.receipt_unknown) }
            val rows = buildList {
                add(stringResource(R.string.receipt_merchant) to merchant)
                add(stringResource(R.string.receipt_date) to shortDate)
                if (saved.category.isNotBlank())
                    add(stringResource(R.string.receipt_category) to saved.category)
                add(
                    stringResource(R.string.receipt_subtotal) to
                        withCurrency(receiptAmount(saved.subtotal, locale))
                )
                add(
                    stringResource(R.string.receipt_tax) to
                        withCurrency(receiptAmount(saved.tax, locale))
                )
                if (saved.items.isEmpty()) add(stringResource(R.string.receipt_total) to total)
                if (foreign)
                    add(
                        stringResource(R.string.receipt_currency) to
                            (currency?.getDisplayName(locale) ?: code)
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
                                withStyle(
                                    (if (foreign) GohoTheme.type.currencyPrefix
                                        else GohoTheme.type.display)
                                        .copy(
                                            color = if (foreign) c.textTertiary else c.textPrimary
                                        )
                                        .toSpanStyle()
                                ) {
                                    append(prefix)
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
                        ReceiptDetailPhoto(image, imageLoading) { photoOpen = true }
                    }
                }
                if (saved.items.isNotEmpty()) {
                    item("items") {
                        DetailSectionHeading(stringResource(R.string.receipt_items_title))
                        ReceiptItemsCard(
                            saved.items.sortedBy { it.position },
                            amount,
                            prefix,
                            foreign,
                            locale,
                            stacked,
                        )
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
            }
        }
    }
    val saved = receipt
    if (optionsOpen && !loading && saved != null) {
        val zone = ZoneId.systemDefault()
        val entry =
            remember(saved, zone) { receiptListEntries(listOf(saved), emptyList(), zone).single() }
        ReceiptOptions(
            entry = entry,
            locale = locale,
            today = LocalDate.now(zone),
            zone = zone,
            thumbnail = {
                ReceiptThumbnail(image, ReceiptListStatus.Processed, sheetHeader = true)
            },
            onDelete = { deleteReceipt(entry) },
            onDismiss = { optionsOpen = false },
            onDeleted = {
                optionsOpen = false
                onBack()
            },
        )
    }
    image?.let { photo ->
        if (photoOpen) ReceiptPhotoViewer(photo, receipt?.storeName.orEmpty()) { photoOpen = false }
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
