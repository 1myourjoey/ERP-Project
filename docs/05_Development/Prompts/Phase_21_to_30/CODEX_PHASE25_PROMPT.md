# Phase 25: [Architect Version] Data Integrity & Operational Connectivity

> **Role:** Technical Architect & ERP System Lead
> **Context:** V:ON ERP System Stabilization
> **Objective:** Eliminate "Ghost" processes by enforcing strict ACID transactions between Business Objects (Capital Call) and Process Objects (Workflow), and establishing a robust Master Data topology for LPs.

---

## 1. Executive Summary

### Critical Diagnosis (The "Missing Link")
*   **The Symptom**: Users create a Capital Call via Wizard, but the "Process" doesn't start. No Workflow is created, so "Payment Confirmation" logic in the workflow never triggers. Data remains static.
*   **The Root Cause**: `CapitalCallWizard` currently performs a **Shallow Transaction** (DB insert only). It fails to orchestrate the lifecycle.
*   **The Solution**: Upgrade Wizard to perform a **Deep Transaction**:
    1.  Create `CapitalCall` (DB).
    2.  Create `CapitalCallItems` (DB).
    3.  **Auto-spawn `WorkflowInstance`** (Process) linked via strict Metadata.
    4.  **Auto-match LP Metadata** from Address Book.

---

## 2. Detailed Specification

### Part 1: Data Integrity & Logical Connectivity (Capital Calls)

**1.1. Deep Transaction Wizard**
*   **Requirement**: The "Capital Call Wizard" must be the single point of truth for starting the collection process.
*   **Implementation**:
    *   **Frontend**: `CapitalCallWizard.handleSubmit` must chain API calls or call a new Composite API.
    *   **Backend**: `POST /api/capital-calls/batch` should accept an optional `create_workflow: bool` flag (or similar).
    *   **Orchestration**:
        *   Upon success of Capital Call creation, Backend (or Frontend chain) searches for the template "Initial Capital Call" or "Additional Capital Call".
        *   Creates `WorkflowInstance` with `memo="[Linked CapitalCall:#{id}] ..."`.
        *   **Crucial**: The Workflow's distinct steps (e.g., "Send Notice", "Confirm Payment") must be mapped.

**1.2. Bi-directional Synchronization**
*   **Forward Sync**: Workflow Step "Payment Confirmed" -> Updates `CapitalCallItem.paid = True` -> Updates `LP.paid_in`.
*   **Backward Sync**: If a user manually updates `CapitalCallItem.paid` in the Data Grid (Admin override), it should optionally advance the Workflow or just log the variance.
*   **Guardrails**:
    *   Prevent deleting a Capital Call if a Workflow is active.
    *   Prevent double-counting `LP.paid_in` (Ensure idempotent increment logic).

**1.3. Fund Overview Integrity**
*   **Logic**: `Fund.paid_in_total` is a Computed Property, not a stored column (or if stored, must be a Cached Column).
*   **Validation**:
    *   `Sum(LP.paid_in) == Fund.paid_in_total`
    *   `Sum(CapitalCallItem.paid_amount) == Fund.paid_in_total`
*   **Fix**: Implement a `recalculate_fund_stats(fund_id)` utility in Backend. Call this trigger on *any* `CapitalCallItem` mutation.

### Part 2: LP Address Book Topology (Master Data)

**2.1. Topology Shift**
*   **Previous**: `LP Address Book` was a hidden helper.
*   **Now**: `LP Address Book` is a First-Class Citizen in the "Management" (Admin) Namespace.

**2.2. Master Data Scope**
*   **Global View**: "LP Management" Page shows ALL entities (Samsung Life, KB Securities, Hong Gil Dong).
*   **Fund View**: "This Entity invested in [Fund A, Fund B]".
    *   Add `related_funds` (many-to-many or virtual) column in Address Book Grid.

**2.3. Duplication Policy (Strict Logic)**
*   **Global Scope**: `AddressBook.business_number` should be Unique (Warn-only if soft enforcement needed, but Hard Unique recommended for Data Quality).
*   **Fund Scope**:
    *   `LP(fund_id=A, address_book_id=1)` -> **Allowed**
    *   `LP(fund_id=B, address_book_id=1)` -> **Allowed** (Same Entity, different Fund)
    *   `LP(fund_id=A, address_book_id=1)` (Again) -> **BLOCKED** (Cannot be a dual partner in same fund unless distinct classes used).
*   **Implementation**: Add Database Unique Constraint `UNIQUE(fund_id, business_number)` or `UNIQUE(fund_id, name)`.

### Part 3: Migration & Prevention (Safety Net)

**3.1. Integrity Check Script**
*   Create a backend script (or API `GET /api/admin/integrity-check`) to report:
    *   LPs with `paid_in` != Sum of paid items.
    *   Funds with `total_paid` != Sum of LPs.
    *   Orphaned Capital Calls (No Workflow).
    *   Orphaned Workflows (Capital Call Process but no Call ID in memo).

---

## 3. Files to Create / Modify

### Backend
1.  `backend/routers/capital_calls.py`: Enhance batch create to handle Workflow Linkage.
2.  `backend/routers/workflows.py`: Strengthen `complete_step` hook to ensure it parses `[CapitalCall:#ID]` reliably.
3.  `backend/models/lp_address_book.py`: (From Phase 24) Ensure `relationship` to `FundLP` is established for "Related Funds" view.
4.  `backend/routers/admin.py` (New): For Integrity Check API.
5.  `backend/schemas/lp_address_book.py` (New): Add `related_funds` count.

### Frontend
1.  `frontend/src/pages/FundDetailPage.tsx`:
    *   Refactor `CapitalCallWizard` to Trigger Workflow.
    *   Display "Linked Workflow" badge in Capital Call Card.
2.  `frontend/src/pages/LPManagementPage.tsx` (New): Global Address Book Management.
    *   Columns: Name, Type, Biz No, **Invested Funds (Count/Tags)**.
3.  `frontend/src/components/Layout.tsx`: Move Address Book to Management Section.

---

## 4. Operational Scenario (User Story)

1.  **Manager** clicks "Capital Call Wizard" in Fund A.
2.  **System** creates Call #5 for 100M KRW.
3.  **System** *automatically* starts "Capital Call Process #88".
4.  **Manager** goes to Workflows tab, sees "Process #88" in "Drafting Notice" stage.
5.  **Manager** completes steps -> "Payment".
6.  **System** updates Call #5 items to "Paid".
7.  **Fund A** Overview immediately shows 100M KRW increase in Paid-In capital.

---

> **Architect's Sign-off**:
> This specification targets the *Logical Gap* between the "Data Layer" (Wizard) and "Process Layer" (Workflow). By bridging this, the ERP becomes an *Active System* rather than a passive database.
