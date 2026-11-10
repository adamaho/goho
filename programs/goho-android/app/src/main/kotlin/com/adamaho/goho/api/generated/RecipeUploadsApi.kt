package com.adamaho.goho.api.generated

import com.adamaho.goho.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import com.adamaho.goho.api.generated.model.BadRequestProblemEncoded
import com.adamaho.goho.api.generated.model.CreateRecipeUploadRequest
import com.adamaho.goho.api.generated.model.RecipeUploadConflict
import com.adamaho.goho.api.generated.model.RecipeUploadNotFound
import com.adamaho.goho.api.generated.model.RecipeUploadsCreate202Response
import com.adamaho.goho.api.generated.model.RecipeUploadsGet200Response
import com.adamaho.goho.api.generated.model.RecipeUploadsList200Response
import com.adamaho.goho.api.generated.model.RecipeUploadsList500Response

interface RecipeUploadsApi {
    /**
     * POST recipe-uploads
     * Import a recipe from a page
     * Queues a new import of the page and returns 202 before the page is fetched, every time you send it. A page already saved as a recipe, ignoring its fragment, links that recipe without another fetch, and the recipe keeps the URL it was first saved from. After a miss, just send the page again.
     * Responses:
     *  - 202: Success
     *  - 400: Bad Request
     *  - 500: The server could not save or queue the import; nothing changed. | Internal Server Error
     *
     * @param createRecipeUploadRequest 
     * @return [RecipeUploadsCreate202Response]
     */
    @POST("recipe-uploads")
    suspend fun recipeUploadsCreate(@Body createRecipeUploadRequest: CreateRecipeUploadRequest): Response<RecipeUploadsCreate202Response>

    /**
     * DELETE recipe-uploads/{uploadId}
     * Delete a failed recipe import
     * Clears a failed import off the bench. You don&#39;t need this to take another shot at the page; just send it again. Queued, processing, and succeeded imports return 409; delete the recipe to remove its successful imports.
     * Responses:
     *  - 204: <No Content>
     *  - 400: Bad Request
     *  - 404: No recipe import is wearing that number, bud.
     *  - 409: Only failed imports can be deleted; this one is queued, processing, or succeeded. Nothing changed.
     *  - 500: The server could not delete this import. | Internal Server Error
     *
     * @param uploadId 
     * @return [Unit]
     */
    @DELETE("recipe-uploads/{uploadId}")
    suspend fun recipeUploadsDelete(@Path("uploadId") uploadId: java.util.UUID): Response<Unit>

    /**
     * GET recipe-uploads/{uploadId}
     * Get recipe import status
     * Returns the latest queue or processing status, the recipe ID after a clean finish, and the failure code after a miss.
     * Responses:
     *  - 200: Success
     *  - 400: Bad Request
     *  - 404: No recipe import is wearing that number, bud.
     *  - 500: The server could not retrieve this import. | Internal Server Error
     *
     * @param uploadId 
     * @return [RecipeUploadsGet200Response]
     */
    @GET("recipe-uploads/{uploadId}")
    suspend fun recipeUploadsGet(@Path("uploadId") uploadId: java.util.UUID): Response<RecipeUploadsGet200Response>

    /**
     * GET recipe-uploads
     * List recipe imports
     * Pulls every recipe import off the bench, newest first, with its current status.
     * Responses:
     *  - 200: Success
     *  - 400: Bad Request
     *  - 500: The server could not pull the imports off the bench. | Internal Server Error
     *
     * @return [RecipeUploadsList200Response]
     */
    @GET("recipe-uploads")
    suspend fun recipeUploadsList(): Response<RecipeUploadsList200Response>

}
