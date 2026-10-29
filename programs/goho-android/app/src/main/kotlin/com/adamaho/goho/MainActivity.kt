package com.adamaho.goho

import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.core.content.edit
import androidx.lifecycle.lifecycleScope
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.adamaho.goho.api.generated.BookUploadsApi
import com.adamaho.goho.api.generated.BooksApi
import com.adamaho.goho.api.generated.ReceiptUploadsApi
import com.adamaho.goho.api.generated.ReceiptsApi
import com.adamaho.goho.api.generated.model.Receipt
import com.adamaho.goho.api.generated.model.ReceiptUploadsList200ResponseDataInner
import com.adamaho.goho.theme.GohoSpacing
import com.adamaho.goho.theme.GohoTheme
import com.adamaho.goho.ui.components.DeletionFeedback
import com.adamaho.goho.ui.main.BookListController
import com.adamaho.goho.ui.main.BookOverlayHost
import com.adamaho.goho.ui.main.BookOverview
import com.adamaho.goho.ui.main.DeletionKey
import com.adamaho.goho.ui.main.DeletionKind
import com.adamaho.goho.ui.main.PendingDeletions
import com.adamaho.goho.ui.main.ReceiptDetailScreen
import com.adamaho.goho.ui.main.ReceiptListEntry
import com.adamaho.goho.ui.main.ReceiptListStatus
import com.adamaho.goho.ui.main.ReceiptOverview
import com.adamaho.goho.ui.main.ReceiptOverviewState
import com.adamaho.goho.ui.main.ScanKind
import com.adamaho.goho.ui.main.ScanPreviewScreen
import com.adamaho.goho.ui.main.Section
import com.adamaho.goho.ui.main.SectionScreen
import com.adamaho.goho.ui.main.ThumbnailCache
import com.adamaho.goho.ui.main.UploadStatus
import com.adamaho.goho.ui.main.deleteAndConfirm
import com.adamaho.goho.ui.main.receiptListEntries
import com.adamaho.goho.ui.main.rememberSectionSearch
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.RESULT_FORMAT_JPEG
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.SCANNER_MODE_FULL
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable

/** The section root; the selected section is activity state, so Back does not switch sections. */
@Serializable private data object SectionRoute : NavKey

@Serializable private data class ReceiptDetailRoute(val receiptId: String) : NavKey

/** A scanned image waiting in the preview, with the kind of scan that decides its upload. */
private data class Capture(val kind: ScanKind, val imageUri: Uri)

class MainActivity : ComponentActivity() {
    private var capture by mutableStateOf<Capture?>(null)
    /** The kind of the open scanner, saved in case this activity is recreated behind it. */
    private var scannerKind: ScanKind? = null
    private var isOpeningScanner by mutableStateOf(false)
    private var uploadStatus by mutableStateOf(UploadStatus.Ready)
    private var overviewState by mutableStateOf(ReceiptOverviewState())
    private var receiptUploadToReveal by mutableStateOf<String?>(null)
    private var bookUploadToReveal by mutableStateOf<UUID?>(null)
    private var section by mutableStateOf(Section.Receipts)
    private var pollingJob: Job? = null
    private var refreshAfterCurrent = false
    private var historyRevision = 0L

    private val receiptUploadsApi by lazy { gohoApi<ReceiptUploadsApi>() }
    private val receiptsApi by lazy { gohoApi<ReceiptsApi>() }
    private val receiptThumbnails = ThumbnailCache { loadReceiptImage(it) }
    private val pendingUploads by lazy { (application as GohoApplication).pendingUploads }
    private val localPhotos = ThumbnailCache { pendingUploads.readPhoto(UUID.fromString(it)) }
    private val deletions by lazy { PendingDeletions(lifecycleScope) }
    private val books by lazy {
        BookListController(
            lifecycleScope,
            gohoApi<BooksApi>(),
            gohoApi<BookUploadsApi>(),
            deletions,
            pendingUploads,
        )
    }
    private val preferences by lazy { getSharedPreferences("goho", MODE_PRIVATE) }

