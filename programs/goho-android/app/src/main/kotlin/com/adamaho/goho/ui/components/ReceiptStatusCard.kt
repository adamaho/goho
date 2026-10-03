package com.adamaho.goho.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextAlign
import com.adamaho.goho.theme.*

@Composable
internal fun ReceiptStatusCard(
    @DrawableRes illustration: Int,
    title: String,
    description: String,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
) {
    val c = GohoTheme.colors
    Column(
        modifier
            .fillMaxWidth()
            .clip(GohoShapes.statusCard)
            .background(c.statusCard)
            .border(GohoSpacing.hairline, c.statusCardRing, GohoShapes.statusCard)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite }
            .padding(
                start = GohoSpacing.statusCardSide,
                end = GohoSpacing.statusCardSide,
                top = GohoSpacing.statusCardTop,
                bottom =
                    if (action == null) GohoSpacing.statusCardBottom
                    else GohoSpacing.statusCardActionBottom,
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Image(
            painterResource(illustration),
            contentDescription = null,
            modifier =
                Modifier.widthIn(max = GohoSpacing.statusIllustrationWidth)
                    .fillMaxWidth()
                    .aspectRatio(
                        GohoSpacing.statusIllustrationWidth / GohoSpacing.statusIllustrationHeight
                    ),
        )
        Spacer(Modifier.height(GohoSpacing.statusTitleTop))
        Text(
            title,
            style = GohoTheme.type.statusTitle,
            color = c.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(GohoSpacing.statusBodyTop))
        Text(
            description,
            style = GohoTheme.type.body,
            color = c.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = GohoSpacing.statusBodyMaxWidth),
        )
        if (action != null) {
            Spacer(Modifier.height(GohoSpacing.statusActionTop))
            action()
        }
    }
}
