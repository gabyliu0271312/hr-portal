# Custom Connector SDK Contract

## Scope

This contract applies to Phase 3 custom connectors. A connector is an adapter
registered in `app.ucp.adapters.ADAPTER_REGISTRY`; it is not an unrestricted
HTTP client or a way to bypass the controlled HTTP/OpenAPI capability-card flow.

## Adapter interface

```python
async def adapter(params: dict, secrets: dict, db: AsyncSession) -> AdapterResult:
    ...
```

- `params` contains validated business input only.
- `secrets` is resolved inside the execution process from a credential reference.
  It must never be persisted in an approval payload, log, API response, or UI.
- `AdapterResult` must report `success`, `partial_success`, or `failed` and use
  a stable error code for recoverable failures.

## Write connector requirements

1. Submit writes through `/ucp/write-operations/submit` with a credential code,
   approvers, and an idempotency key of at least eight characters.
2. The request preview is reviewable business data. Keys that imply a secret
   (`token`, `secret`, `password`, `authorization`, `cookie`, or API key) are
   rejected before an approval request is created.
3. Execution is allowed only after approval and token confirmation. The adapter
   receives plaintext credentials only during the invocation.
4. Adapter writes must use the upstream idempotency mechanism when available;
   otherwise the connector must provide a compensating action and a stable
   external request reference in its result metadata.

## Webhook and complex authentication

- Incoming webhooks must verify the provider signature before creating events.
- OAuth, signed-request, and refresh-token implementations keep token material
  in `UcpCredential` only and must use the credential service for decryption.
- Production adapters fail closed when a credential, signature, allowlist, or
  network safety check is missing. Simulation must be explicitly configured.

## Review checklist

- Document input/output schema, scopes, rate limits, redaction rules, and owner.
- Provide a side-effect test, duplicate-submission test, signature test, and a
  failure/compensation test before production registration.