    private val scannerLauncher =
        registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
            val kind = scannerKind
            scannerKind = null
            if (result.resultCode == RESULT_OK && kind != null) {
                val imageUri =
                    GmsDocumentScanningResult.fromActivityResultIntent(result.data)
                        ?.pages
                        ?.firstOrNull()
                        ?.imageUri
                if (imageUri != null) {
                    capture = Capture(kind, imageUri)
                    uploadStatus = UploadStatus.Ready
                }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        enableEdgeToEdge()
        scannerKind = savedInstanceState?.getString(SCANNER_KIND_KEY)?.let(ScanKind::valueOf)
        section =
            preferences.getString(SECTION_KEY, null)?.let { saved ->
                Section.entries.find { it.name == saved }
            } ?: Section.Receipts
        setContent {
            val backStack = rememberNavBackStack(SectionRoute)
            GohoTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    val captured = capture
                    if (captured == null) {
                        NavDisplay(
                            backStack = backStack,
                            onBack = { if (backStack.size > 1) backStack.removeLastOrNull() },
                            transitionSpec = {
                                slideInHorizontally(initialOffsetX = { it }) togetherWith
                                    slideOutHorizontally(targetOffsetX = { -it })
                            },
                            popTransitionSpec = {
                                slideInHorizontally(initialOffsetX = { -it }) togetherWith
                                    slideOutHorizontally(targetOffsetX = { it })
                            },
                            predictivePopTransitionSpec = {
                                slideInHorizontally(initialOffsetX = { -it }) togetherWith
                                    slideOutHorizontally(targetOffsetX = { it })
                            },
                            entryProvider = { route ->
                                when (route) {
                                    SectionRoute ->
                                        NavEntry(route) {
                                            val receiptState = visibleReceiptState
                                            val receiptCount =
                                                remember(receiptState) {
                                                    if (receiptState.hasLoaded)
                                                        receiptListEntries(
                                                                receiptState.receipts,
                                                                receiptState.uploads,
                                                                ZoneId.systemDefault(),
                                                                receiptState.local,
                                                            )
                                                            .size
                                                    else null
                                                }
                                            val bookState = books.visibleState
                                            val bookSearch =
                                                rememberSectionSearch(
                                                    R.string.books_search,
                                                    R.string.books_search_placeholder,
                                                )
                                            BookOverlayHost(
                                                covers = books.covers,
                                                loadFullCover = books::loadFullCover,
                                                deleteBook = { books.delete(it.id) },
                                            ) { openBook, actionAlpha ->
                                                SectionScreen(
                                                    section = section,
                                                    onSectionChange = ::selectSection,
                                                    receiptCount = receiptCount,
                                                    bookCount =
                                                        if (bookState.hasLoaded)
                                                            bookState.books.size
                                                        else null,
                                                    isOpeningScanner = isOpeningScanner,
                                                    onScanBook = { openScanner(ScanKind.Book) },
                                                    onScanReceipt = {
                                                        openScanner(ScanKind.Receipt)
                                                    },
                                                    addAlpha = actionAlpha,
                                                    search =
                                                        bookSearch.takeIf {
                                                            section == Section.Books
                                                        },
                                                    canSearch =
                                                        bookState.hasLoaded &&
                                                            bookState.books.isNotEmpty(),
                                                ) { menuOpen ->
                                                    when (section) {
                                                        Section.Receipts ->
                                                            ReceiptOverview(
                                                                state = receiptState,
                                                                menuOpen = menuOpen,
                                                                uploadToReveal =
                                                                    receiptUploadToReveal,
                                                                onUploadRevealed = {
                                                                    receiptUploadToReveal = null
                                                                },
                                                                deleteReceipt = ::deleteReceipt,
                                                                thumbnails = receiptThumbnails,
                                                                onRetryClick = { refreshHistory() },
                                                                onRefresh = {
                                                                    refreshHistory(
                                                                        userInitiated = true
                                                                    )
                                                                },
                                                                onReceiptClick = {
                                                                    backStack.add(
                                                                        ReceiptDetailRoute(it)
                                                                    )
                                                                },
                                                                localPhotos = localPhotos,
                                                                retryUpload = pendingUploads::retry,
                                                                removeUpload =
                                                                    pendingUploads::remove,
                                                            )
                                                        Section.Books ->
                                                            BookOverview(
                                                                state = bookState,
                                                                menuOpen = menuOpen,
                                                                covers = books.covers,
                                                                onRetryClick = { books.refresh() },
                                                                onRefresh = {
                                                                    books.refresh(
                                                                        userInitiated = true
                                                                    )
                                                                },
                                                                onBookClick = openBook,
                                                                deleteBook = {
                                                                    books.delete(it.id)
                                                                },
                                                                search = bookSearch,
                                                                uploadToReveal = bookUploadToReveal,
                                                                onUploadRevealed = {
                                                                    bookUploadToReveal = null
                                                                },
                                                                localPhotos = localPhotos,
                                                                retryUpload = pendingUploads::retry,
                                                                removeUpload =
                                                                    pendingUploads::remove,
                                                            )
                                                    }
                                                }
                                            }
                                        }
                                    is ReceiptDetailRoute ->
                                        NavEntry(route) {
                                            ReceiptDetailScreen(
                                                hasUpload =
                                                    if (
                                                        overviewState.hasLoaded &&
                                                            !overviewState.error
                                                    )
                                                        overviewState.uploads.any {
                                                            it.receiptId == route.receiptId
                                                        }
                                                    else null,
                                                receiptId = route.receiptId,
                                                loadReceipt = ::loadReceipt,
                                                loadReceiptImage = ::loadReceiptImage,
                                                onBack = { backStack.removeLastOrNull() },
                                                deleteReceipt = ::deleteReceipt,
                                            )
                                        }
                                    else -> error("Unknown route: $route")
                                }
                            },
                        )
                    } else {
                        ScanPreviewScreen(
                            kind = captured.kind,
                            scannedImageUri = captured.imageUri,
                            uploadStatus = uploadStatus,
                            onUploadClick = ::upload,
                            onCancelClick = {
                                if (uploadStatus != UploadStatus.Saving) {
                                    capture = null
                                    uploadStatus = UploadStatus.Ready
                                }
                            },
                        )
                    }
                    DeletionFeedback(
                        deletions,
                        Modifier.fillMaxSize()
                            .navigationBarsPadding()
                            .imePadding()
                            .padding(
                                bottom =
                                    if (captured == null && backStack.lastOrNull() == SectionRoute)
                                        GohoSpacing.fabBottom +
                                            GohoSpacing.addButton +
                                            GohoSpacing.contentGap
                                    else GohoSpacing.screenMargin
                            )
                            .wrapContentSize(Alignment.BottomCenter),
                    )
                }
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(SCANNER_KIND_KEY, scannerKind?.name)
    }

