package com.adamaho.goho.api.generated

import com.adamaho.goho.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import okhttp3.ResponseBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import com.adamaho.goho.api.generated.model.BadRequestProblemEncoded
import com.adamaho.goho.api.generated.model.CreateRecipeRequest
import com.adamaho.goho.api.generated.model.RecipeImageNotFound
import com.adamaho.goho.api.generated.model.RecipeNotFound
import com.adamaho.goho.api.generated.model.RecipesCreate200Response
import com.adamaho.goho.api.generated.model.RecipesGet200Response
import com.adamaho.goho.api.generated.model.RecipesList200Response
import com.adamaho.goho.api.generated.model.RecipesList500Response
import com.adamaho.goho.api.generated.model.UploadLimitExceeded

import okhttp3.MultipartBody

interface RecipesApi {
    /**
     * POST recipes
     * Add a recipe
     * Saves a complete recipe straight to the roster, with no source or photo. Every call saves a new recipe, even with a title already on the roster.
     * Responses:
     *  - 200: Success
     *  - 400: Bad Request
     *  - 500: The server could not save this recipe; nothing changed. | Internal Server Error
     *
     * @param createRecipeRequest 
     * @return [RecipesCreate200Response]
     */
    @POST("recipes")
    suspend fun recipesCreate(@Body createRecipeRequest: CreateRecipeRequest): Response<RecipesCreate200Response>

    /**
     * DELETE recipes/{recipeId}
     * Delete a recipe
     * Takes the recipe off the roster for good, along with every import linked to it and its photo, so its page can be pulled in fresh. Returns no body after a clean finish.
     * Responses:
     *  - 204: <No Content>
     *  - 400: Bad Request
     *  - 404: No recipe is wearing that number, bud.
     *  - 500: The server could not delete this recipe and its photo; take another shot to finish the cleanup. | Internal Server Error
     *
     * @param recipeId 
     * @return [Unit]
     */
    @DELETE("recipes/{recipeId}")
    suspend fun recipesDelete(@Path("recipeId") recipeId: kotlin.String): Response<Unit>

    /**
     * DELETE recipes/{recipeId}/image
     * Remove a recipe photo
     * Takes the photo off the recipe for good and leaves the rest of the recipe on the roster. Returns 204 with no body, even when there was no photo to remove.
     * Responses:
     *  - 204: <No Content>
     *  - 400: Bad Request
     *  - 404: No recipe is wearing that number, bud.
     *  - 500: The server could not remove this photo; take another shot. | Internal Server Error
     *
     * @param recipeId 
     * @return [Unit]
     */
    @DELETE("recipes/{recipeId}/image")
    suspend fun recipesDeleteImage(@Path("recipeId") recipeId: kotlin.String): Response<Unit>

    /**
     * GET recipes/{recipeId}
     * Get a recipe
     * Brings back one saved recipe with its ingredients, steps and yield.
     * Responses:
     *  - 200: Success
     *  - 400: Bad Request
     *  - 404: No recipe is wearing that number, bud.
     *  - 500: The server could not retrieve this recipe. | Internal Server Error
     *
     * @param recipeId 
     * @return [RecipesGet200Response]
     */
    @GET("recipes/{recipeId}")
    suspend fun recipesGet(@Path("recipeId") recipeId: kotlin.String): Response<RecipesGet200Response>

    /**
     * GET recipes/{recipeId}/image
     * Get a recipe photo
     * Returns the JPEG, PNG or WebP photo on file for the recipe. Recipes entered by hand have none until you send one.
     * Responses:
     *  - 200: Success
     *  - 400: Bad Request
     *  - 404: No photo is on file for that recipe number, bud.
     *  - 500: The server could not retrieve this recipe photo. | Internal Server Error
     *
     * @param recipeId 
     * @return [ResponseBody]
     */
    @GET("recipes/{recipeId}/image")
    suspend fun recipesGetImage(@Path("recipeId") recipeId: kotlin.String): Response<ResponseBody>

    /**
     * GET recipes
     * List recipes
     * Pulls every saved recipe&#39;s headline details by title, without ingredients, steps or yield. Get a recipe for the full play.
     * Responses:
     *  - 200: Success
     *  - 400: Bad Request
     *  - 500: The server could not pull the recipes off the bench. | Internal Server Error
     *
     * @return [RecipesList200Response]
     */
    @GET("recipes")
    suspend fun recipesList(): Response<RecipesList200Response>

    /**
     * PUT recipes/{recipeId}/image
     * Set a recipe photo
     * Sends one JPEG, PNG or WebP image in the &#x60;file&#x60; field as the recipe&#39;s only photo, replacing any photo it had, imported or sent. The image&#39;s own bytes have to show it&#39;s one of those types, whatever its file name or MIME type says; anything else returns 400 and the old photo stays. Returns 201 when the recipe had no photo and 204 when it replaced one, both with no body. When two photos drop at once, the last one saved wins.
     * Responses:
     *  - 201: The recipe had no photo; now it does.
     *  - 204: The new photo took the old one's spot on the roster.
     *  - 400: Bad Request
     *  - 404: No recipe is wearing that number, bud.
     *  - 413: The upload exceeds a size or part-count limit, bud. Nothing is saved or queued.
     *  - 500: The server could not save this photo; the old one stays put. | Internal Server Error
     *
     * @param recipeId 
     * @param file 
     * @return [Unit]
     */
    @Multipart
    @PUT("recipes/{recipeId}/image")
    suspend fun recipesPutImage(@Path("recipeId") recipeId: kotlin.String, @Part file: MultipartBody.Part): Response<Unit>

}
