package com.adamaho.goho

import android.app.Application
import android.util.Log
import com.adamaho.goho.api.generated.BookUploadsApi
import com.adamaho.goho.api.generated.ReceiptUploadsApi
import com.adamaho.goho.api.generated.infrastructure.ApiClient
import com.adamaho.goho.api.generated.infrastructure.Serializer
import com.adamaho.goho.ui.main.PendingUpload
import com.adamaho.goho.ui.main.PendingUploads
import com.adamaho.goho.ui.main.ScanKind
import com.adamaho.goho.ui.main.SendOutcome
import java.io.File
import java.lang.reflect.Type
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.MainScope
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Converter
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.converter.scalars.ScalarsConverterFactory

/** Owns work that must outlive an activity: uploads saved on the phone and their transfers. */
class GohoApplication : Application() {
    internal lateinit var pendingUploads: PendingUploads
        private set

    override fun onCreate() {
        super.onCreate()
        val receiptUploads = gohoApi<ReceiptUploadsApi>()
        val bookUploads = gohoApi<BookUploadsApi>()
        pendingUploads =
            PendingUploads(
                    // Outside auto backup and device transfer, and per server, so one server's
                    // photos are never sent to another configured later.
                    directory =
                        File(
                            noBackupFilesDir,
                            "pending-uploads/${serverDirectory(BuildConfig.GOHO_SERVER_URL)}",
                        ),
                    resolver = contentResolver,
                    scope = MainScope(),
                    send = { upload, photo ->
                        val file =
                            MultipartBody.Part.createFormData(
                                "file",
                                if (upload.kind == ScanKind.Receipt) "receipt.jpg" else "book.jpg",
                                photo.asRequestBody("image/jpeg".toMediaType()),
                            )
                        when (upload.kind) {
                            ScanKind.Receipt ->
                                receiptUploads
                                    .receiptUploadsCreate(idempotencyKey = upload.id, file = file)
                                    .let { outcome(upload, it, it.body()?.data?.id) }
                            ScanKind.Book ->
                                bookUploads
                                    .bookUploadsCreate(idempotencyKey = upload.id, file = file)
                                    .let { outcome(upload, it, it.body()?.data?.id) }
                        }
                    },
                )
                .also { it.start() }
    }
}

/**
 * Any 202 with an upload is the server's acceptance, whatever its status. A 410 means this key's
 * upload was accepted and has since been deleted, so it is done. Everything else stays a retained
 * failure: a 413 can also come from a server older than idempotency keys, which allows one
 * multipart part and so rejects the keyed upload without storing it.
 */
private fun outcome(upload: PendingUpload, response: Response<*>, acceptedId: UUID?): SendOutcome {
    response.errorBody()?.close()
    if (response.code() == 202 && acceptedId != null) {
        if (acceptedId != upload.id)
            Log.w("GohoUpload", "Server accepted ${upload.id} as $acceptedId, ignoring its key")
        return SendOutcome.Accepted
    }
    if (response.code() == 410) {
        Log.i("GohoUpload", "${upload.kind} upload ${upload.id} was already deleted on the server")
        return SendOutcome.Gone
    }
    Log.w(
        "GohoUpload",
        "${upload.kind} upload was not accepted: ${response.code()}" +
            if (response.code() == 413) " (too large, or the server predates idempotency keys)"
            else "",
    )
    return SendOutcome.Failed
}

private fun serverDirectory(url: String): String =
    MessageDigest.getInstance("SHA-256").digest(url.toByteArray()).take(8).joinToString("") {
        "%02x".format(it)
    }

/** The upload contract takes UUID parts as plain text; Moshi would send them as quoted JSON. */
private object UuidPartConverter : Converter.Factory() {
    override fun requestBodyConverter(
        type: Type,
        parameterAnnotations: Array<out Annotation>,
        methodAnnotations: Array<out Annotation>,
        retrofit: Retrofit,
    ): Converter<*, RequestBody>? =
        if (type == UUID::class.java)
            Converter<UUID, RequestBody> { it.toString().toRequestBody("text/plain".toMediaType()) }
        else null
}

internal inline fun <reified T> gohoApi(): T =
    ApiClient(
            baseUrl = BuildConfig.GOHO_SERVER_URL,
            okHttpClientBuilder = OkHttpClient.Builder().callTimeout(60, TimeUnit.SECONDS),
            converterFactories = gohoConverters,
        )
        .createService(T::class.java)

@PublishedApi
internal val gohoConverters: List<Converter.Factory> =
    listOf(
        UuidPartConverter,
        ScalarsConverterFactory.create(),
        MoshiConverterFactory.create(Serializer.moshiBuilder.build()),
    )
