package com.adamaho.goho.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Immutable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.adamaho.goho.R

// Static Geist weights keep typography consistent on Android API 24 and newer.
val Geist =
    FontFamily(
        Font(R.font.geist_regular, FontWeight.Normal),
        Font(R.font.geist_medium, FontWeight.Medium),
        Font(R.font.geist_semibold, FontWeight.SemiBold),
    )

private const val PROPORTIONAL_NUMBERS = "'tnum' 0, 'pnum' 1"

@Immutable
data class GohoTypography(
    val display: TextStyle,
    val heroCurrencyCode: TextStyle,
    val currencyCode: TextStyle,
    val itemTotalLabel: TextStyle,
    val itemTotalValue: TextStyle,
    val title: TextStyle,
    val statusTitle: TextStyle,
    val sheetMerchant: TextStyle,
    val screenTitle: TextStyle,
    val wordmark: TextStyle,
    val rowTitle: TextStyle,
    val button: TextStyle,
    val buttonSecondary: TextStyle,
    val listRow: TextStyle,
    val listValue: TextStyle,
    val body: TextStyle,
    val meta: TextStyle,
    val timestamp: TextStyle,
    val section: TextStyle,
    val segment: TextStyle,
    val label: TextStyle,
)

val GohoType =
    GohoTypography(
        statusTitle =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.SemiBold,
                fontSize = 20.sp,
                lineHeight = 26.sp,
                letterSpacing = (-0.02).em,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        display =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.SemiBold,
                fontSize = 44.sp,
                lineHeight = 48.sp,
                letterSpacing = (-0.035).em,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        itemTotalLabel =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
                lineHeight = 20.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        itemTotalValue =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.SemiBold,
                fontSize = 17.sp,
                lineHeight = 22.sp,
                letterSpacing = (-0.01).em,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        heroCurrencyCode =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.SemiBold,
                fontSize = 20.sp,
                lineHeight = 26.sp,
                letterSpacing = 0.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        currencyCode =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.Medium,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                letterSpacing = 0.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        sheetMerchant =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.SemiBold,
                fontSize = 18.sp,
                lineHeight = 24.sp,
                letterSpacing = (-0.015).em,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        title =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.SemiBold,
                fontSize = 22.sp,
                lineHeight = 28.sp,
                letterSpacing = (-0.025).em,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        screenTitle =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.SemiBold,
                fontSize = 24.sp,
                lineHeight = 30.sp,
                letterSpacing = (-0.015).em,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        buttonSecondary =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.Medium,
                fontSize = 16.sp,
                lineHeight = 20.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        wordmark =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.SemiBold,
                fontSize = 32.sp,
                lineHeight = 36.sp,
                letterSpacing = (-0.035).em,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        timestamp =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.Normal,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                letterSpacing = 0.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        rowTitle =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.Medium,
                fontSize = 16.sp,
                lineHeight = 22.sp,
                letterSpacing = (-0.01).em,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        button =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.SemiBold,
                fontSize = 16.sp,
                lineHeight = 20.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        listRow =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.Normal,
                fontSize = 15.sp,
                lineHeight = 20.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        listValue =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.Medium,
                fontSize = 15.sp,
                lineHeight = 20.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        body =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.Normal,
                fontSize = 15.sp,
                lineHeight = 22.sp,
                letterSpacing = 0.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        meta =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.Normal,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                letterSpacing = 0.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        segment =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.Medium,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                letterSpacing = 0.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        section =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.Medium,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        label =
            TextStyle(
                fontFamily = Geist,
                fontWeight = FontWeight.Medium,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
    )

// Existing Material screens inherit Goho type while they migrate to semantic tokens.
internal val GohoMaterialTypography =
    Typography(
        displayLarge = GohoType.display,
        displayMedium = GohoType.display,
        displaySmall = GohoType.display,
        headlineLarge = GohoType.wordmark,
        headlineMedium = GohoType.wordmark,
        headlineSmall = GohoType.rowTitle,
        titleLarge = GohoType.rowTitle,
        titleMedium = GohoType.rowTitle,
        titleSmall = GohoType.section,
        bodyLarge = GohoType.listRow,
        bodyMedium = GohoType.meta,
        bodySmall = GohoType.meta,
        labelLarge = GohoType.button,
        labelMedium = GohoType.label,
        labelSmall = GohoType.label,
    )
