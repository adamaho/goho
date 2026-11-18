package com.adamaho.goho.ui.main

import java.net.URLDecoder
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Headers
import retrofit2.http.Path
import retrofit2.http.Streaming

/**
 * A saved recipe as a PDF, for Share recipe. The generated `RecipesApi.recipesGet` asks the same
 * route for JSON only; the server picks the PDF by content negotiation, so this asks for it with
 * `Accept` and streams the body instead of buffering it. A 404 carries the same `RecipeNotFound`.
 */
internal interface RecipePdfApi {
    @Streaming
    @Headers("Accept: application/pdf")
    @GET("recipes/{recipeId}")
    suspend fun recipesGetPdf(@Path("recipeId") recipeId: String): Response<ResponseBody>
}

/** The cache subdirectory for shared recipe PDFs, matching `res/xml/file_paths.xml`. */
internal const val RECIPE_PDF_DIRECTORY = "recipe-pdfs"

/**
 * The shared PDF's file name: the server's `Content-Disposition` name, `filename*` first, then
 * `filename`, or [title] when neither is usable. Path separators, reserved characters and leading
 * dots are replaced, so the name always stays inside the share directory and ends in `.pdf`.
 */
internal fun recipePdfFileName(contentDisposition: String?, title: String): String {
    val header = contentDisposition.orEmpty()
    val extended =
        Regex("""filename\*\s*=\s*UTF-8''([^;\s]+)""", RegexOption.IGNORE_CASE)
            .find(header)
            ?.groupValues
            ?.get(1)
            ?.let {
                try {
                    URLDecoder.decode(it.replace("+", "%2B"), Charsets.UTF_8)
                } catch (_: IllegalArgumentException) {
                    null
                }
            }
    val plain =
        Regex("""filename\s*=\s*"([^"]*)"""", RegexOption.IGNORE_CASE)
            .find(header)
            ?.groupValues
            ?.get(1)
    return listOfNotNull(extended, plain).map(::safeFileName).firstOrNull {
        it.length > PDF_EXTENSION.length && it.endsWith(PDF_EXTENSION, true)
    } ?: (safeFileName(title).take(MAX_TITLE_LENGTH).trimEnd().ifEmpty { "recipe" } + PDF_EXTENSION)
}

private const val PDF_EXTENSION = ".pdf"
private const val MAX_TITLE_LENGTH = 60

private fun safeFileName(name: String): String =
    name.replace(Regex("""[\\/:*?"<>|\p{Cntrl}]+"""), "-").trim().trimStart('.', '-')