    override fun onStart() {
        super.onStart()
        refreshHistory()
        books.refresh()
        pollingJob = lifecycleScope.launch {
            launch { books.pollPendingUploads() }
            // An answered upload's list refreshes now, replacing its local row with the server's.
            launch {
                pendingUploads.refreshes.collect { kind ->
                    when (kind) {
                        ScanKind.Receipt -> refreshHistory()
                        ScanKind.Book -> books.refresh()
                    }
                }
            }
            snapshotFlow {
                overviewState.uploads.any {
                    it.status == ReceiptUploadsList200ResponseDataInner.Status.queued ||
                        it.status == ReceiptUploadsList200ResponseDataInner.Status.processing
                } || pendingUploads.acceptedIds(ScanKind.Receipt).isNotEmpty()
            }
                .collectLatest { hasPendingUploads ->
                    if (hasPendingUploads) {
                        while (true) {
                            delay(5_000)
                            if (!overviewState.loading) refreshHistory()
                        }
                    }
                }
        }
    }

    override fun onStop() {
        pollingJob?.cancel()
        pollingJob = null
        super.onStop()
    }

    private fun selectSection(next: Section) {
        section = next
        preferences.edit { putString(SECTION_KEY, next.name) }
    }

    private suspend fun loadReceipt(receiptId: String): Receipt? =
        try {
            val response = receiptsApi.receiptsGet(receiptId)
            if (response.isSuccessful) response.body()?.data else null
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w("GohoReceipts", "Receipt detail failed to load", error)
            null
        }

