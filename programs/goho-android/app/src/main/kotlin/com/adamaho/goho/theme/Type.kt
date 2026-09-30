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

val Manrope =
    FontFamily(
        Font(R.font.manrope_medium, FontWeight.Medium),
        Font(R.font.manrope_semibold, FontWeight.SemiBold),
        Font(R.font.manrope_bold, FontWeight.Bold),
    )

private const val PROPORTIONAL_NUMBERS = "'tnum' 0, 'pnum' 1"

@Immutable
data class GohoTypography(
    val display: TextStyle,
    val currencyPrefix: TextStyle,
    val title: TextStyle,
    val screenTitle: TextStyle,
    val wordmark: TextStyle,
    val rowTitle: TextStyle,
    val button: TextStyle,
    val buttonSecondary: TextStyle,
    val listRow: TextStyle,
    val listValue: TextStyle,
    val meta: TextStyle,
    val timestamp: TextStyle,
    val section: TextStyle,
    val segment: TextStyle,
    val label: TextStyle,
)

val GohoType =
    GohoTypography(
        display =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.Bold,
                fontSize = 44.sp,
                lineHeight = 48.sp,
                letterSpacing = (-0.045).em,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        currencyPrefix =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.Bold,
                fontSize = 28.sp,
                lineHeight = 36.sp,
                letterSpacing = (-0.03).em,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        title =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.Bold,
                fontSize = 22.sp,
                lineHeight = 28.sp,
                letterSpacing = (-0.03).em,
            ),
        screenTitle =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.Bold,
                fontSize = 24.sp,
                lineHeight = 30.sp,
                letterSpacing = (-0.015).em,
            ),
        buttonSecondary =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.SemiBold,
                fontSize = 16.sp,
                lineHeight = 20.sp,
            ),
        wordmark =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.Bold,
                fontSize = 32.sp,
                lineHeight = 36.sp,
                letterSpacing = (-0.045).em,
            ),
        timestamp =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.Medium,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                letterSpacing = 0.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        rowTitle =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.SemiBold,
                fontSize = 16.sp,
                lineHeight = 22.sp,
                letterSpacing = (-0.015).em,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        button =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
                lineHeight = 20.sp,
            ),
        listRow =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.Medium,
                fontSize = 15.sp,
                lineHeight = 20.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        listValue =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
                lineHeight = 20.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        meta =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.Medium,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                letterSpacing = 0.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        segment =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                letterSpacing = 0.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        section =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                fontFeatureSettings = PROPORTIONAL_NUMBERS,
            ),
        label =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.SemiBold,
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
