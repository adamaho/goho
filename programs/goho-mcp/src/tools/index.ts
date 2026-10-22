import { Layer } from "effect";
import { Toolkit } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import * as CreateBook from "./create-book.ts";
import * as CreateReceipt from "./create-receipt.ts";
import * as DeleteBook from "./delete-book.ts";
import * as DeleteReceipt from "./delete-receipt.ts";
import * as GetBook from "./get-book.ts";
import * as GetReceipt from "./get-receipt.ts";
import * as ListBooks from "./list-books.ts";
import * as ListReceipts from "./list-receipts.ts";
import * as PatchBook from "./patch-book.ts";
import * as PatchReceiptItem from "./patch-receipt-item.ts";
import * as PatchReceipt from "./patch-receipt.ts";

/**
 * The receipt and book tools offered over MCP.
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
);

/**
 * Provides receipt and book tool handlers and their client dependency for MCP registration.
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
  })
  .pipe(Layer.provideMerge(GohoServerClient.layer));
