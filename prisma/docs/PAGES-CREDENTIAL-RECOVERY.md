# Prisma Pages: recovery from missing provider credentials

## Verified incident (2026-11-14)

- Known-good production deployment: `17a6c338-ef6d-4cc1-8e71-44893bbec035` (commit `b8a4b6e`).
- Broken production deployment: `dc242fc1-da03-45f6-b9e6-0572b2292153` (same commit).
- Both report 55 environment variable **names**, identical D1/AI bindings, and identical Wrangler build discovery.
- The Pages API redacts `secret_text.value` as an empty string even for the working deployment. **Never interpret that response as proof the stored secret is empty, and never PATCH it back.**
- The runtime `/api/providers/status` reported configured external credential slots in the good deployment and zero in the bad deployment. The exact underlying mutation remains unproven.
- The production canonical deployment was rolled back to the working ID. Keep it until a new production deployment passes the gate.

## Safe recovery procedure

1. Preserve the known-good deployment and leave the Queen integration in a draft PR.
2. In Cloudflare Pages project `prismaspace`, inspect **production** Environment variables in the dashboard. Do not copy the GET API's redacted `value: ""` fields into PATCH requests.
3. **Check configuration-source precedence first.** Commit `b8a4b6e` contained `prisma/wrangler.toml` with `[vars]`, D1 and AI bindings but no external-provider secrets. Cloudflare Pages documents that a Wrangler file becomes the source of truth for Pages configuration. Main subsequently removed `prisma/wrangler.toml`; preserve that removal in the Queen integration and do not recreate the file or upload a redacted environment snapshot. This is a plausible deployment-configuration cause, not proof of the specific historical secret loss. Only consider re-entering the original secrets after a clean deployment without Wrangler is verified to lack bindings. Do not put secrets in Git, Actions inputs, URLs, logs, or chat.
4. Trigger a **new production deployment only in a controlled maintenance window** and inspect its immutable deployment URL **before** promoting it to the canonical site.
5. Run `node prisma/scripts/check-provider-bindings.mjs production https://NEW-IMMUTABLE.pages.dev https://17a6c338.prismaspace.pages.dev`. The check must pass without reducing any provider slot count.
6. Perform at least one authorized real inference against the candidate through the application flow, without logging secrets. Slot presence alone does not prove credentials are valid.
7. If any check fails, keep the known-good canonical deployment; investigate missing bindings before promotion.
8. Only after the secret check and Queen/Core staging checks pass, merge/promote the integration.

## Deployment safety invariants

- Do not modify `deployment_configs.production.env_vars` using a GET response, because secret values are redacted.
- Do not overwrite secret values with empty strings, `null`, or placeholders.
- Do not assume preview has production secrets; Pages preview and production have separate environment settings.
- Do not run production-secret inference tests against the public preview environment.
- Do not replace production D1 with Queen staging D1.
- Do not treat a successful build, green unit tests, or nonzero credential slots as sufficient proof of a healthy deployment.
- This gate is currently **manual**, not an automatic Cloudflare pre-promotion hook.
