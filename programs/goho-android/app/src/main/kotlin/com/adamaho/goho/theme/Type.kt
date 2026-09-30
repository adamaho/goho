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

private const val TNUM = "tnum"

@Immutable
data class GohoTypography(
    val display: TextStyle,
    val wordmark: TextStyle,
    val rowTitle: TextStyle,
    val button: TextStyle,
    val listRow: TextStyle,
    val listValue: TextStyle,
    val meta: TextStyle,
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
                fontFeatureSettings = TNUM,
            ),
        wordmark =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.Bold,
                fontSize = 32.sp,
                lineHeight = 36.sp,
                letterSpacing = (-0.045).em,
            ),
        rowTitle =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.SemiBold,
                fontSize = 16.sp,
                lineHeight = 22.sp,
                letterSpacing = (-0.015).em,
                fontFeatureSettings = TNUM,
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
                fontFeatureSettings = TNUM,
            ),
        listValue =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
                lineHeight = 20.sp,
                fontFeatureSettings = TNUM,
            ),
        meta =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.Medium,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                fontFeatureSettings = TNUM,
            ),
        segment =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            ),
        section =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                fontFeatureSettings = TNUM,
            ),
        label =
            TextStyle(
                fontFamily = Manrope,
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                fontFeatureSettings = TNUM,
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
