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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
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
import com.adamaho.goho.api.generated.infrastructure.ApiClient
import com.adamaho.goho.api.generated.model.Receipt
import com.adamaho.goho.api.generated.model.ReceiptUploadsCreate202ResponseData
import com.adamaho.goho.api.generated.model.ReceiptUploadsList200ResponseDataInner
import com.adamaho.goho.theme.GohoTheme
import com.adamaho.goho.ui.main.BookListController
import com.adamaho.goho.ui.main.BookOverview
import com.adamaho.goho.ui.main.ReceiptDetailScreen
import com.adamaho.goho.ui.main.ReceiptListEntry
import com.adamaho.goho.ui.main.ReceiptListStatus
import com.adamaho.goho.ui.main.ReceiptOverview
import com.adamaho.goho.ui.main.ReceiptOverviewState
import com.adamaho.goho.ui.main.ScanPreviewScreen
import com.adamaho.goho.ui.main.Section
import com.adamaho.goho.ui.main.SectionScreen
import com.adamaho.goho.ui.main.ThumbnailCache
import com.adamaho.goho.ui.main.UploadStatus
import com.adamaho.goho.ui.main.receiptListEntries
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.RESULT_FORMAT_JPEG
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.SCANNER_MODE_FULL
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import java.io.IOException
import java.time.ZoneId
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import okio.BufferedSink

/** The section root; the selected section is activity state, so Back does not switch sections. */
@Serializable private data object SectionRoute : NavKey

@Serializable private data class ReceiptDetailRoute(val receiptId: String) : NavKey

class MainActivity : ComponentActivity() {
    private var scannedImageUri by mutableStateOf<Uri?>(null)
    private var scanError by mutableStateOf<Int?>(null)
    private var isOpeningScanner by mutableStateOf(false)
    private var uploadStatus by mutableStateOf(UploadStatus.Ready)
    private var overviewState by mutableStateOf(ReceiptOverviewState())
    private var uploadToReveal by mutableStateOf<String?>(null)
    private var section by mutableStateOf(Section.Receipts)
    private var pollingJob: Job? = null
    private var refreshAfterCurrent = false
    private var historyRevision = 0L

    private val receiptUploadsApi by lazy { service<ReceiptUploadsApi>() }
    private val receiptsApi by lazy { service<ReceiptsApi>() }
    private val receiptThumbnails = ThumbnailCache { loadReceiptImage(it) }
    private val books by lazy {
        BookListController(lifecycleScope, service<BooksApi>(), service<BookUploadsApi>())
    }
    private val preferences by lazy { getSharedPreferences("goho", MODE_PRIVATE) }

    private inline fun <reified T> service(): T =
        ApiClient(
                baseUrl = BuildConfig.GOHO_SERVER_URL,
                okHttpClientBuilder = OkHttpClient.Builder().callTimeout(60, TimeUnit.SECONDS),
            )
            .createService(T::class.java)

