package com.adamaho.goho.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import com.adamaho.goho.R
import com.adamaho.goho.theme.*

@Composable
internal fun ReceiptBackButton(onClick: () -> Unit) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    val description = stringResource(R.string.receipt_back)
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    Box(
        Modifier.size(GohoSpacing.headerHeight)
            .gohoPress { progress }
            .clip(GohoShapes.pill)
            .background(lerp(c.surfaceMuted, c.surfaceMutedPressed, progress.coerceIn(0f, 1f)))
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(GohoSpacing.detailBackIcon)) {
            fun point(x: Float, y: Float) =
                Offset(size.width * (if (rtl) 1f - x else x), size.height * y)
            fun line(x1: Float, y1: Float, x2: Float, y2: Float) =
                drawLine(
                    c.textPrimary,
                    point(x1, y1),
                    point(x2, y2),
                    GohoSpacing.iconStroke.toPx(),
                    StrokeCap.Round,
                )
            line(0.18f, 0.5f, 0.82f, 0.5f)
            line(0.18f, 0.5f, 0.46f, 0.22f)
            line(0.18f, 0.5f, 0.46f, 0.78f)
        }
    }
}

@Composable
internal fun ReceiptDetailPhoto(image: ImageBitmap?, loading: Boolean, onOpen: () -> Unit) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    val description = stringResource(R.string.receipt_photo_open)
    BoxWithConstraints(
        Modifier.fillMaxWidth()
            .height(GohoSpacing.detailPhotoHeight)
            .gohoPress { progress }
            .then(
                if (image != null)
                    Modifier.clickable(
                            interactionSource = interaction,
                            indication = null,
                            role = Role.Button,
                            onClickLabel = description,
                            onClick = onOpen,
                        )
                        .semantics { contentDescription = description }
                else Modifier
            )
            .clip(GohoShapes.card)
            .background(Brush.radialGradient(listOf(c.photoWellCenter, c.photoWellEdge))),
        contentAlignment = Alignment.Center,
    ) {
        if (image != null) {
            val ratio = image.width.toFloat() / image.height
            val width =
                minOf(
                    maxWidth - GohoSpacing.photoPadding * 2,
                    (maxHeight - GohoSpacing.photoPadding * 2) * ratio,
                )
            Image(
                image,
                null,
                Modifier.size(width, width / ratio)
                    .shadow(
                        GohoSpacing.photoElevation,
                        ambientColor = Color.Black,
                        spotColor = Color.Black,
                    ),
                contentScale = ContentScale.Fit,
            )
        } else {
            Text(
                stringResource(
                    if (loading) R.string.receipt_photo_loading else R.string.receipt_photo_missing
                ),
                style = GohoTheme.type.meta,
                color = GohoDarkColors.textSecondary,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
internal fun ReceiptDetailRow(label: String, value: String, stacked: Boolean) {
    val c = GohoTheme.colors
    val contentModifier =
        Modifier.fillMaxWidth()
            .heightIn(min = GohoSpacing.detailRowHeight)
            .padding(horizontal = GohoSpacing.cardPadding, vertical = GohoSpacing.detailRowVertical)
            .semantics(mergeDescendants = true) {}
    if (stacked) {
        Column(contentModifier, verticalArrangement = Arrangement.spacedBy(GohoSpacing.lineGap)) {
            Text(label, style = GohoTheme.type.listRow, color = c.textSecondary)
            Text(value, style = GohoTheme.type.listValue, color = c.textPrimary)
        }
    } else {
        Row(
            contentModifier,
            horizontalArrangement = Arrangement.spacedBy(GohoSpacing.contentGap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                label,
                Modifier.weight(0.36f),
                style = GohoTheme.type.listRow,
                color = c.textSecondary,
            )
            Text(
                value,
                Modifier.weight(0.64f),
                style = GohoTheme.type.listValue,
                color = c.textPrimary,
                textAlign = TextAlign.End,
            )
        }
    }
}

@Composable
internal fun ReceiptDetailDivider() {
    Box(
        Modifier.fillMaxWidth()
            .padding(horizontal = GohoSpacing.cardPadding)
            .height(GohoSpacing.hairline)
            .background(GohoTheme.colors.divider)
    )
}
