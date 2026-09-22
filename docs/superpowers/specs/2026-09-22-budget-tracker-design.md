# Data Lake budget tracker

## Purpose

A shared web app for the Data Lake department at Orange Egypt. Two editors keep one set of records. A viewer, the CTO, opens a presentable dashboard and cannot change data.

The app answers, for a selected year:

- Submitted invoices
- In-progress IECs and in-progress PRs, as EGP totals and counts
- How much PO value is to be capitalized in that year
- Cashed-out amount, remaining cash-out, and cashed-out percentage per PO and across that year’s POs
- Approved budget, committed PO value, cashed out, and uncommitted budget

Oracle receivings, FAC documents, and IEC slide decks stay outside the app. Editors record that those documents exist. The official capex and opex workbooks stay outside the app. Editors read the dashboard when they fill those workbooks.

## Access

One private website and one shared database. Any work laptop opens the same URL. Sign-in is required. There is no public page.

Three accounts, created during setup:

| Account | Who | Access |
|---|---|---|
| Editor | The person assigned this budget task | Dashboard and all create/edit pages |
| Editor | One coworker | Same as the other editor |
| Viewer | The CTO | Dashboard only |

Both editors see a saved record on the next load. The viewer never sees edit controls, and the server rejects any create, update, or delete from that account.

## Money

Every amount is stored as a number plus a currency code (`EGP`, `USD`, or `EUR`). Dashboard figures are EGP.

Each year has editable rates. EGP is always 1. The 2026 rates start at USD `52.6` and EUR `61`, taken from the department’s 2026 budget files. An editor can change a year’s rates. Changing a rate recalculates every EGP figure that uses that year. It does not rewrite the original amount or currency.

EGP value = amount × that year’s rate for the currency. A USD or EUR amount cannot be saved until that year’s rate exists.

Which year supplies the rate:

- Budget line, PR, IEC: the year on that record
- PO: the PO’s budget year
- Invoice: the budget year of its PO

The mini-IEC test uses the IEC’s requested amount converted with the IEC’s year rate. Requested amount below `2,000,000` EGP is a mini IEC. `2,000,000` EGP and above is a full IEC.

## Records

Links between a budget line, a PR, an IEC, and a PO are optional. A 2026 PO can exist before older paperwork is attached.

### Year rates

- Year
- USD to EGP
- EUR to EGP

### Budget line

- Year
- Project title
- Capex or opex
- Currency and approved amount

The year’s approved budget is the sum of these lines in EGP.

### PR

- Title
- Year, used for the exchange rate
- Amount and currency
- Optional budget line
- Status, set by an editor: `Draft`, `In progress`, `Approved`, `Rejected`, or `Closed`

### IEC

- Title
- Year, used for the exchange rate and the mini-IEC test
- Project code, such as `DG1`
- Supplier, optional
- Capex or opex
- Currency
- Budget amount and requested amount, in that currency
- Optional short note for the objective or the no-go impact
- Optional PR
- Status, same five values as a PR, set by an editor

The app shows Mini or Full from the requested amount. The editor does not pick that label.

### PO

- PO number, unique
- Budget year, required. This is the year the PO sits on for committed value and cash-out totals
- Supplier
- Description
- Contract amount and currency. May be blank until the editor knows the contract value
- Capex or opex
- Optional budget line
- Capitalization start month and end month, as calendar months. Both may be blank

### Invoice

- PO, required
- Amount and currency
- Submission date
- Description, optional
- Oracle receipt number, optional
- FAC reference, optional

An invoice is submitted as soon as it is saved. It is cashed out only when both the receipt number and the FAC reference are saved on that same invoice. Those two fields are entered together. The server rejects a save that fills one and leaves the other empty. Clearing both is allowed and returns the invoice to submitted only.

## Calculations

Headlines are computed when the dashboard loads. Stored totals are not used.

The dashboard has a year switcher. The default year is the current calendar year.

### Submitted invoices

Sum of invoice EGP whose submission date falls in the selected year. This includes an invoice on a PO from another budget year if the invoice was submitted in the selected year.

### In progress

Live, and not filtered by the year switcher.

- In-progress IECs: count, and sum of requested amount in EGP, where status is `In progress`
- In-progress PRs: count, and sum of amount in EGP, where status is `In progress`

`Draft`, `Approved`, `Rejected`, and `Closed` are excluded.

### Capitalization

Applies to each PO that has both a start month and an end month, and a contract amount.

Count every calendar month from the start month through the end month, including both. Give each month an equal share of the full contract value in EGP:

`month share = PO EGP / number of months in the period`

The selected year’s capitalization is the sum of month shares whose month falls in that year. This includes a PO whose budget year is different, when its period overlaps the selected year.

Examples:

