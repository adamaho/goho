// Goho design tokens for Jetpack Compose.
// Reference implementation from the design handoff. Adjust the package name and
// font resource names to match the project, then wrap the app in GohoTheme { }.
package com.goho.ui.theme // TODO: match the app's package

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.goho.R // TODO: the app's R class

// ---------- Color ----------

@Immutable
data class GohoColors(
    val isDark: Boolean,
    val background: Color,
    val surface: Color,              // cards
    val surfaceMuted: Color,         // filter track, round icon buttons, thumbnail placeholder
    val surfaceMutedPressed: Color,  // pressed round icon button
    val segmentSelected: Color,      // selected filter segment
    val surfacePressed: Color,       // pressed row
    val skeletonBase: Color,
    val skeletonShimmer: Color,
    val photoWellCenter: Color,      // photo frame and viewer stay dark in both themes
    val photoWellEdge: Color,
    val photoControl: Color,         // expand/close buttons that sit on the photo well
    val textPrimary: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val divider: Color,
    val outline: Color,              // thumbnail border, light-mode card ring
    val shadow: Color,               // ambient/spot color for neutral shadows
    val accent: Color,
    val accentTop: Color,
    val accentPressed: Color,
    val onAccent: Color,
    val buttonSecondary: Color,
    val buttonSecondaryPressed: Color,
    val accentShadow: Color,         // spot color under the Scan button
    val accentContainer: Color,
    val onAccentContainer: Color,
    val accentShimmer: Color,
    val attention: Color,
    val attentionContainer: Color,
    val danger: Color,
    val dangerTop: Color,
    val dangerPressed: Color,
    val onDanger: Color,
    val dangerShadow: Color,
    val dangerContainer: Color,
    val onDangerContainer: Color,
    val sheet: Color,
    val grabber: Color,
    val scrim: Color,
    val highlightAlpha: Float,       // 1dp top highlight on the Scan button at rest (pressed = 55% of this)
)

private val PhotoWellCenter = Color(0xFF2A2724)
private val PhotoWellEdge = Color(0xFF0C0B0A)
private val PhotoControl = Color(0xFF1D1B19).copy(alpha = 0.78f)

val GohoDarkColors = GohoColors(
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
    danger = Color(0xFFC52B2D),
    dangerTop = Color(0xFFD33B39),
    dangerPressed = Color(0xFFB01E22),
    onDanger = Color(0xFFFFFFFF),
    dangerShadow = Color.Black,
    dangerContainer = Color(0xFF4D1C1B),
    onDangerContainer = Color(0xFFF87E79),
    sheet = Color(0xFF201E1B),
    grabber = Color(0xFF3F3D39),
    scrim = Color.Black.copy(alpha = 0.55f),
    highlightAlpha = 0.45f,
)

val GohoLightColors = GohoColors(
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
    danger = Color(0xFFBE2323),
    dangerTop = Color(0xFFCC3430),
    dangerPressed = Color(0xFFA21A1B),
    onDanger = Color(0xFFFFFFFF),
    dangerShadow = Color(0xFF6E0F0F),
    dangerContainer = Color(0xFFFFE8E7),
    onDangerContainer = Color(0xFFB7191C),
    sheet = Color(0xFFFFFFFF),
    grabber = Color(0xFFD9D6D1),
    scrim = Color(0xFF1D1A16).copy(alpha = 0.38f),
    highlightAlpha = 0.22f,
)

// ---------- Type ----------

// Bundle Manrope (Google Fonts, OFL) in res/font with these names.
val Manrope = FontFamily(
    Font(R.font.manrope_medium, FontWeight.Medium),
    Font(R.font.manrope_semibold, FontWeight.SemiBold),
    Font(R.font.manrope_bold, FontWeight.Bold),
)

private const val TNUM = "'tnum' 0, 'pnum' 1"

@Immutable
data class GohoTypography(
    val display: TextStyle,
    val title: TextStyle,
    val wordmark: TextStyle,
    val rowTitle: TextStyle,
    val button: TextStyle,
    val buttonSecondary: TextStyle,
    val listRow: TextStyle,
    val body: TextStyle,
    val listValue: TextStyle,
    val meta: TextStyle,
    val section: TextStyle,
    val label: TextStyle,
)

