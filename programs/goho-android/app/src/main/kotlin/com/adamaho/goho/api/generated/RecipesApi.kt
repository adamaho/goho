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
     * Returns the JPEG, PNG or WebP photo on file for the recipe. Recipes entered by hand have none.
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

}
