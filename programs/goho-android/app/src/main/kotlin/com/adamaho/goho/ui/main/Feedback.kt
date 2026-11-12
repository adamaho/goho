package com.adamaho.goho.ui.main

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow

/** A background failure reported once its server outcome has been reconciled. */
internal sealed interface FeedbackMessage {
    data class DeletionFailed(val kind: DeletionKind) : FeedbackMessage

    /** Another book already has this title and [author]; Edit reopens the form with it. */
    data class AuthorConflict(val bookId: String, val author: String) : FeedbackMessage

    /** [author] wasn't saved; Try again sends it again. */
    data class AuthorFailed(val bookId: String, val author: String, val offline: Boolean) :
        FeedbackMessage

    /**
     * Add recipe's link [url] wasn't accepted, or no answer arrived; Try again sends it as a new
     * import. [attempt] identifies the failed send, so two failures of one link stay distinct.
     */
    data class RecipeImportFailed(val attempt: Long, val url: String, val offline: Boolean) :
        FeedbackMessage

    /** A picked recipe photo wasn't added; picking it again is the only retry. */
    data class RecipePhotoFailed(val problem: RecipePhotoProblem) : FeedbackMessage
}

/**
 * The app's one queue of snackbar messages, owned by the activity so a failure still reaches the
 * shared snackbar after the sheet, overlay or details that started the request have left.
 */
internal class Feedback {
    private val queue = Channel<FeedbackMessage>(Channel.UNLIMITED)
    val messages = queue.receiveAsFlow()

    fun send(message: FeedbackMessage) {
        queue.trySend(message)
    }
}