val GohoType = GohoTypography(
    display = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Bold, fontSize = 44.sp, lineHeight = 48.sp, letterSpacing = (-0.045).em, fontFeatureSettings = TNUM),
    title = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = (-0.03).em),
    wordmark = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Bold, fontSize = 32.sp, lineHeight = 36.sp, letterSpacing = (-0.045).em),
    rowTitle = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp, letterSpacing = (-0.015).em, fontFeatureSettings = TNUM),
    button = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Bold, fontSize = 16.sp, lineHeight = 20.sp),
    buttonSecondary = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 20.sp),
    body = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 22.sp, fontFeatureSettings = TNUM),
    listRow = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 20.sp, fontFeatureSettings = TNUM),
    listValue = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 20.sp, fontFeatureSettings = TNUM),
    meta = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp, fontFeatureSettings = TNUM),
    section = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, lineHeight = 18.sp),
    label = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, lineHeight = 16.sp, fontFeatureSettings = TNUM),
)

// ---------- Shape ----------

object GohoShapes {
    val thumb = RoundedCornerShape(8.dp)
    val button = RoundedCornerShape(16.dp)
    val card = RoundedCornerShape(20.dp)
    val fab = RoundedCornerShape(20.dp)
    val sheet = RoundedCornerShape(28.dp)
    val pill = RoundedCornerShape(percent = 50)
}

// ---------- Spacing ----------

object GohoSpacing {
    val screenMargin = 16.dp
    val textInset = 20.dp
    val textInsetFromMargin = 4.dp // textInset - screenMargin
    val cardPadding = 16.dp
    val cardVerticalPadding = 4.dp
    val rowVertical = 12.dp
    val rowMinHeight = 72.dp
    val thumbWidth = 40.dp
    val thumbHeight = 48.dp
    val thumbToText = 12.dp
    val dividerStart = 68.dp // cardPadding + thumbWidth + thumbToText
    val detailRowHeight = 47.dp
    val sectionTop = 24.dp
    val sectionLabelBottom = 8.dp
    val fabBottom = 28.dp
    val buttonGap = 10.dp
}

// ---------- Motion ----------

object GohoMotion {
    const val PRESS_SCALE = 0.03f      // scale = 1 - PRESS_SCALE * progress
    val pressTranslation = 1.dp
    val pressIn: AnimationSpec<Float> = tween(durationMillis = 90)
    val pressOut: AnimationSpec<Float> = spring(dampingRatio = 0.55f, stiffness = 700f)
    val pressOutReduced: AnimationSpec<Float> = spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = 700f)
    const val SEGMENT_MILLIS = 160
    const val SHIMMER_MILLIS = 1800
}

// ---------- Theme ----------

private val LocalGohoColors = staticCompositionLocalOf { GohoLightColors }
private val LocalGohoType = staticCompositionLocalOf { GohoType }

object GohoTheme {
    val colors: GohoColors @Composable get() = LocalGohoColors.current
    val type: GohoTypography @Composable get() = LocalGohoType.current
}

/**
 * Follows the system setting by default. The photo viewer always wraps itself in
 * GohoTheme(darkTheme = true) so photos are shown on dark in both themes.
 */
@Composable
fun GohoTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val c = if (darkTheme) GohoDarkColors else GohoLightColors
    // Map onto Material 3 so any stray M3 component (dialogs, menus, text selection) matches.
    val base = if (darkTheme) darkColorScheme() else lightColorScheme()
    val scheme = base.copy(
        primary = c.accent,
        onPrimary = c.onAccent,
        primaryContainer = c.accentContainer,
        onPrimaryContainer = c.onAccentContainer,
        background = c.background,
        onBackground = c.textPrimary,
        surface = c.surface,
        onSurface = c.textPrimary,
        surfaceVariant = c.surfaceMuted,
        onSurfaceVariant = c.textSecondary,
        surfaceContainer = c.surface,
        surfaceContainerHigh = c.surfaceMuted,
        outline = c.textTertiary,
        outlineVariant = c.divider,
        error = c.attention,
        onError = c.onAccent,
        errorContainer = c.attentionContainer,
        onErrorContainer = c.attention,
    )
    CompositionLocalProvider(
        LocalGohoColors provides c,
        LocalGohoType provides GohoType,
    ) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
