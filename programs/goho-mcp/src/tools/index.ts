import { Layer } from "effect";
import { Toolkit } from "effect/ai";

import * as GohoServerClient from "#src/goho-server-client.ts";

import * as CreateReceipt from "./create-receipt.ts";
import * as DeleteReceipt from "./delete-receipt.ts";
import * as GetReceipt from "./get-receipt.ts";
import * as ListReceipts from "./list-receipts.ts";

/**
 * The receipt tools offered over MCP.
 *
 * @category tools
 * @since 0.1.0
 */
export const toolkit = Toolkit.make(
  ListReceipts.tool,
  GetReceipt.tool,
  CreateReceipt.tool,
  DeleteReceipt.tool,
);

/**
 * Provides receipt tool handlers and their client dependency for MCP registration.
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
  })
  .pipe(Layer.provideMerge(GohoServerClient.layer));
