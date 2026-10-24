package com.adamaho.goho.ui.main

import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.Crossfade
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.updateTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Velocity
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Book
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Delete book in the overlay footer: the initial action, its confirmation, the request, failure.
 */
internal enum class BookDeletion {
    Idle,
    Confirming,
    Deleting,
    Failed,
}

/**
 * The lifted book shared by the overlay and the Books rows. The overlay keeps a snapshot of the
 * tapped [Book], so list refreshes and polling never change or close it. While its deletion is
 * pending, nothing closes the overlay.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Stable
internal class BookOverlayState(val shared: SharedTransitionScope) {
    var reducedMotion by mutableStateOf(false)

    var book by mutableStateOf<Book?>(null)
        private set

    var open by mutableStateOf(false)
        private set

    var deletion by mutableStateOf(BookDeletion.Idle)
        private set

    /**
     * The book deleted from the overlay: the overlay fades out without the cover flying home, and
     * its row keeps the empty cover slot while it folds away.
     */
    var deletedId by mutableStateOf<String?>(null)
        private set

    val deleting
        get() = deletion == BookDeletion.Deleting

    fun open(book: Book) {
        this.book = book
        deletion = BookDeletion.Idle
        deletedId = null
        open = true
    }

    fun close() {
        if (!deleting) open = false
    }

    fun confirmDeletion() {
        if (deletion == BookDeletion.Idle) deletion = BookDeletion.Confirming
    }

    /**
     * Sends one request for the snapshot book; a failure unlocks the overlay to retry or cancel.
     */
    fun delete(scope: CoroutineScope, deleteBook: suspend (Book) -> Boolean) {
        val book = book
        if (book == null || !open || deleting) return
        deletion = BookDeletion.Deleting
        scope.launch {
            if (deleteBook(book)) {
                deletedId = book.id
                open = false
            } else deletion = BookDeletion.Failed
        }
    }

    /** Whether [bookId]'s cover is lifted out of its row. */
    fun isLifted(bookId: String) = (open && book?.id == bookId) || deletedId == bookId

    val coverBounds = BoundsTransform { _, _ ->
        tween(
            if (open) GohoMotion.BOOK_OVERLAY_OPEN_MILLIS else GohoMotion.BOOK_OVERLAY_CLOSE_MILLIS,
            easing = GohoMotion.emphasizedDecelerate,
        )
    }
}

/** Null outside [BookOverlayHost], where rows don't lift their covers. */
internal val LocalBookOverlay = compositionLocalOf<BookOverlayState?> { null }

private fun coverKey(bookId: String) = "book-cover-$bookId"

/**
 * A photo is remeasured to the flying bounds, so its crop opens out to the full image; a generated
 * cover is scaled, so its printed title doesn't reflow mid-flight.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
private fun coverResize(photo: Boolean) =
    if (photo) SharedTransitionScope.ResizeMode.RemeasureToBounds
    else SharedTransitionScope.ResizeMode.scaleToBounds()

/** Close and the footer leave over the first 30% of the close. */
private val textExitMillis =
    (GohoMotion.BOOK_OVERLAY_CLOSE_MILLIS * GohoMotion.BOOK_OVERLAY_TEXT_FRACTION).toInt()

