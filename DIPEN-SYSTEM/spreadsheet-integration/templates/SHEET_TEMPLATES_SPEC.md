# Google Sheets Two-Way Data Entry Templates Specification

Two Google Spreadsheets are preserved intact and integrated bi-directionally via **Google Sheets API v4** from the DIPEN-SYSTEM Spring Boot backend:

1. **Operations & Inventory Spreadsheet ID**: `1gGmpt4gKEE4Nu42960A8cmdrXaTpT-IKHW5oTAWGAJs`
2. **Procurement & Tender Spreadsheet ID**: `16SN_MJjvmWqt_OH8Hol3AVGB6hWFTM_rYOG1FTi2-yY`

---

## 1. Operations & Inventory Sheet Tabs (Header Row 1)

### `Item Master`
`Item Code | Item Name | Categories | Brand Categories | HSN Code | Index Unit | Fraction of Index Unit | Conversion Quantity | Conversion Unit | Reorder Level | Status | Created Date | Updated Date`

### `Production`
`Production ID | Production Date | Item Code | Item Name | Category | Brand | Quantity | UOM | Base Qty (Index) | Batch/Lot Number | Production Reference | Department/Section | Unit Rate | Currency | Exch. Rate | Total Amount | Total (NPR) | Remarks | Created By | Timestamp | Status`

### `Dispatch`
`Dispatch ID | Dispatch Date | Item Code | Item Name | Category | Brand | Quantity | UOM | Secondary Qty | Index Qty | Base Qty (Index) | Invoice Number | Challan Number | Customer/Party Name | Vehicle Number | Unit Rate | Currency | Exch. Rate | Total Amount | Total (NPR) | Remarks | Created By | Timestamp | Status`

### `Goods Reciept`
`Receipt ID | Receipt Date | Item Code | Item Name | Category | Brand | Quantity | UOM | Base Qty (Index) | Batch/Lot Number | Purchase Reference | PO No | Supplier Name | Unit Rate | Currency | Exch. Rate | Total Amount | Total (NPR) | Remarks | Created By | Timestamp | Status`

### `Issue`
`Issue ID | Issue Date | Item Code | Item Name | Category | Brand | Quantity | UOM | Base Qty (Index) | Batch/Lot Number | Issue Reference | Department/Production Section | Issued To | Unit Rate | Currency | Exch. Rate | Total Amount | Total (NPR) | Remarks | Created By | Timestamp | Status`

---

## 2. Procurement & Tender Sheet Tabs (Header Row 1)

### `Indents`
`IndentNo | Date | Department | Requester | ItemCode | ItemName | RequiredQty | Unit | RequiredDeliveryDate | Priority | Status | ApprovedBy | ApprovalDate | Remarks | Timestamp`

### `Suppliers`
`SupplierId | Name | PanNo | GstNo | ContactPerson | Phone | Email | Country | Address | PaymentTerms | Currency | LeadTimeDays | Rating | Timestamp`

### `FreightForwarder`
`ForwarderId | Name | Address | ContactPerson | Phone | Email | Rating | Remarks | Timestamp`

### `Quotations`
`QuotationNo | IndentNo | SupplierId | SupplierName | Date | ValidityDate | Currency | ExchangeRate | Incoterms | FreightCharges | OtherCharges | Subtotal | TotalAmount | TotalAmountNPR | Status | MDApproval | MDApprovalDate | MDNotes | AttachmentName | AttachmentUrl | ItemsJSON | Timestamp`

### `PurchaseOrders`
`PONo | QuotationNo | SupplierId | SupplierName | OrderDate | DeliveryTerms | PaymentTerms | Incoterms | Currency | ExchangeRate | TotalValue | TotalValueNPR | ExpectedDeliveryDate | Status | ApprovalStatus | ItemsJSON | ReceivedStatus | ReceivedQty | PendingQty | Timestamp`

### `LCTTPayments`
`PaymentId | PONo | SupplierName | BankName | PaymentType | Currency | Amount | ExchangeRate | AmountNPR | LCNumber | LCOpeningDate | MaturityDate | Status | PaymentStage | Remarks | Timestamp`

### `Shipments`
`ShipmentId | PONo | SupplierName | ForwarderId | ForwarderName | ShippingLine | OriginType | OriginCountry | POL | POD | ContainerNo | BLAWBNo | ETD | ETA | ActualDeparture | ActualArrival | CustomsStatus | FreightAmountNPR | ShipmentStatus | Remarks | Timestamp`

### `Tenders`
`TenderNo | TenderName | Address | ContactInfo | PublicationDate | SubmissionDeadline | ItemName | Quantity | Unit | EstimatedRate | BidSecurityAmount | BidSecurityStatus | Result | Remarks | Timestamp`

### `TenderTracking`
`TrackingId | TenderNo | TenderName | Address | ContactInfo | LastSubmissionDate | ItemName | Unit | Quantity | RateIncVat | Amount | MuchulkaStatus | MuchulkaDate | LOIStatus | LOIDate | LOAStatus | LOADate | PGStatus | PGDate | SampleStatus | SampleDate | ProductionStatus | DispatchStatus | DispatchDate | Remarks | Timestamp`

### `ExchangeRates`
`RateDate | USD | INR | EUR | GBP | CNY | NPR | Remarks | UpdatedBy | UpdatedAt`
