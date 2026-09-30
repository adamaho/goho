package com.adamaho.goho.ui.main

import com.adamaho.goho.api.generated.model.*
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import java.util.UUID
import org.junit.Assert.*
import org.junit.Test

class ReceiptListModelTest {
    private val utc = ZoneId.of("UTC")

    private fun receipt(id: String = "1", date: String = "2026-09-30") =
        Receipt(
            id,
            "Merchant",
            date,
            "Shopping",
            "10",
            "0",
            "10",
            null,
            listOf(ReceiptItem(0, "Item", "10")),
        )

    private fun upload(
        status: ReceiptUploadsList200ResponseDataInner.Status =
            ReceiptUploadsList200ResponseDataInner.Status.processing,
        receiptId: String? = null,
        createdAt: String = "2026-09-30T00:30:00Z",
    ) =
        ReceiptUploadsList200ResponseDataInner(
            UUID(0, 1),
            "scan.jpg",
            ReceiptUploadsList200ResponseDataInner.ContentType.imageSlashJpeg,
            status,
            receiptId,
            null,
            createdAt,
            createdAt,
        )

    @Test
    fun completionReplacesUploadWithoutDuplicatesOrInventedTime() {
        val pending = receiptListEntries(emptyList(), listOf(upload()), utc).single()
        val completed =
            receiptListEntries(
                    listOf(receipt()),
                    listOf(upload(ReceiptUploadsList200ResponseDataInner.Status.succeeded, "1")),
                    utc,
                )
                .single()
        assertEquals(pending.key, completed.key)
        assertEquals("1", completed.receiptId)
        assertNull(completed.uploadedAt)
        assertNull(completed.currency)
        assertEquals(ReceiptListStatus.Processed, completed.status)
    }

    @Test
    fun uploadsUseLocalDateButSavedPurchaseDatesDoNotShift() {
        val entries =
            receiptListEntries(listOf(receipt()), listOf(upload()), ZoneId.of("America/Vancouver"))
        assertEquals(LocalDate.parse("2026-09-30"), entries[0].date)
        assertEquals(LocalDate.parse("2026-09-29"), entries[1].date)
        assertNull(entries[1].receiptId)
    }

    @Test
    fun failedUploadsCannotOpenReceiptDetails() {
        val entry =
            receiptListEntries(
                    emptyList(),
                    listOf(upload(ReceiptUploadsList200ResponseDataInner.Status.failed)),
                    utc,
                )
                .single()
        assertEquals(ReceiptListStatus.NotProcessed, entry.status)
        assertNull(entry.receiptId)
        assertNull(entry.total)
        assertNull(entry.merchant)
    }

    @Test
    fun groupsRespectLocaleWeekBoundaryAndYear() {
        val dates = listOf("2026-01-05", "2026-01-04", "2026-01-03", "2025-12-28")
        val entries =
            receiptListEntries(
                dates.mapIndexed { index, date -> receipt("$index", date) },
                emptyList(),
                utc,
            )
        val sections = receiptListSections(entries, LocalDate.parse("2026-01-05"), Locale.UK)
        assertEquals(
            listOf(
                ReceiptDatePeriod.Today,
                ReceiptDatePeriod.Yesterday,
                ReceiptDatePeriod.LastWeek,
                ReceiptDatePeriod.Month,
            ),
            sections.map { it.group.period },
        )
        assertEquals(2025, sections.last().group.month!!.year)
    }

    @Test
    fun groupsHaveTodayYesterdayAndEarlierThisWeekInReverseOrder() {
        val entries =
            receiptListEntries(
                listOf(
                    receipt("1", "2026-09-28"),
                    receipt("2", "2026-09-30"),
                    receipt("3", "2026-09-29"),
                ),
                emptyList(),
                utc,
            )
        assertEquals(
            listOf(
                ReceiptDatePeriod.Today,
                ReceiptDatePeriod.Yesterday,
                ReceiptDatePeriod.ThisWeek,
            ),
            receiptListSections(entries, LocalDate.parse("2026-09-30"), Locale.CANADA).map {
                it.group.period
            },
        )
    }

    @Test
    fun amountFormattingPreservesPrecisionAndDoesNotGuessCurrency() {
        assertEquals("46.78", receiptAmount("46.78", null, Locale.US))
        assertEquals("1,234.56789", receiptAmount("1234.56789", "CAD", Locale.US))
        assertEquals("-10.00", receiptAmount("-1E+1", "ZZZ", Locale.US))
        assertEquals("123", receiptAmount("123", "JPY", Locale.US))
        assertEquals("1.234,50", receiptAmount("1234.5", "EUR", Locale.GERMANY))
        assertEquals(
            "9,007,199,254,740,993.01",
            receiptAmount("9007199254740993.01", null, Locale.US),
        )
    }

    @Test
    fun uploadDatesAcceptPostgresAndIsoOffsetFormsWithoutInventingDates() {
        val expected = java.time.Instant.parse("2026-09-30T00:30:00.123456Z")
        assertEquals(expected, receiptUploadInstant("2026-09-30 00:30:00.123456+00"))
        assertEquals(expected, receiptUploadInstant("2026-09-30T00:30:00.123456+00:00"))
        assertEquals(expected, receiptUploadInstant("2026-09-29 17:30:00.123456-07"))
        assertEquals(expected, receiptUploadInstant("2026-09-30T06:00:00.123456+05:30"))
        assertNull(receiptUploadInstant("not a timestamp"))
        assertNull(receiptUploadInstant("2026-09-30 00:30:00"))
    }
}
