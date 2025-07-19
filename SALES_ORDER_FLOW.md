# Sales Order Creation Flow

## Overview
This document describes the updated sales order creation flow implemented in the cotton trading application.

## Flow Steps

### 1. Order Header Information
- **Customer Selection**: Dropdown populated from `customer_info` table
- **Broker Selection**: Dropdown populated from `broker_info` table

### 2. Order Line Creation
For each order line, the following steps are performed:

#### 2.1 Indent Number Entry
- User enters indent number
- System validates against `procurement_dump` table
- Checks if indent exists and is active

#### 2.2 Indent Validation
- **Validation Check**: Indent must exist in `procurement_dump` table
- **Status Check**: Indent allocation status must be 'active'
- **Availability Check**: Calculates available bales (total - already sold)
- **Error Handling**: Shows appropriate error messages for invalid indents

#### 2.3 Allocation Details Display
Upon successful validation, the system displays:
- **Bales Quantity**: Total bales in the indent
- **Available Bales**: Remaining unsold bales
- **Centre Name**: Branch/centre name
- **Branch**: Branch information
- **Date**: Allocation date
- **Lifting Period**: Automatically fetched from allocation
- **Fibre Length**: Cotton specifications
- **Variety**: Cotton variety
- **Bid Price**: Price per bale

#### 2.4 Line Quantity Entry
- **Input Type**: Quantity in lots (not tons)
- **Validation**: Must be positive and not exceed available bales
- **Real-time Validation**: Prevents entering quantities beyond available stock

#### 2.5 Brokerage Information
- **Broker Brokerage per Bale**: Commission amount per bale
- **Our Brokerage per Bale**: Company's brokerage per bale
- **Validation**: Both fields are required and must be non-negative

### 3. Order Summary
Before submission, the system displays:
- **Total Lots**: Sum of all line quantities
- **Total Broker Brokerage**: Calculated total
- **Total Our Brokerage**: Calculated total

### 4. Order Submission
- **Validation**: All required fields must be completed
- **Database Storage**: Order stored in `sales_configuration` table
- **Line Items**: Stored in `line_specs` JSONB field
- **Lifting Period**: Automatically fetched from allocation data
- **Requested Quantity**: Automatically calculated from line items

## Database Changes

### Backend API Endpoints

#### POST `/api/sales/validate-indent`
Validates indent number and returns allocation details:
```json
{
  "indent_number": "IND001"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "indent": {
      "indent_number": "IND001",
      "bales_quantity": 2500,
      "available_bales": 2000,
      "centre_name": "Mumbai Branch",
      "branch": "Mumbai Branch",
      "date": "2025-01-15",
      "lifting_period": "30 days",
      "fibre_length": "28-29mm",
      "variety": "Shankar-6",
      "bid_price": 58.50
    }
  }
}
```

#### POST `/api/sales/new`
Creates new sales order:
```json
{
  "customer_id": "uuid",
  "broker_id": "uuid",
  "line_items": [
    {
      "indent_number": "IND001",
      "quantity": 50,
      "broker_brokerage_per_bale": 25.00,
      "our_brokerage_per_bale": 15.00
    }
  ]
}
```

### Frontend Changes

#### Form Structure
- Removed lifting period input field
- Added indent validation button
- Changed quantity input to lots
- Added brokerage fields per line item
- Added real-time validation and error handling

#### Validation Logic
- Indent number validation against procurement table
- Quantity validation against available stock
- Positive number validation for all numeric fields
- Required field validation

## Key Features

1. **Automatic Lifting Period**: Fetched from allocation data, no manual input required
2. **Real-time Validation**: Immediate feedback on indent validity and quantity limits
3. **Stock Management**: Prevents overselling by checking available quantities
4. **Detailed Display**: Shows comprehensive indent information after validation
5. **Order Summary**: Calculates totals before submission
6. **Error Handling**: Clear error messages for various validation failures

## Error Messages

- **Indent Not Found**: "Indent not found in procurement table"
- **Indent Not Active**: "Indent is not active for sales"
- **Insufficient Stock**: "Indent has only X bales available, but Y requested"
- **Invalid Quantity**: "Quantity cannot exceed available bales (X)"
- **Missing Fields**: "Please fill all fields in line items and validate indents"

## Testing

Run the test script to verify the flow:
```bash
node test_sales_flow.js
```

This will test:
1. Indent validation
2. Sales order creation
3. Pending orders fetch 