    private suspend fun loadReceiptImage(receiptId: String): ByteArray? =
        try {
            val response = receiptsApi.receiptsGetImage(receiptId)
            when {
                response.code() == 404 -> null
                response.isSuccessful ->
                    withContext(Dispatchers.IO) { response.body()?.use { it.bytes() } }
                else -> {
                    Log.w("GohoReceipts", "Receipt image request failed: ${response.code()}")
                    null
                }
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w("GohoReceipts", "Receipt image failed to load", error)
            null
        }

    /** Pending IDs are removed only from presentation, including counts and related scan rows. */
    private val visibleReceiptState: ReceiptOverviewState
        get() =
            overviewState.copy(
                receipts =
                    overviewState.receipts.filterNot {
                        deletions.contains(DeletionKey(DeletionKind.Receipt, it.id))
                    },
                uploads =
                    overviewState.uploads.filterNot {
                        deletions.contains(
                            DeletionKey(DeletionKind.ReceiptUpload, it.id.toString())
                        ) ||
                            (it.receiptId?.let { id ->
                                deletions.contains(DeletionKey(DeletionKind.Receipt, id))
                            } == true)
                    },
                local = pendingUploads.entries.filter { it.kind == ScanKind.Receipt },
            )

    /** Accepts confirmation immediately; network work belongs to the activity, not the sheet. */
    private suspend fun deleteReceipt(entry: ReceiptListEntry): Boolean {
        if (entry.status == ReceiptListStatus.Processing) return false
        val key =
            when {
                entry.receiptId != null -> DeletionKey(DeletionKind.Receipt, entry.receiptId)
                entry.status == ReceiptListStatus.NotProcessed && entry.uploadId != null ->
                    DeletionKey(DeletionKind.ReceiptUpload, entry.uploadId.toString())
                else -> return false
            }
        return deletions.start(key) {
            val absent =
                if (key.kind == DeletionKind.Receipt)
                    deleteAndConfirm(
                        delete = { receiptsApi.receiptsDelete(key.id) },
                        lookup = { receiptsApi.receiptsGet(key.id) },
                    )
                else {
                    val uploadId = UUID.fromString(key.id)
                    deleteAndConfirm(
                        delete = { receiptUploadsApi.receiptUploadsDelete(uploadId) },
                        lookup = { receiptUploadsApi.receiptUploadsGet(uploadId) },
                    )
                }
            if (absent) {
                historyRevision++
                overviewState =
                    overviewState.copy(
                        receipts = overviewState.receipts.filterNot { it.id == entry.receiptId },
                        uploads =
                            overviewState.uploads.filterNot {
                                it.id == entry.uploadId ||
                                    (entry.receiptId != null && it.receiptId == entry.receiptId)
                            },
                    )
            } else refreshHistory()
            absent
        }
    }

    private fun refreshHistory(userInitiated: Boolean = false) {
        if (overviewState.loading) {
            if (userInitiated) {
                // Join the in-flight request instead of scheduling a duplicate pull refresh.
                overviewState = overviewState.copy(refreshing = true, refreshError = false)
            } else refreshAfterCurrent = true
            return
        }

        val revision = historyRevision
        val accepted = pendingUploads.acceptedIds(ScanKind.Receipt)
        overviewState =
            overviewState.copy(loading = true, refreshing = userInitiated, refreshError = false)
        lifecycleScope.launch {
            try {
                val uploadsResponse = receiptUploadsApi.receiptUploadsList()
                val receiptsResponse = receiptsApi.receiptsList()
                val uploads = uploadsResponse.body()?.data
                val receipts = receiptsResponse.body()?.data
                if (revision != historyRevision) {
                    // A refresh started before a deletion must not bring the removed row back.
                    overviewState = overviewState.copy(loading = false)
                    refreshAfterCurrent = true
                    return@launch
                }
                overviewState =
                    if (
                        uploadsResponse.isSuccessful &&
                            receiptsResponse.isSuccessful &&
                            uploads != null &&
                            receipts != null
                    ) {
                        pendingUploads.reconcile(
                            ScanKind.Receipt,
                            accepted + uploads.map { it.id },
                        )
                        ReceiptOverviewState(
                            uploads = uploads,
                            receipts = receipts,
                            hasLoaded = true,
                        )
                    } else {
                        overviewState.copy(
                            loading = false,
                            refreshing = false,
                            error = !overviewState.hasLoaded,
                            refreshError = overviewState.hasLoaded,
                        )
                    }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                Log.w("GohoReceipts", "Receipt listing failed", error)
                overviewState =
                    overviewState.copy(
                        loading = false,
                        refreshing = false,
                        error = !overviewState.hasLoaded,
                        refreshError = overviewState.hasLoaded,
                    )
            } finally {
                if (refreshAfterCurrent) {
                    refreshAfterCurrent = false
                    refreshHistory(userInitiated = overviewState.refreshing)
                }
            }
        }
    }

    private fun openScanner(kind: ScanKind) {
        if (isOpeningScanner || uploadStatus == UploadStatus.Saving) return

        isOpeningScanner = true
        val options =
            GmsDocumentScannerOptions.Builder()
                .setGalleryImportAllowed(true)
                .setPageLimit(1)
                .setResultFormats(RESULT_FORMAT_JPEG)
                .setScannerMode(SCANNER_MODE_FULL)
                .build()

        GmsDocumentScanning.getClient(options)
            .getStartScanIntent(this)
            .addOnSuccessListener { intentSender ->
                isOpeningScanner = false
                scannerKind = kind
                scannerLauncher.launch(IntentSenderRequest.Builder(intentSender).build())
            }
            .addOnFailureListener { error ->
                isOpeningScanner = false
                Log.e("GohoScanner", "Could not open document scanner", error)
            }
    }

    /**
     * Saves the photo on the phone, then opens its section at the top of All while the transfer
     * continues from the list. A failed save keeps the preview open.
     */
    private fun upload() {
        val captured = capture ?: return
        if (isOpeningScanner || uploadStatus == UploadStatus.Saving) return

        uploadStatus = UploadStatus.Saving
        lifecycleScope.launch {
            val upload = pendingUploads.add(captured.kind, captured.imageUri)
            if (upload == null) {
                uploadStatus = UploadStatus.SaveFailed
                return@launch
            }
            capture = null
            uploadStatus = UploadStatus.Ready
            when (captured.kind) {
                ScanKind.Receipt -> {
                    receiptUploadToReveal = upload.id.toString()
                    selectSection(Section.Receipts)
                }
                ScanKind.Book -> {
                    bookUploadToReveal = upload.id
                    selectSection(Section.Books)
                }
            }
        }
    }

    private companion object {
        const val SECTION_KEY = "section"
        const val SCANNER_KIND_KEY = "scannerKind"
    }
}
