# US-015: Status Field Consistency Across Lifecycle Transitions

## Problem (The Pain)
Cory calls garp_status for a completed request and sees `"status": "pending"` in the request JSON even though the file is in requests/completed/. This is because garp_respond moves the file to completed/ via git mv but never updates the status field in the JSON. The directory location is correct, but the JSON payload is misleading. An agent parsing the response JSON would see conflicting signals: the status result says "completed" (derived from directory) but the embedded request says "pending" (the original value).

## Who (The User)
- Cory or Dan, checking request status
- An agent parsing garp_status output programmatically
- Anyone reading raw JSON files in the repo for audit/debugging

## Solution (What We Build)
Update garp_respond to set the status field to "completed" in the request JSON before moving it. Apply the same pattern to garp_cancel (status: "cancelled"). Ensure the status field in the JSON always matches the directory location after any lifecycle transition.

## Domain Examples

### Example 1: Completed Request Has Correct Status in JSON
Dan responds to Cory's request. garp_respond reads the request JSON, sets status to "completed", writes the updated JSON, then moves it to completed/. When Cory later reads the JSON file directly or via garp_status, the status field says "completed."

### Example 2: Cancelled Request Has Correct Status in JSON
Cory cancels a pending request. garp_cancel reads the request JSON, sets status to "cancelled", writes the updated JSON, then moves it to cancelled/. The JSON is internally consistent.

### Example 3: New Request Starts with Correct Status
Cory sends a new request. garp_request creates the JSON with status "pending" and writes it to pending/. This already works correctly -- the status matches the directory on creation. No change needed here.

## UAT Scenarios (BDD)

### Scenario: garp_respond updates status to "completed"
Given a pending request "req-20260222-140000-cory-a1b2" with status "pending" in JSON
When Dan calls garp_respond for that request
Then the request JSON in requests/completed/ has status "completed"
And the response file exists in responses/

### Scenario: garp_cancel updates status to "cancelled"
Given a pending request "req-20260222-140000-cory-a1b2" with status "pending" in JSON
When Cory calls garp_cancel for that request
Then the request JSON in requests/cancelled/ has status "cancelled"

### Scenario: Status field matches directory for all existing lifecycle transitions
Given requests in each directory:
  | directory  | expected_status |
  | pending/   | pending         |
  | completed/ | completed       |
  | cancelled/ | cancelled       |
When someone reads each request JSON
Then the status field matches the expected_status for its directory

## Acceptance Criteria
- [ ] garp_respond updates the request JSON status to "completed" before moving to completed/
- [ ] garp_cancel updates the request JSON status to "cancelled" before moving to cancelled/
- [ ] The status field in the JSON matches the directory location after any lifecycle transition
- [ ] New requests created by garp_request have status "pending" (no change needed, already correct)

## Technical Notes
- In garp-respond.ts, after reading the request envelope (step 4), update the status field to "completed" and write the updated JSON back before the git mv. The sequence: read JSON -> update status -> write JSON -> git mv -> git add both files -> commit.
- In garp-cancel.ts (US-013), apply the same pattern: read -> update status to "cancelled" -> write -> git mv.
- This is a small change to existing code but important for data consistency. The request JSON should be a single source of truth, not contradicted by its directory location.
- Existing completed requests in repos will still have status "pending" in their JSON. This is a known data inconsistency for pre-Phase-2 requests. A migration script could fix them but is out of scope.

## Dependencies
- US-013 (garp_cancel) must apply this pattern for cancelled status
- Modifies garp_respond (src/tools/garp-respond.ts)
