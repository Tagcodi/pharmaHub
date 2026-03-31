# PharmaHub Database Schema

## Design Principles

- Use UUID primary keys for all major entities
- Keep pharmacy, branch, and user boundaries explicit
- Track inventory at the batch level
- Record every stock movement
- Keep audit logs separate from core domain tables

## Core Entities

### Pharmacy

Represents the customer organization using PharmaHub.

Key fields:

- `id`
- `name`
- `country`
- `currency`
- `timezone`
- `created_at`
- `updated_at`

### Branch

Represents a physical pharmacy location. The MVP uses one default branch, but this model prepares the system for future growth.

Key fields:

- `id`
- `pharmacy_id`
- `name`
- `code`
- `address`
- `is_default`

### User

Represents a staff member with a role.

Key fields:

- `id`
- `pharmacy_id`
- `branch_id`
- `full_name`
- `email`
- `password_hash`
- `role`
- `is_active`
- `last_login_at`

### Medicine

Represents a medicine definition, separate from specific inventory batches.

Key fields:

- `id`
- `pharmacy_id`
- `name`
- `generic_name`
- `brand_name`
- `sku`
- `form`
- `strength`
- `category`
- `unit`
- `is_active`

### StockBatch

Represents a batch of a medicine currently or previously stored in the branch.

Key fields:

- `id`
- `pharmacy_id`
- `branch_id`
- `medicine_id`
- `batch_number`
- `expiry_date`
- `quantity_on_hand`
- `cost_price`
- `selling_price`
- `supplier_name`
- `received_at`
- `created_by`

### Sale

Represents a completed transaction.

Key fields:

- `id`
- `pharmacy_id`
- `branch_id`
- `sale_number`
- `status`
- `total_amount`
- `payment_method`
- `sold_by`
- `sold_at`

### SaleItem

Represents each line item within a sale.

Key fields:

- `id`
- `sale_id`
- `medicine_id`
- `stock_batch_id`
- `quantity`
- `unit_price`
- `line_total`

### InventoryAdjustment

Represents a manual stock correction that is not a direct sale.

Key fields:

- `id`
- `pharmacy_id`
- `branch_id`
- `medicine_id`
- `stock_batch_id`
- `reason`
- `notes`
- `quantity_delta`
- `created_by`
- `created_at`

### StockMovement

Represents the immutable inventory ledger.

Key fields:

- `id`
- `pharmacy_id`
- `branch_id`
- `medicine_id`
- `stock_batch_id`
- `movement_type`
- `reference_type`
- `reference_id`
- `quantity_delta`
- `quantity_after`
- `created_by`
- `created_at`

### AuditLog

Represents traceability for sensitive actions.

Key fields:

- `id`
- `pharmacy_id`
- `branch_id`
- `user_id`
- `action`
- `entity_type`
- `entity_id`
- `metadata`
- `created_at`

## Relationship Summary

- A `Pharmacy` has many `Branches`.
- A `Pharmacy` has many `Users`.
- A `Branch` has many `Users`, `StockBatches`, `Sales`, `InventoryAdjustments`, `StockMovements`, and `AuditLogs`.
- A `Medicine` belongs to a `Pharmacy`.
- A `Medicine` has many `StockBatches`.
- A `Sale` has many `SaleItems`.
- A `StockMovement` may reference a `Sale` or an `InventoryAdjustment`.

## Important Rules

### Inventory Changes

Inventory must change only through:

- stock-in
- sale
- return
- damage
- expiry
- manual adjustment

### Theft Prevention

The system should make it easy to detect:

- stock drops without corresponding sales
- repeated manual corrections by the same user
- unusual reductions on expensive or controlled medicines

### Future Expansion

The schema should later support:

- purchase orders
- supplier records
- multi-branch transfers
- approval workflows
- hosted subscriptions and tenant billing
