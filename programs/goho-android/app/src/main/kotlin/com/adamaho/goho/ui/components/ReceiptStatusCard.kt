package com.adamaho.goho.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
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
    animateEntrance: Boolean = true,
    announcePolitely: Boolean = false,
    showCard: Boolean = true,
    action: (@Composable () -> Unit)? = null,
) {
    val c = GohoTheme.colors
    val reducedMotion = rememberReducedMotion()
    val entrance = remember { Animatable(if (reducedMotion || !animateEntrance) 1f else 0f) }
    LaunchedEffect(reducedMotion, animateEntrance) {
        if (reducedMotion || !animateEntrance) entrance.snapTo(1f)
        else entrance.animateTo(1f, tween(GohoMotion.STATUS_ENTER_MILLIS))
    }
    Column(
        modifier
            .fillMaxWidth()
            .graphicsLayer {
                val progress = if (reducedMotion || !animateEntrance) 1f else entrance.value
                alpha = progress
                translationY = GohoMotion.statusEnterTranslation.toPx() * (1f - progress)
            }
            .then(
                if (showCard)
                    Modifier.clip(GohoShapes.statusCard)
                        .background(c.statusCard)
                        .border(GohoSpacing.hairline, c.statusCardRing, GohoShapes.statusCard)
                else Modifier
            )
            .semantics(mergeDescendants = true) {
                if (announcePolitely) liveRegion = LiveRegionMode.Polite
            }
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
            contentScale = ContentScale.Fit,
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
