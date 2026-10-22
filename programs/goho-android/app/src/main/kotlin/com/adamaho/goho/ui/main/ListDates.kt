package com.adamaho.goho.ui.main

import android.text.format.DateFormat
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay

/** Keeps relative list dates current; previews pass a fixed time instead. */
@Composable
internal fun rememberClock(previewTime: Instant? = null): State<Instant> =
    produceState(initialValue = previewTime ?: Instant.now(), previewTime) {
        if (previewTime == null)
            while (true) {
                value = Instant.now()
                delay(30_000)
            }
    }

/** Today, Yesterday, or a short weekday date that adds the year outside the current one. */
@Composable
internal fun relativeDate(date: LocalDate, today: LocalDate, locale: Locale): String =
    when (date) {
        today -> stringResource(R.string.date_today)
        today.minusDays(1) -> stringResource(R.string.date_yesterday)
        else ->
            date.format(
                DateTimeFormatter.ofPattern(
                    DateFormat.getBestDateTimePattern(
                        locale,
                        if (date.year == today.year) "EEEMMMd" else "EEEMMMdy",
                    ),
                    locale,
                )
            )
    }
