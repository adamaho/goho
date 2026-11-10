import { BookUploadsUnavailable } from "@goho/goho-server-client/book-uploads";
import { BooksUnavailable } from "@goho/goho-server-client/books";
import { ReceiptUploadsUnavailable } from "@goho/goho-server-client/receipt-uploads";
import { ReceiptsUnavailable } from "@goho/goho-server-client/receipts";
import { RecipeUploadsUnavailable } from "@goho/goho-server-client/recipe-uploads";
import { RecipesUnavailable } from "@goho/goho-server-client/recipes";
import { Schema } from "effect";
import { HttpClientError } from "effect/http";
import { HttpApiError } from "effect/http-api";

/**
 * A tool failure. MCP sends its message to the client as plain text with `isError: true`.
 *
 * @category errors
 * @since 0.1.0
 */
export class ToolFailure extends Schema.TaggedError<ToolFailure>()("ToolFailure", {
  message: Schema.String,
}) {}

/**
 * Goho API client failures that no tool explains with its own message.
 *
 * @category errors
 * @since 0.1.0
 */
export type ApiFailure =
  | HttpClientError.HttpClientError
  | Schema.SchemaError
  | HttpApiError.BadRequestProblem
  | HttpApiError.InternalServerErrorProblem
  | BooksUnavailable
  | BookUploadsUnavailable
  | ReceiptsUnavailable
  | ReceiptUploadsUnavailable
  | RecipesUnavailable
  | RecipeUploadsUnavailable;

const unreachable = "The Goho API could not be reached; check GOHO_SERVER_URL and the network.";
const serverFailed =
  "The Goho API could not complete the request; try again, and contact the Goho operator if it keeps failing.";
const incompatible =
  "This MCP server and the Goho API disagree on the request or response; check that their versions are compatible.";

const adviceFor = (cause: ApiFailure) => {
  if (cause._tag !== "HttpClientError") {
    return cause._tag === "BadRequestProblem" || cause._tag === "SchemaError"
      ? incompatible
      : serverFailed;
  }
  switch (cause.reason._tag) {
    case "TransportError":
    case "InvalidUrlError":
      return unreachable;
    case "EncodeError":
      return incompatible;
    case "StatusCodeError":
    case "DecodeError":
    case "EmptyBodyError":
      // Any 5xx is a server failure, even with a body this program cannot read, such as a proxy page.
      return cause.reason.response.status >= 500 ? serverFailed : incompatible;
  }
};

/**
 * Explains a failed Goho API call: unreachable, failed on the server, or incompatible with this
 * program.
 *
 * @category errors
 * @since 0.1.0
 */
export const apiFailure = (action: string, cause: ApiFailure) =>
  new ToolFailure({ message: `Could not ${action}. ${adviceFor(cause)}` });