- March 2026 through September 2026 is 7 months, all in 2026.
- June 2026 through June 2027 is 13 months: 7 in 2026 and 6 in 2027.

A PO with a missing contract amount, or a missing start or end month, is excluded from this sum and listed on the dashboard as incomplete.

### Cash-out

For one PO, cashed out is the sum of EGP on its invoices that have both a receipt number and a FAC reference. Invoices that are only submitted do not count.

- Percentage = cashed out / PO EGP
- Remaining = PO EGP − cashed out

The dashboard totals sum those figures for every PO whose budget year is the selected year and whose contract amount is filled in. Percentage for the total is total cashed out / total PO EGP for that set.

A PO with a blank contract amount is excluded from the percentage and from committed value, and listed as incomplete. Its invoices still count toward submitted invoices.

### Budget strip

For the selected year, in EGP:

- Approved: sum of budget lines
- Committed: sum of contract amounts for POs with that budget year and a filled contract amount
- Cashed out: the cash-out total defined above
- Uncommitted: approved − committed

If committed is greater than approved, the strip shows the difference as an overrun.

## Screens

Light page, Orange as the accent, large EGP figures. The viewer lands here and has nowhere else to go.

Top to bottom:

1. Year switcher.
2. Four headlines: submitted invoices; in-progress IECs (EGP and count) and in-progress PRs (EGP and count); amount to capitalize in the selected year; cashed out, remaining cash-out, and overall cashed-out percentage for that year’s POs.
3. Budget strip: approved, committed, cashed out, uncommitted.
4. PO table for POs with that budget year: PO number, supplier, contract value, cashed-out percentage, remaining cash-out, this year’s capitalization share, and the share that falls in other years. Incomplete POs are marked. A PO whose invoices sum to more than its contract value is marked over the contract.
5. PO detail, opened from the table: invoices marked submitted or cashed out, with receipt number and FAC reference when cashed out, plus the month-by-month split.
6. Pipeline: IECs and PRs whose status is `In progress`, with amount and Mini or Full on each IEC.

Editors have additional pages to create and edit year rates, budget lines, PRs, IECs, POs, and invoices. Marking an invoice cashed out asks for the receipt number and the FAC reference in one save.

## Data flow

An editor submits a form. The server validates it, writes the record, and the next dashboard load recomputes every headline from the records.

### Starting data

One import from `references/Data - List of POs 2026.xlsx`, sheet `Consumption per PO`.

For each data row, create a 2026 PO if that PO number does not exist yet, and create one invoice:

- PO number, supplier, and description come from the row
- Budget year is 2026
- Contract amount and capitalization period stay blank
- Invoice amount is the row’s invoice amount, currency from the row, submission date from the row
- Receipt number and FAC reference stay empty, so these invoices are submitted and not cashed out

The sheet’s total row is not imported. The imported invoice EGP for 2026 is `15,044,222.58`. The import runs once during setup. Running it again does not create a second invoice for the same PO number, amount, and submission date.

`Actual Consumed Budget 2026.xlsx` is the same consumption and is not imported again. Issued POs is empty and is not a source of contract values.

## Validation

- Cashed out requires both receipt number and FAC reference. One without the other is rejected.
- Capitalization end month is on or after the start month. A pair that runs backwards is rejected. Saving neither month is allowed.
- USD or EUR cannot be saved for a year that has no rate.
- PO numbers are unique.
- Amounts that are present are greater than zero.
- An invoice whose EGP is greater than the PO’s remaining cash-out is saved and shown as over the remaining cash-out. The PO is also marked when the sum of its invoice EGP exceeds its contract EGP.
- The viewer account cannot create, update, or delete.

## Out of scope

- Generating Oracle receiving PDFs, FAC Word files, or IEC PowerPoint decks
- Filling or exporting the official capex and opex templates
- More than two editors and one viewer
- Reading Oracle directly

## Verification

Before the app is considered finished, these checks pass:

- March 2026–September 2026 puts the full PO value in 2026.
- June 2026–June 2027 puts `7/13` of the PO value in 2026 and `6/13` in 2027.
- A requested amount below `2,000,000` EGP is a mini IEC. `2,000,000` EGP is a full IEC. A USD request uses the IEC year’s rate before the test.
- Cashed-out percentage and remaining cash-out include only invoices with both document references.
- In-progress totals include only status `In progress`, and they do not change when the year switcher changes.
- Submitted invoices follow the submission date’s year.
- A PO with no period or no contract amount is absent from the capitalization total and visibly incomplete.
- An invoice over the remaining cash-out is stored and flagged.
- A save with only a receipt number, or only a FAC reference, is rejected.
- The viewer can load the dashboard and cannot change records.
- The consumption import produces `15,044,222.58` EGP of 2026 submitted invoices and does not mark any of them cashed out.