/**
 * Hosts the book overlay above [content], including the section header and Add button. Rows and the
 * overlay share one [SharedTransitionLayout] so the cover flies between them; [content] receives
 * the action that lifts a saved book and the opacity of the screen's floating action, which gives
 * way to the overlay. [deleteBook] returns whether the server deleted it.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
internal fun BookOverlayHost(
    covers: ThumbnailCache,
    loadFullCover: suspend (String) -> ImageBitmap?,
    deleteBook: suspend (Book) -> Boolean,
    content: @Composable (openBook: (Book) -> Unit, actionAlpha: () -> Float) -> Unit,
) {
    val reduced = rememberReducedMotion()
    val scope = rememberCoroutineScope()
    SharedTransitionLayout {
        val state = remember(this) { BookOverlayState(this) }
        SideEffect { state.reducedMotion = reduced }
        // One transition presents the overlay and hides the screen's floating action, which would
        // otherwise show through the frost behind the footer.
        val presentation = updateTransition(state.open, label = "Book overlay")
        val actionAlpha by
            presentation.animateFloat(
                transitionSpec = {
                    when {
                        // Gone at once; back as the overlay finishes fading.
                        reduced ->
                            if (targetState) snap()
                            else snap(GohoMotion.BOOK_OVERLAY_REDUCED_MILLIS)
                        // Fades out under the frost.
                        targetState -> tween(GohoMotion.BOOK_OVERLAY_FROST_MILLIS)
                        // Returns with the clearing frost once the footer has left.
                        else ->
                            tween(
                                GohoMotion.BOOK_OVERLAY_CLOSE_MILLIS - textExitMillis,
                                textExitMillis,
                            )
                    }
                },
                label = "Book overlay floating action",
            ) {
                if (it) 0f else 1f
            }
        val canBlur = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        val blur by
            animateFloatAsState(
                if (state.open && canBlur) 1f else 0f,
                tween(
                    when {
                        reduced -> GohoMotion.BOOK_OVERLAY_REDUCED_MILLIS
                        state.open -> GohoMotion.BOOK_OVERLAY_FROST_MILLIS
                        else -> GohoMotion.BOOK_OVERLAY_CLOSE_MILLIS
                    }
                ),
                label = "Book overlay blur",
            )
        BackHandler(enabled = state.open, onBack = state::close)
        CompositionLocalProvider(LocalBookOverlay provides state) {
            Box(Modifier.fillMaxSize()) {
                // While the overlay is open, the screen below is blurred and hidden from
                // accessibility and focus.
                Box(
                    Modifier.fillMaxSize()
                        .then(
                            if (blur > 0f) Modifier.blur(GohoSpacing.bookOverlayBlur * blur)
                            else Modifier
                        )
                        .focusProperties { onEnter = { if (state.open) cancelFocusChange() } }
                        .focusGroup()
                        .then(if (state.open) Modifier.clearAndSetSemantics {} else Modifier)
                ) {
                    content(state::open) { actionAlpha }
                }
                presentation.AnimatedVisibility(
                    visible = { it },
                    enter =
                        if (reduced) fadeIn(tween(GohoMotion.BOOK_OVERLAY_REDUCED_MILLIS))
                        else EnterTransition.None,
                    // A deleted book has no row to fly home to, so the whole overlay fades.
                    exit =
                        when {
                            reduced -> fadeOut(tween(GohoMotion.BOOK_OVERLAY_REDUCED_MILLIS))
                            state.deletedId != null ->
                                fadeOut(tween(GohoMotion.BOOK_OVERLAY_CLOSE_MILLIS))
                            else -> ExitTransition.None
                        },
                ) {
                    state.book?.let { book ->
                        BookOverlay(book, state, this, covers, loadFullCover, canBlur) {
                            state.delete(scope, deleteBook)
                        }
                    }
                }
            }
        }
    }
}

/**
 * A saved row's cover slot: the cover leaves an empty slot while lifted and flies home on close. A
 * row that is off screen ([onScreen] false) doesn't take part, so the overlay cover fades instead.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
internal fun LiftableBookCover(
    bookId: String,
    onScreen: Boolean,
    photo: Boolean,
    content: @Composable (Modifier) -> Unit,
) {
    val state = LocalBookOverlay.current
    if (state == null || state.reducedMotion) {
        content(Modifier)
        return
    }
    with(state.shared) {
        AnimatedVisibility(
            visible = !state.isLifted(bookId),
            enter = EnterTransition.None,
            exit = ExitTransition.None,
        ) {
            content(
                if (onScreen)
                    // The overlay cover flies out alone; on close it fades over the row cover.
                    Modifier.sharedBounds(
                        rememberSharedContentState(coverKey(bookId)),
                        this,
                        enter = EnterTransition.None,
                        exit = ExitTransition.None,
                        boundsTransform = state.coverBounds,
                        resizeMode = coverResize(photo),
                    )
                else Modifier
            )
        }
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun BookOverlay(
    book: Book,
    state: BookOverlayState,
    visibility: AnimatedVisibilityScope,
    covers: ThumbnailCache,
    loadFullCover: suspend (String) -> ImageBitmap?,
    canBlur: Boolean,
    onDelete: () -> Unit,
) {
    val c = GohoTheme.colors
    val reduced = state.reducedMotion
    val thumbnail = remember(book.id) { covers.peek(book.id)?.asImageBitmap() }
    val full by
        produceState<ImageBitmap?>(null, book.id) {
            if (book.hasImage) value = loadFullCover(book.id)
        }
    var viewerOpen by remember(book.id) { mutableStateOf(false) }
    val density = LocalDensity.current
    val rise = with(density) { GohoSpacing.bookOverlayRise.roundToPx() }
    val dismissDistance = with(density) { GohoSpacing.bookOverlayDismissDistance.toPx() }
    val dismissVelocity = GohoPhotoMotion.DISMISS_VELOCITY_DP * density.density
    // Swipe down: the cover follows the finger and shrinks while the frost and text fade.
    var drag by remember { mutableFloatStateOf(0f) }
    val dragFraction = { (drag / dismissDistance).coerceIn(0f, 1f) }
    val scope = rememberCoroutineScope()
    val swipe =
        remember(state, dismissDistance, dismissVelocity) {
            object : NestedScrollConnection {
                var settle: Job? = null

                // A new drag takes over from a spring-back still settling; upward scrolling then
                // first undoes a swipe in progress.
                override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                    if (source == NestedScrollSource.UserInput) settle?.cancel()
                    if (available.y >= 0f || drag <= 0f) return Offset.Zero
                    val consumed = maxOf(available.y, -drag)
                    drag += consumed
                    return Offset(0f, consumed)
                }

                // A downward drag the content can't scroll (at the top) moves the cover, except
                // while a deletion is pending.
                override fun onPostScroll(
                    consumed: Offset,
                    available: Offset,
                    source: NestedScrollSource,
                ): Offset {
                    if (
                        source != NestedScrollSource.UserInput ||
                            available.y <= 0f ||
                            !state.open ||
                            state.deleting
                    )
                        return Offset.Zero
                    drag += available.y
                    return Offset(0f, available.y)
                }

                override suspend fun onPreFling(available: Velocity): Velocity {
                    if (drag <= 0f) return Velocity.Zero
                    if (
                        !state.deleting && (drag > dismissDistance || available.y > dismissVelocity)
                    )
                        state.close()
                    else
                        settle = scope.launch {
                            animate(drag, 0f, animationSpec = GohoPhotoMotion.settle) { value, _ ->
                                drag = value
                            }
                        }
                    return available
                }
            }
        }
    val closeFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { closeFocus.requestFocus() }
    val textDelay =
        (GohoMotion.BOOK_OVERLAY_OPEN_MILLIS * (1f - GohoMotion.BOOK_OVERLAY_TEXT_FRACTION)).toInt()
    val textMillis = GohoMotion.BOOK_OVERLAY_OPEN_MILLIS - textDelay
    // Close fades in and rises over the last 30% of the flight, and leaves first.
    val arrive =
        with(visibility) {
            if (reduced) Modifier
            else
                Modifier.animateEnterExit(
                    enter =
                        fadeIn(tween(textMillis, textDelay)) +
                            slideInVertically(tween(textMillis, textDelay)) { rise },
                    exit =
                        fadeOut(tween(textExitMillis)) +
                            slideOutVertically(tween(textExitMillis)) { rise },
                )
        }
    // Each detail line fades in and settles down into place, staggered after the cover lands.
    val settle = { index: Int ->
        with(visibility) {
            if (reduced) Modifier
            else {
                val delay =
                    GohoMotion.BOOK_OVERLAY_DETAIL_DELAY_MILLIS +
                        index * GohoMotion.BOOK_OVERLAY_DETAIL_STAGGER_MILLIS
                val spec = tween<Float>(GohoMotion.BOOK_OVERLAY_DETAIL_MILLIS, delay)
                Modifier.animateEnterExit(
                    enter =
                        fadeIn(spec) +
                            slideInVertically(
                                tween(
                                    GohoMotion.BOOK_OVERLAY_DETAIL_MILLIS,
                                    delay,
                                    GohoMotion.emphasizedDecelerate,
                                )
                            ) {
                                -rise
                            },
                    exit = fadeOut(tween(textExitMillis)),
                )
            }
        }
    }
    Box(
        Modifier.fillMaxSize().semantics {
            paneTitle = book.title
            isTraversalGroup = true
        }
    ) {
        // Frost: the theme background over the blurred screen, or more opaque without blur.
        Box(
            Modifier.fillMaxSize()
                .then(
                    with(visibility) {
                        if (reduced) Modifier
                        else
                            Modifier.animateEnterExit(
                                enter = fadeIn(tween(GohoMotion.BOOK_OVERLAY_FROST_MILLIS)),
                                exit = fadeOut(tween(GohoMotion.BOOK_OVERLAY_CLOSE_MILLIS)),
                            )
                    }
                )
                .graphicsLayer {
                    alpha = 1f - GohoMotion.BOOK_OVERLAY_DRAG_FROST_FADE * dragFraction()
                }
                .background(
                    c.background.copy(
                        alpha =
                            if (canBlur) GohoMotion.BOOK_OVERLAY_FROST_ALPHA
                            else GohoMotion.BOOK_OVERLAY_FROST_FALLBACK_ALPHA
                    )
                )
        )
        Column(
            Modifier.fillMaxSize()
                // Taps on the frost close; the cover, text and footer swallow theirs.
                .pointerInput(state) { detectTapGestures { state.close() } }
                .windowInsetsPadding(WindowInsets.safeDrawing)
        ) {
            // The cover starts 76dp below the top inset. When the cover and text are taller than
            // the space above the footer they scroll, while Close and the footer stay fixed.
            Column(
                Modifier.weight(1f)
                    .fillMaxWidth()
                    .nestedScroll(swipe)
                    .verticalScroll(rememberScrollState())
                    .padding(top = GohoSpacing.bookOverlayCoverTop),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                val image = full ?: thumbnail
                val coverModifier =
                    if (reduced) Modifier
                    else
                        with(state.shared) {
                            // Opaque for the whole flight out. On the way home it's drawn above
                            // the row cover and fades out over it (alone, when the row is off
                            // screen or its book was deleted).
                            Modifier.sharedBounds(
                                rememberSharedContentState(coverKey(book.id)),
                                visibility,
                                enter = EnterTransition.None,
                                exit = fadeOut(tween(GohoMotion.BOOK_OVERLAY_CLOSE_MILLIS)),
                                boundsTransform = state.coverBounds,
                                resizeMode = coverResize(photo = image != null),
                                zIndexInOverlay = 1f,
                            )
                        }
                Box(
                    Modifier.graphicsLayer {
                            translationY = drag
                            scaleX = 1f - (1f - GohoPhotoMotion.MIN_DRAG_SCALE) * dragFraction()
                            scaleY = scaleX
                        }
                        // A generated or still-loading cover isn't tappable and doesn't close.
                        .pointerInput(Unit) { detectTapGestures {} }
                ) {
                    if (image != null)
                        PhotoCover(image, full, !state.deleting, coverModifier) {
                            viewerOpen = true
                        }
                    else GeneratedBookCover(book, BookCoverSize.Large, coverModifier)
                }
                BookOverlayText(
                    book,
                    settle,
                    Modifier.graphicsLayer { alpha = 1f - dragFraction() }
                        .pointerInput(Unit) { detectTapGestures {} },
                )
            }
            BookOverlayFooter(
                deletion = state.deletion,
                onDeleteClick = state::confirmDeletion,
                onConfirm = onDelete,
                onCancel = state::close,
                modifier =
                    Modifier.then(arrive)
                        .graphicsLayer { alpha = 1f - dragFraction() }
                        .pointerInput(Unit) { detectTapGestures {} },
            )
        }
        IconButton(
            contentDescription = stringResource(R.string.book_close),
            onClick = state::close,
            enabled = !state.deleting,
            modifier =
                Modifier.align(Alignment.TopEnd)
                    .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top))
                    .then(arrive)
                    .graphicsLayer { alpha = 1f - dragFraction() }
                    .padding(
                        end = GohoSpacing.screenMargin,
                        top = (GohoSpacing.detailTopBarHeight - GohoSpacing.headerHeight) / 2,
                    )
                    .focusRequester(closeFocus),
        ) {
            CloseIcon()
        }
    }
    full?.let { photo ->
        if (viewerOpen)
            PhotoViewer(photo, stringResource(R.string.book_cover_description, book.title)) {
                viewerOpen = false
            }
    }
}

/**
 * A photo cover at its own aspect ratio inside the 260×292dp cover box, never cropped. The upscaled
 * thumbnail stands in until the [full] image arrives; only then does a tap open the viewer, unless
 * [enabled] is false while a deletion is pending.
 */
