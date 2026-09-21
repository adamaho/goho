# @goho/goho-api

The shared Goho HTTP API contract. This package owns the public schemas and
Effect `HttpApi` value consumed by both the server implementation and typed
clients. It depends only on Effect and contains no server infrastructure.

- `/api`: HTTP endpoint contract.
- `/receipt-uploads`: receipt upload identity and status schemas.
- `/receipts`: receipt request and response schemas.
- `/response`: shared successful response envelope.