    private val scannerLauncher =
        registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
            if (result.resultCode == RESULT_OK) {
                val imageUri =
                    GmsDocumentScanningResult.fromActivityResultIntent(result.data)
                        ?.pages
                        ?.firstOrNull()
                        ?.imageUri
                if (imageUri != null) {
                    scannedImageUri = imageUri
                    scanError = null
                    uploadStatus = UploadStatus.Ready
                } else {
                    scanError = R.string.scan_no_image
                }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        enableEdgeToEdge()
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
                    val capturedImage = scannedImageUri
                    if (capturedImage == null) {
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
                                            val receiptCount =
                                                remember(overviewState) {
                                                    if (overviewState.hasLoaded)
                                                        receiptListEntries(
                                                                overviewState.receipts,
                                                                overviewState.uploads,
                                                                ZoneId.systemDefault(),
                                                            )
                                                            .size
                                                    else null
                                                }
                                            val bookState = books.state
                                            SectionScreen(
                                                section = section,
                                                onSectionChange = ::selectSection,
                                                receiptCount = receiptCount,
                                                bookCount =
                                                    if (bookState.hasLoaded) bookState.books.size
                                                    else null,
                                                isOpeningScanner = isOpeningScanner,
                                                onScanReceipt = ::openScanner,
                                            ) { menuOpen ->
                                                when (section) {
                                                    Section.Receipts ->
                                                        ReceiptOverview(
                                                            state = overviewState,
                                                            menuOpen = menuOpen,
                                                            uploadToReveal = uploadToReveal,
                                                            onUploadRevealed = {
                                                                uploadToReveal = null
                                                            },
                                                            deleteReceipt = ::deleteReceipt,
                                                            thumbnails = receiptThumbnails,
                                                            isOpeningScanner = isOpeningScanner,
                                                            scanError = scanError,
                                                            onRetryClick = { refreshHistory() },
                                                            onRefresh = {
                                                                refreshHistory(userInitiated = true)
                                                            },
                                                            onReceiptClick = {
                                                                backStack.add(
                                                                    ReceiptDetailRoute(it)
                                                                )
                                                            },
                                                        )
                                                    Section.Books ->
                                                        BookOverview(
                                                            state = bookState,
                                                            menuOpen = menuOpen,
                                                            covers = books.covers,
                                                            isOpeningScanner = isOpeningScanner,
                                                            scanError = scanError,
                                                            onRetryClick = { books.refresh() },
                                                            onRefresh = {
                                                                books.refresh(userInitiated = true)
                                                            },
                                                        )
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
                            scannedImageUri = capturedImage,
                            uploadStatus = uploadStatus,
                            onUploadClick = ::uploadReceipt,
                            onCancelClick = {
                                if (uploadStatus != UploadStatus.Uploading) {
                                    scannedImageUri = null
                                    uploadStatus = UploadStatus.Ready
                                    scanError = null
                                }
                            },
                        )
                    }
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        refreshHistory()
        books.refresh()
        pollingJob = lifecycleScope.launch {
            launch { books.pollPendingUploads() }
            snapshotFlow {
                overviewState.uploads.any {
                    it.status == ReceiptUploadsList200ResponseDataInner.Status.queued ||
                        it.status == ReceiptUploadsList200ResponseDataInner.Status.processing
                }
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

    private suspend fun deleteReceipt(entry: ReceiptListEntry): Boolean {
        if (entry.status == ReceiptListStatus.Processing) return false
        return try {
            val response =
                when {
                    entry.receiptId != null -> receiptsApi.receiptsDelete(entry.receiptId)
                    entry.status == ReceiptListStatus.NotProcessed && entry.uploadId != null ->
                        receiptUploadsApi.receiptUploadsDelete(entry.uploadId)
                    else -> return false
                }
            if (response.code() != 204) return false
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
            true
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w("GohoReceipts", "Receipt deletion failed", error)
            false
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

    private fun openScanner() {
        if (isOpeningScanner || uploadStatus == UploadStatus.Uploading) return

        isOpeningScanner = true
        scanError = null
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
                scannerLauncher.launch(IntentSenderRequest.Builder(intentSender).build())
            }
            .addOnFailureListener { error ->
                isOpeningScanner = false
                scanError = R.string.scan_failed
                Log.e("GohoScanner", "Could not open document scanner", error)
            }
    }

    private fun uploadReceipt() {
        val imageUri = scannedImageUri ?: return
        if (
            isOpeningScanner ||
                uploadStatus == UploadStatus.Uploading ||
                uploadStatus == UploadStatus.Submitted
        )
            return

        uploadStatus = UploadStatus.Uploading
        val body =
            object : RequestBody() {
                override fun contentType() = "image/jpeg".toMediaType()

                override fun isOneShot() = true

                override fun writeTo(sink: BufferedSink) {
                    val input =
                        contentResolver.openInputStream(imageUri)
                            ?: throw IOException("Scanned receipt image is unavailable")
                    input.use { it.copyTo(sink.outputStream()) }
                }
            }
        val file = MultipartBody.Part.createFormData("file", "receipt.jpg", body)
        lifecycleScope.launch {
            uploadStatus =
                try {
                    val response = receiptUploadsApi.receiptUploadsCreate(file)
                    val status = response.body()?.data?.status
                    if (
                        response.code() == 202 &&
                            status != null &&
                            status != ReceiptUploadsCreate202ResponseData.Status.failed
                    ) {
                        uploadToReveal = response.body()?.data?.id?.toString()
                        selectSection(Section.Receipts)
                        scannedImageUri = null
                        refreshHistory()
                        UploadStatus.Submitted
                    } else {
                        UploadStatus.Failed
                    }
                } catch (error: Exception) {
                    if (error is CancellationException) throw error
                    Log.w("GohoUpload", "Receipt upload failed", error)
                    UploadStatus.Failed
                }
        }
    }

    private companion object {
        const val SECTION_KEY = "section"
    }
}
