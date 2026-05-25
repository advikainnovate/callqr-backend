# QR Batch Management

This document summarizes the backend changes for QR batch generation and tracking.

## Why this was added

QR codes were previously generated as individual records with no batch identity.
That made it hard to tell:

- which QR codes were generated together
- which ones were meant for printing vs direct admin assignment
- which physical stock had already been printed or distributed

The new batch model fixes that.

## New model

### `qr_batches`

Each QR generation job now creates one batch row with:

- `batchNumber`
- `purpose`: `printing` or `digital`
- `status`
- `quantity`
- `createdBy`
- `notes`
- `printJobRef`
- `distributedAt`
- `createdAt`
- `updatedAt`

### `qr_codes`

Each QR code now stores:

- `batchId`

This links every generated QR to the batch it came from.

## Batch purposes

### Printing batches

Used for physical print workflows.

Allowed statuses:

- `generated`
- `print_pending`
- `printed`
- `distributed`

These are managed manually by admins.

### Digital batches

Used for direct admin-panel assignment workflows.

Possible statuses:

- `generated`
- `available`
- `partially_assigned`
- `fully_assigned`

These are updated automatically based on how many QRs in the batch have been assigned.

## Generation behavior

QR generation now supports preset counts only:

- `10`
- `25`
- `50`
- `100`
- `200`
- `500`
- `1000`

### Batch number format

Batch numbers now use:

`<TYPE>-<DDMMYY>-<RUNNING_NUMBER>`

Examples:

- `PR-250526-001`
- `DG-250526-002`

Rules:

- `PR` = printing
- `DG` = digital
- running numbers reset each day
- the running number is shared across all batches created on the same day
- generation is retry-safe for concurrent requests because insert collisions are retried

When a batch is generated:

1. one `qr_batches` row is created
2. a shared `batchNumber` is assigned
3. all generated QR codes are linked through `batchId`

## API changes

### Existing endpoint updated

`POST /api/admin/qr-codes/bulk-create`

Now accepts:

```json
{
  "count": 200,
  "purpose": "printing",
  "notes": "Launch print run",
  "printJobRef": "PRINT-001"
}
```

Response now includes:

- created `batch`
- `batch.batchNumber` immediately
- generated QRs with `batchId`

The legacy behavior is preserved in the sense that bulk creation still works, but it now always creates a tracked batch.

### New batch endpoints

`GET /api/admin/qr-batches`

- list batches
- supports filtering by `purpose`, `status`, and `search`
- supports `page`, `limit`, `sort`, `sortBy`, `sortOrder`
- returns `page`, `limit`, `total`, `totalPages`

`GET /api/admin/qr-batches/:batchId`

- returns one batch
- includes QR list using the admin QR row structure
- includes batch workflow metadata
- includes assigned/unassigned summary counts

`GET /api/admin/qr-batches/:batchId/download`

- downloads one printing batch as a ZIP of PNG QR files
- ZIP filename uses `batchNumber.zip`
- disabled for distributed batches and digital batches

`PATCH /api/admin/qr-batches/:batchId/status`

- updates batch workflow status
- only for printing batches
- allowed transitions:
  - `generated -> print_pending`
  - `print_pending -> printed`
  - `printed -> distributed`

Example body:

```json
{
  "status": "printed",
  "notes": "Sent to vendor",
  "printJobRef": "PRINT-001"
}
```

## Admin QR responses

Admin QR listing/export responses now include batch information when available:

- `batchId`
- `batchNumber`
- `batchPurpose`
- `batchStatus`

Batch list/detail responses now also include:

- `downloadable`
- `allowedActions`
- `allowedTransitions`

## Automatic batch status updates

When a QR from a digital batch is:

- assigned by admin
- claimed by a user

the batch status is recalculated automatically:

- no assigned QRs -> `available`
- some assigned QRs -> `partially_assigned`
- all assigned QRs -> `fully_assigned`

Printing batches are not auto-transitioned, because their physical lifecycle is operational rather than assignment-driven.

## Migration

The schema change is tracked in:

- `drizzle/0006_dear_pixie.sql`

This migration:

- creates `qr_batches`
- adds `batch_id` to `qr_codes`
- adds the related indexes and foreign key

## Files changed

- `src/models/qrBatch.schema.ts`
- `src/models/qrCode.schema.ts`
- `src/services/qrCode.service.ts`
- `src/services/admin.service.ts`
- `src/controllers/admin.controller.ts`
- `src/controllers/qrCode.controller.ts`
- `src/routes/admin.routes.ts`
- `src/schemas/qrCode.schema.ts`
- `drizzle/0006_dear_pixie.sql`

## Notes

- Existing QR status behavior remains unchanged.
- Batch workflow is tracked separately from individual QR assignment state.
- This change is backend-only; admin/frontend screens still need to consume the new batch APIs.
