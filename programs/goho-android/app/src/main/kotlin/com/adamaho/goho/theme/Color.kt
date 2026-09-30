package com.adamaho.goho.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

@Immutable
data class GohoColors(
    val isDark: Boolean,
    val background: Color,
    val surface: Color, // cards
    val surfaceMuted: Color, // filter track, round icon buttons, thumbnail placeholder
    val surfaceMutedPressed: Color, // pressed round icon button
    val segmentSelected: Color, // selected filter segment
    val surfacePressed: Color, // pressed row
    val skeletonBase: Color,
    val skeletonShimmer: Color,
    val photoWellCenter: Color, // photo frame and viewer stay dark in both themes
    val photoWellEdge: Color,
    val photoControl: Color, // expand/close buttons that sit on the photo well
    val textPrimary: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val divider: Color,
    val outline: Color, // thumbnail border, light-mode card ring
    val shadow: Color, // ambient/spot color for neutral shadows
    val accent: Color,
    val accentTop: Color,
    val accentPressed: Color,
    val onAccent: Color,
    val buttonSecondary: Color,
    val buttonSecondaryPressed: Color,
    val accentShadow: Color, // spot color under the Scan button
    val accentContainer: Color,
    val onAccentContainer: Color,
    val accentShimmer: Color,
    val attention: Color,
    val attentionContainer: Color,
    // Scan button top highlight at rest; pressed uses 55% of this alpha.
    val highlightAlpha: Float,
)

private val PhotoWellCenter = Color(0xFF2A2724)
private val PhotoWellEdge = Color(0xFF0C0B0A)
private val PhotoControl = Color(0xFF1D1B19).copy(alpha = 0.78f)

val GohoDarkColors =
    GohoColors(
        isDark = true,
        background = Color(0xFF13110F),
        surface = Color(0xFF1D1B19),
        surfaceMuted = Color(0xFF1D1B19),
        surfaceMutedPressed = Color(0xFF2B2925),
        segmentSelected = Color(0xFF2B2925),
        surfacePressed = Color(0xFF24221F),
        skeletonBase = Color(0xFF2B2925),
        skeletonShimmer = Color(0xFF3A3733),
        photoWellCenter = PhotoWellCenter,
        photoWellEdge = PhotoWellEdge,
        photoControl = PhotoControl,
        textPrimary = Color(0xFFF0EEEB),
        textSecondary = Color(0xFFB7B4AF),
        textTertiary = Color(0xFF928F88),
        divider = Color.White.copy(alpha = 0.05f),
        outline = Color.White.copy(alpha = 0.06f),
        shadow = Color.Black,
        accent = Color(0xFF74D3B6),
        accentTop = Color(0xFF89E2C7),
        accentPressed = Color(0xFF60BFA4),
        onAccent = Color(0xFF081D17),
        buttonSecondary = Color(0xFF2B2925),
        buttonSecondaryPressed = Color(0xFF24221F),
        accentShadow = Color.Black,
        accentContainer = Color(0xFF1A342C),
        onAccentContainer = Color(0xFF74D3B6),
        accentShimmer = Color(0xFFD6F4EA),
        attention = Color(0xFFED9658),
        attentionContainer = Color(0xFF3F2717),
        highlightAlpha = 0.45f,
    )

val GohoLightColors =
    GohoColors(
        isDark = false,
        background = Color(0xFFF8F6F4),
        surface = Color(0xFFFFFFFF),
        surfaceMuted = Color(0xFFEEECE9),
        surfaceMutedPressed = Color(0xFFE3E1DD),
        segmentSelected = Color(0xFFFFFFFF),
        surfacePressed = Color(0xFFF5F3F0),
        skeletonBase = Color(0xFFEBE9E6),
        skeletonShimmer = Color(0xFFF8F6F4),
        photoWellCenter = PhotoWellCenter,
        photoWellEdge = PhotoWellEdge,
        photoControl = PhotoControl,
        textPrimary = Color(0xFF1D1A16),
        textSecondary = Color(0xFF58554F),
        textTertiary = Color(0xFF726E67),
        divider = Color(0xFF1D1A16).copy(alpha = 0.06f),
        outline = Color(0xFF1D1A16).copy(alpha = 0.08f),
        shadow = Color(0xFF1D1A16),
        accent = Color(0xFF207963),
        accentTop = Color(0xFF2D846D),
        accentPressed = Color(0xFF136A55),
        onAccent = Color(0xFFFFFFFF),
        buttonSecondary = Color(0xFFEEECE9),
        buttonSecondaryPressed = Color(0xFFE3E1DD),
        accentShadow = Color(0xFF104638),
        accentContainer = Color(0xFFDAF4EA),
        onAccentContainer = Color(0xFF045B48),
        accentShimmer = Color(0xFF53B397),
        attention = Color(0xFFA34D16),
        attentionContainer = Color(0xFFFFEADC),
        highlightAlpha = 0.22f,
    )
