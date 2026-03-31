# PharmaHub Product Scope

## Product Positioning

PharmaHub is a pharmacy control system built for Ethiopian pharmacies. The first release focuses on one pharmacy branch and solves high-frequency operational problems before expanding into broader healthcare workflows.

## MVP Goal

Help a pharmacy run its daily operations with:

- accurate medicine inventory
- faster sales and dispensing
- theft and hidden loss prevention
- expiry monitoring
- owner visibility and accountability

## In Scope For V1

### Authentication and Access

- Secure login
- Role-based access control
- Roles: Owner/Admin, Pharmacist, Cashier/Assistant

### Inventory

- Create and manage medicines
- Record stock-in by batch
- Track quantity, batch number, expiry date, and pricing
- View stock levels by medicine and batch

### Sales

- Search medicines quickly
- Record sales
- Reduce stock automatically after sale
- Store a transaction record

### Adjustments and Loss Prevention

- Manual stock adjustments
- Mandatory adjustment reasons
- Movement history per medicine and batch
- Suspicious loss visibility for owners

### Alerts

- Low-stock alerts
- Near-expiry alerts
- Expired stock alerts

### Audit and Reporting

- Track who changed what and when
- Daily sales summary
- Stock and adjustment summary

### Platform Requirements

- Desktop web app first
- Offline-friendly architecture
- Docker-deployable services
- Open-source core

## Explicitly Out Of Scope For V1

- Insurance billing
- Supplier marketplace
- Delivery logistics
- Patient mobile app
- Multi-branch workflows beyond a single default branch
- National regulator integrations
- AI forecasting
- Full e-prescription network integration

## Core User Journeys

### Owner/Admin

- Create pharmacy setup
- Create staff accounts and assign roles
- Review dashboard, reports, and audit logs
- Approve sensitive stock corrections

### Pharmacist

- Record incoming stock
- Search medicines
- Record sales
- Review alerts
- Perform approved inventory adjustments

### Cashier/Assistant

- Record limited sales
- Operate within role restrictions

## Success Criteria For V1

- A pharmacy can always see current stock on hand
- Sales are recorded faster than manual workflows
- Every stock movement is traceable
- Expiring stock is visible before it becomes loss
- Owners can identify unexplained inventory changes quickly
