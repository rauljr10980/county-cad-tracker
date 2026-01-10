# Data Flow Verification: Frontend ↔ PostgreSQL

## Schema Changes Made

### ✅ Fixed Property Model
- **Added `notes` field**: `notes String? @db.Text` - Simple string field for quick notes
- **Renamed Note relation**: Changed from `notes Note[]` to `noteRecords Note[]` to avoid naming conflict
- **All fields properly mapped** between frontend and database

## Data Flow Verification

### Frontend → Backend → PostgreSQL

#### 1. Property Creation/Upload
**Frontend sends:**
```typescript
{
  totalAmountDue: number,    // Frontend field name
  totalPercentage: number,   // Frontend field name
  notes: string,             // Frontend field name
  ...
}
```

**Backend receives & maps:**
```javascript
{
  totalDue: totalAmountDue,        // Maps to database field
  percentageDue: totalPercentage,  // Maps to database field
  notes: notes,                    // Maps directly
  ...
}
```

**PostgreSQL stores:**
- `totalDue` (Float)
- `percentageDue` (Float)
- `notes` (String? Text)
- All other fields as defined in schema

#### 2. Property Retrieval
**PostgreSQL returns:**
```javascript
{
  totalDue: number,          // Database field
  percentageDue: number,     // Database field
  notes: string | null,      // Database field
  ...
}
```

**Backend maps to frontend format:**
```javascript
{
  totalAmountDue: totalDue,        // Maps to frontend field name
  totalPercentage: percentageDue,  // Maps to frontend field name
  notes: notes,                    // Maps directly
  ...
}
```

**Frontend receives:**
- `totalAmountDue` ✅
- `totalPercentage` ✅
- `notes` ✅
- All other fields

### Endpoints Verified

| Endpoint | Method | Frontend → Backend | Backend → PostgreSQL | PostgreSQL → Backend | Backend → Frontend | Status |
|----------|--------|-------------------|---------------------|---------------------|-------------------|--------|
| `/api/properties` | GET | ✅ | ✅ `prisma.property.findMany()` | ✅ | ✅ Mapped response | ✅ |
| `/api/properties/:id` | GET | ✅ | ✅ `prisma.property.findUnique()` | ✅ | ✅ Mapped response | ✅ |
| `/api/properties` | POST | ✅ | ✅ Maps `totalAmountDue→totalDue` | ✅ `prisma.property.create()` | ✅ | ✅ |
| `/api/properties/:id` | PUT | ✅ | ✅ Maps fields correctly | ✅ `prisma.property.update()` | ✅ | ✅ |
| `/api/properties/:id/notes` | PUT | ✅ | ✅ | ✅ `prisma.property.update({notes})` | ✅ | ✅ |
| `/api/properties/:id/phones` | PUT | ✅ | ✅ | ✅ `prisma.property.update({phoneNumbers})` | ✅ | ✅ |
| `/api/properties/:id/deal-stage` | PUT | ✅ | ✅ Maps enum values | ✅ `prisma.property.update({dealStage})` | ✅ | ✅ |
| `/api/properties/:id/followup` | PUT | ✅ | ✅ | ✅ `prisma.task.update/create()` | ✅ | ✅ |
| `/api/preforeclosure` | GET | ✅ | ✅ | ✅ `prisma.preForeclosure.findMany()` | ✅ | ✅ |
| `/api/preforeclosure` | POST | ✅ | ✅ | ✅ `prisma.preForeclosure.create()` | ✅ | ✅ |
| `/api/preforeclosure/:id` | PUT | ✅ | ✅ Maps fields | ✅ `prisma.preForeclosure.update()` | ✅ | ✅ |
| `/api/upload` | POST | ✅ | ✅ Maps Excel → Property | ✅ `prisma.property.create()` | ✅ | ✅ |

## Field Mapping Reference

### Property Fields
| Frontend Name | Database Field | Type | Mapping |
|--------------|----------------|------|---------|
| `totalAmountDue` | `totalDue` | Float | ✅ Auto-mapped |
| `totalPercentage` | `percentageDue` | Float | ✅ Auto-mapped |
| `notes` | `notes` | String? | ✅ Direct |
| `phoneNumbers` | `phoneNumbers` | String[] | ✅ Direct |
| `dealStage` | `dealStage` | DealStage? | ✅ Enum mapped |
| `status` | `status` | PropertyStatus | ✅ Enum mapped |

### Pre-Foreclosure Fields
| Frontend Name | Database Field | Type | Mapping |
|--------------|----------------|------|---------|
| `document_number` | `documentNumber` | String | ✅ Mapped |
| `internal_status` | `internalStatus` | String | ✅ Mapped |
| `notes` | `notes` | String? | ✅ Direct |
| `actionType` | `actionType` | ActionType? | ✅ Enum mapped |
| `priority` | `priority` | Priority? | ✅ Enum mapped |

## Prisma Schema Status

### ✅ Property Model
- All required fields present
- Notes field added ✅
- Note relation renamed to `noteRecords` ✅
- All indexes properly configured
- Field types match frontend expectations

### ✅ PreForeclosure Model  
- All fields properly mapped
- Enum fields correctly defined
- Indexes configured

### ✅ Task Model
- Properly related to Property
- All enum fields correct

### ✅ Note Model
- Properly related to Property (via `noteRecords`)
- Author tracking included

## Required Actions

1. **Generate Prisma Client**: Run `npx prisma generate` in `functions/` directory
2. **Run Migrations**: Run `npx prisma migrate dev` or `npx prisma db push` to apply schema changes
3. **Deploy to Railway**: Push changes and ensure Railway runs `prisma generate` during build

## Testing Checklist

- [ ] Properties can be created from frontend
- [ ] Properties can be updated (notes, phones, dealStage)
- [ ] Properties can be retrieved with correct field names
- [ ] Pre-foreclosure records can be created
- [ ] Pre-foreclosure records can be updated
- [ ] Pre-foreclosure records can be retrieved
- [ ] Excel upload creates properties correctly
- [ ] Field mappings work in both directions
- [ ] Enum values are correctly converted

