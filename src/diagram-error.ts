import { Schema } from "effect";

export class DiagramError extends Schema.TaggedError<
  DiagramError,
  { readonly brand: unique symbol }
>()("DiagramError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}
