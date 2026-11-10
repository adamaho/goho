import { Layer } from "effect";
import { Toolkit } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import * as CreateBook from "./create-book.ts";
import * as CreateReceipt from "./create-receipt.ts";
import * as CreateRecipeUpload from "./create-recipe-upload.ts";
import * as CreateRecipe from "./create-recipe.ts";
import * as DeleteBookUpload from "./delete-book-upload.ts";
import * as DeleteBook from "./delete-book.ts";
import * as DeleteReceiptUpload from "./delete-receipt-upload.ts";
import * as DeleteReceipt from "./delete-receipt.ts";
import * as DeleteRecipeUpload from "./delete-recipe-upload.ts";
import * as DeleteRecipe from "./delete-recipe.ts";
import * as GetBookUpload from "./get-book-upload.ts";
import * as GetBook from "./get-book.ts";
import * as GetReceiptUpload from "./get-receipt-upload.ts";
import * as GetReceipt from "./get-receipt.ts";
import * as GetRecipeUpload from "./get-recipe-upload.ts";
import * as GetRecipe from "./get-recipe.ts";
import * as ListBookUploads from "./list-book-uploads.ts";
import * as ListBooks from "./list-books.ts";
import * as ListReceiptUploads from "./list-receipt-uploads.ts";
import * as ListReceipts from "./list-receipts.ts";
import * as ListRecipeUploads from "./list-recipe-uploads.ts";
import * as ListRecipes from "./list-recipes.ts";
import * as PatchBook from "./patch-book.ts";
import * as PatchReceiptItem from "./patch-receipt-item.ts";
import * as PatchReceipt from "./patch-receipt.ts";

/**
 * The receipt, book, recipe, and upload tools offered over MCP. Receipt and book uploads can be
 * read and, once failed, deleted; only recipe uploads can be created here.
 *
 * @category tools
 * @since 0.1.0
 */
export const toolkit = Toolkit.make(
  ListReceipts.tool,
  GetReceipt.tool,
  CreateReceipt.tool,
  DeleteReceipt.tool,
  PatchReceipt.tool,
  PatchReceiptItem.tool,
  ListBooks.tool,
  GetBook.tool,
  CreateBook.tool,
  DeleteBook.tool,
  PatchBook.tool,
  ListRecipes.tool,
  GetRecipe.tool,
  CreateRecipe.tool,
  DeleteRecipe.tool,
  ListRecipeUploads.tool,
  GetRecipeUpload.tool,
  CreateRecipeUpload.tool,
  DeleteRecipeUpload.tool,
  ListReceiptUploads.tool,
  GetReceiptUpload.tool,
  DeleteReceiptUpload.tool,
  ListBookUploads.tool,
  GetBookUpload.tool,
  DeleteBookUpload.tool,
);

/**
 * Provides receipt, book, recipe, and upload tool handlers and their client dependency for MCP registration.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = toolkit
  .toLayer({
    list_receipts: ListReceipts.handle,
    get_receipt: GetReceipt.handle,
    create_receipt: CreateReceipt.handle,
    delete_receipt: DeleteReceipt.handle,
    patch_receipt: PatchReceipt.handle,
    patch_receipt_item: PatchReceiptItem.handle,
    list_books: ListBooks.handle,
    get_book: GetBook.handle,
    create_book: CreateBook.handle,
    delete_book: DeleteBook.handle,
    patch_book: PatchBook.handle,
    list_recipes: ListRecipes.handle,
    get_recipe: GetRecipe.handle,
    create_recipe: CreateRecipe.handle,
    delete_recipe: DeleteRecipe.handle,
    list_recipe_uploads: ListRecipeUploads.handle,
    get_recipe_upload: GetRecipeUpload.handle,
    create_recipe_upload: CreateRecipeUpload.handle,
    delete_recipe_upload: DeleteRecipeUpload.handle,
    list_receipt_uploads: ListReceiptUploads.handle,
    get_receipt_upload: GetReceiptUpload.handle,
    delete_receipt_upload: DeleteReceiptUpload.handle,
    list_book_uploads: ListBookUploads.handle,
    get_book_upload: GetBookUpload.handle,
    delete_book_upload: DeleteBookUpload.handle,
  })
  .pipe(Layer.provideMerge(GohoServerClient.layer));