@Composable
private fun PhotoCover(
    image: ImageBitmap,
    full: ImageBitmap?,
    enabled: Boolean,
    modifier: Modifier,
    onOpen: () -> Unit,
) {
    val c = GohoTheme.colors
    val shape = GohoShapes.cover
    val ratio = image.width.toFloat() / image.height
    val width = minOf(GohoSpacing.bookCoverMaxWidth, GohoSpacing.bookCoverHeight * ratio)
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    val description = stringResource(R.string.book_cover_open)
    Box(
        modifier
            .pressFeedback { progress }
            .then(
                if (full != null)
                    Modifier.clickable(
                            interactionSource = interaction,
                            indication = null,
                            enabled = enabled,
                            role = Role.Button,
                            onClickLabel = description,
                            onClick = onOpen,
                        )
                        .semantics { contentDescription = description }
                else Modifier.clearAndSetSemantics {}
            )
            .bookCoverShadow(c, shape)
            .size(width, width / ratio)
            .clip(shape)
            .border(GohoSpacing.hairline, c.outline, shape)
    ) {
        Crossfade(
            image,
            animationSpec = tween(GohoMotion.BOOK_COVER_CROSSFADE_MILLIS),
            label = "Book cover",
        ) {
            Image(
                it,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@Composable
private fun BookOverlayText(book: Book, settle: (index: Int) -> Modifier, modifier: Modifier) {
    val c = GohoTheme.colors
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = GohoSpacing.bookOverlayTextSide)
            .padding(top = GohoSpacing.bookOverlayTextTop),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            book.title,
            style = GohoTheme.type.bookTitle,
            color = c.textPrimary,
            textAlign = TextAlign.Center,
            modifier = settle(0).semantics { heading() },
        )
        Text(
            book.readingLevel?.let { stringResource(R.string.book_author_level, book.author, it) }
                ?: book.author,
            style = GohoTheme.type.bookAuthor,
            color = c.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = GohoSpacing.bookOverlayAuthorTop).then(settle(1)),
        )
        CategoryTag(
            book.category,
            Modifier.padding(top = GohoSpacing.bookOverlayTagTop).then(settle(2)),
        )
    }
}
