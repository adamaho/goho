package com.adamaho.goho.ui.main

import android.app.Activity
import android.content.res.Configuration
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.tooling.preview.Preview
import androidx.core.view.WindowCompat
import com.adamaho.goho.api.generated.model.*
import com.adamaho.goho.theme.GohoTheme
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

private val previewTime = Instant.parse("2026-09-30T12:00:00Z")

private val shopping =
    Category("1", "shopping", "shopping", Category.Color.purple, setOf(CategoryKind.receipt))

private fun receipt(id: String, merchant: String, date: String, total: String, currency: String) =
    Receipt(
        id,
        merchant,
        date,
        total,
        "0",
        total,
        currency,
        listOf(shopping),
        listOf(ReceiptItem(id, 0, "Purchase", total, shopping)),
    )

private fun upload(id: Int, status: ReceiptUploadsList200ResponseDataInner.Status, time: String) =
    ReceiptUploadsList200ResponseDataInner(
        UUID(0, id.toLong()),
        "scan.jpg",
        ReceiptUploadsList200ResponseDataInner.ContentType.imageSlashJpeg,
        status,
        null,
        if (status == ReceiptUploadsList200ResponseDataInner.Status.failed)
            ReceiptUploadsList200ResponseDataInner.FailureCode.processing_failed
        else null,
        time,
        time,
    )

internal val receiptListPreviewState =
    ReceiptOverviewState(
        uploads =
            listOf(
                upload(
                    1,
                    ReceiptUploadsList200ResponseDataInner.Status.processing,
                    "2026-09-30 11:59:50.123456+00",
                ),
                upload(
                    2,
                    ReceiptUploadsList200ResponseDataInner.Status.failed,
                    "2026-09-30 10:41:00+00",
                ),
            ),
        receipts =
            listOf(
                receipt("1", "Cedar Hardware", "2026-09-25", "46.78", "CAD"),
                receipt("2", "Northside Market", "2026-09-24", "52.70", "CAD"),
                receipt("3", "Paper & Pine", "2026-09-22", "19.95", "USD"),
            ),
        hasLoaded = true,
    )

@Composable
private fun ListPreview(state: ReceiptOverviewState) {
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
        ReceiptsPreviewScreen(state, previewTime)
    }
}

/** The Receipts section with its shared title and Add button, without server images. */
@Composable
internal fun ReceiptsPreviewScreen(state: ReceiptOverviewState, previewTime: Instant? = null) {
    SectionScreen(
        section = Section.Receipts,
        onSectionChange = {},
        receiptCount =
            if (state.hasLoaded)
                receiptListEntries(state.receipts, state.uploads, ZoneId.systemDefault()).size
            else null,
        bookCount = null,
        isOpeningScanner = false,
        onScanBook = {},
        onScanReceipt = {},
    ) { menuOpen ->
        ReceiptOverview(
            state,
            {},
            {},
            remember { ThumbnailCache { null } },
            menuOpen = menuOpen,
            previewTime = previewTime,
        )
    }
}

@Preview(name = "Light", uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(name = "Dark", uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(name = "Large text", fontScale = 1.5f)
@Composable
fun ReceiptListPreview() = ListPreview(receiptListPreviewState)

@Preview
@Composable
fun ReceiptListEmptyPreview() = ListPreview(ReceiptOverviewState(hasLoaded = true))

@Preview @Composable fun ReceiptListErrorPreview() = ListPreview(ReceiptOverviewState(error = true))

@Preview
@Composable
fun ReceiptListLoadingPreview() = ListPreview(ReceiptOverviewState(loading = true))
