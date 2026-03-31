# PharmaHub MVP

## MVP Vision

PharmaHub is an offline-friendly pharmacy management system for Ethiopian pharmacies. The MVP is designed to help pharmacies manage stock, record sales, reduce medicine theft and hidden losses, monitor expiry, and give owners clear visibility into daily operations.

## Core Goal

The MVP should help a single pharmacy:

- Track medicine inventory accurately
- Sell and dispense medicines faster
- Prevent theft and unexplained stock loss
- Identify low-stock and expiring medicines early
- Give the owner daily operational visibility

## Primary Problems To Solve

- Manual inventory tracking creates errors
- Medicines can be lost, stolen, or unaccounted for
- Staff may not know current stock levels at any time
- Expired medicines may remain mixed with sellable stock
- Owners have limited visibility into daily activity
- Internet connectivity may be unreliable, so the system must still work offline

## Core Users

### Owner or Admin

- Manages users and permissions
- Reviews reports and daily performance
- Monitors stock loss and suspicious adjustments
- Approves sensitive actions

### Pharmacist

- Searches medicines
- Records sales and dispensing
- Adds or updates stock during normal operations
- Checks low-stock and expiry alerts

### Cashier or Assistant

- Records limited sales activity
- Has restricted permissions
- Cannot perform sensitive stock adjustments without approval

## Core MVP Modules

### 1. Authentication and Role Management

- Secure login with username and password
- Role-based access control
- Roles: Owner/Admin, Pharmacist, Cashier/Assistant
- Restrict sensitive actions by role

### 2. Inventory Management

- Add medicines into stock
- Track quantity on hand
- Track batch number
- Track expiry date
- Track buying price and selling price
- View current stock levels at any time
- Receive low-stock alerts

### 3. Sales and POS

- Search medicines quickly
- Select quantity and complete sale
- Automatically reduce stock after each sale
- Create a receipt or transaction record
- Support basic cash sales in the first version

### 4. Expiry Management

- Show medicines nearing expiry
- Flag expired medicines clearly
- Help staff separate unsellable stock from active stock

### 5. Theft and Loss Prevention

- Record every stock movement
- Track which user performed each action
- Require a reason for manual stock adjustments
- Prevent silent stock disappearance
- Show suspicious or unusual adjustments for review

### 6. Reporting Dashboard

- Daily sales summary
- Current stock overview
- Low-stock medicines
- Expiring medicines
- Adjustment and loss summary

### 7. Offline-First Operation

- Continue working without internet
- Save data locally during outages
- Sync data when internet becomes available again

## Main Screens

### Login

- Username and password login
- Access based on role

### Dashboard

- Today’s sales
- Low-stock count
- Expiring medicines count
- Suspicious adjustment count
- Quick links to common actions

### Inventory Screen

- List all medicines
- View stock quantity, batch, and expiry
- Add new medicine stock
- Update stock with permission controls

### Sales Screen

- Search medicines quickly
- Add quantity
- Complete transaction
- Generate a simple receipt or record

### Alerts Screen

- Low-stock medicines
- Near-expiry medicines
- Expired medicines
- Unusual inventory adjustments

### Audit Log Screen

- View who changed what
- View date and time of each action
- View adjustment reasons
- Review suspicious stock activity

### Reports Screen

- Daily sales report
- Low-stock report
- Expiry report
- Stock adjustment and loss report

### User Management Screen

- Add users
- Assign roles
- Reset passwords
- Disable accounts if needed

## MVP Workflow

### 1. Owner Setup

- The owner or admin creates the pharmacy account
- Staff users are added to the system
- Roles are assigned such as Owner/Admin, Pharmacist, and Cashier/Assistant

### 2. Stock Entry

- When medicines arrive from a supplier, the pharmacist or admin records them in inventory
- Each stock entry includes medicine name, quantity, batch number, expiry date, buying price, selling price, and supplier
- Once saved, the medicine becomes available for sale

### 3. Daily Dashboard Check

- At the start of the day, staff review the dashboard
- The dashboard highlights low-stock medicines, expiring medicines, suspicious adjustments, and sales summary information

### 4. Customer Request or Prescription

- A customer requests a medicine or presents a prescription
- The pharmacist searches for the medicine in the system
- The system shows availability, quantity, expiry status, and selling price

### 5. Sale or Dispensing

- The pharmacist or cashier records the transaction in the sales screen
- The system saves the transaction, reduces stock automatically, records the user responsible, and generates a receipt or sales record

### 6. Manual Stock Adjustment

- If stock changes for reasons other than a sale, the user records a manual adjustment
- Reasons may include damage, expiry, return, transfer, or stock count difference
- The system must require quantity changed, reason, user identity, and date and time

### 7. Alerts and Monitoring

- During daily operations, the system flags low-stock items, near-expiry items, expired medicines, and unusual stock movement
- Staff and owners can use these alerts to take action quickly

### 8. Audit and Accountability

- If there is a mismatch or suspicious change, the owner reviews the audit log
- The audit log shows who changed stock, who made sales, what was adjusted, why it was adjusted, and when it happened

### 9. End-of-Day Review

- At the end of the day, the owner or admin reviews total sales, stock changes, manual adjustments, suspicious losses, and reorder needs

### 10. Offline Sync

- If internet is unavailable, the system continues to work locally
- When internet returns, transactions and updates sync to the server

## Workflow Summary

Receive stock, record inventory, sell medicines, update stock automatically, monitor alerts, review adjustments, and close the day with reports.

## Workflow Principle

Every medicine movement must pass through the system:

- Stock-in
- Sale
- Return
- Damage
- Expiry
- Adjustment

## Critical Business Rules

- Every medicine movement must be recorded
- Every sale must automatically update stock
- Manual adjustments must require a reason
- Sensitive actions must be limited by permissions
- Expired stock must be clearly identified
- No stock should disappear without a recorded action

## Data The MVP Should Track

### Medicine Data

- Medicine name
- Generic name or brand name
- Category
- Strength and form
- Batch number
- Expiry date
- Quantity in stock
- Buying price
- Selling price
- Supplier
- Date added

### Transaction Data

- Medicine
- Quantity
- Price
- User
- Date and time
- Transaction type
- Reason for manual adjustment when applicable

## What The MVP Should Not Include Yet

- Full e-prescription integration
- Insurance billing
- Supplier marketplace
- Delivery logistics
- Advanced analytics and forecasting
- Multi-branch enterprise management
- National regulator integrations
- Patient mobile app

## Success Criteria

The MVP is successful if a pharmacy can:

- Know what stock is available at any time
- Process medicine sales faster than manual methods
- Detect low-stock items earlier
- Catch expiring medicines before loss increases
- Reduce theft and unexplained stock disappearance
- Give the owner clear daily visibility into pharmacy operations

## One-Sentence MVP Definition

PharmaHub is an offline-friendly pharmacy inventory, sales, expiry, and loss-control system built for Ethiopian pharmacies.
