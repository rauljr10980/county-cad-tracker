# API Endpoints Documentation

## Base URL
- Production: `https://county-cad-tracker-production.up.railway.app`
- Development: `http://localhost:8080`

## Health & Status

### GET `/health`
Health check endpoint
- **Response**: `{ status: 'healthy', timestamp: ISO string }`

### GET `/`
API information
- **Response**: API name, version, status, database type, features

---

## Authentication (`/api/auth`)

### POST `/api/auth/register`
Register new user
- **Body**: `{ email, password, inviteCode }`
- **Response**: User object with token

### POST `/api/auth/login`
Login user
- **Body**: `{ email, password }`
- **Response**: User object with token

### GET `/api/auth/session`
Get current session
- **Auth**: Required
- **Response**: User object

### POST `/api/auth/logout`
Logout user
- **Auth**: Required

### GET `/api/auth/verify-email`
Verify email address

---

## Properties (`/api/properties`)

### GET `/api/properties`
Get all properties (paginated)
- **Query Params**: `page`, `limit`, `status`, `search`
- **Response**: `{ properties: [], total, page, limit }`

### GET `/api/properties/:id`
Get single property by ID
- **Response**: Property object

### POST `/api/properties`
Create new property
- **Auth**: Required
- **Body**: Property data

### PUT `/api/properties/:id`
Update property
- **Auth**: Required
- **Body**: Property updates

### PATCH `/api/properties/:id`
Partial update property
- **Auth**: Required
- **Body**: Partial property updates

### DELETE `/api/properties/:id`
Delete property
- **Auth**: Required

### POST `/api/properties/bulk-update`
Bulk update properties
- **Auth**: Required
- **Body**: `{ propertyIds: [], updates: {} }`

### PUT `/api/properties/:id/action`
Update property action
- **Body**: `{ actionType, dueTime, priority, assignedTo }`

### GET `/api/properties/stats/dashboard`
Get dashboard statistics
- **Response**: `{ totalProperties, byStatus, totalAmountDue, avgAmountDue, newThisMonth, removedThisMonth, deadLeads, amountDueDistribution, pipeline, tasks }`

### PUT `/api/properties/:id/followup`
Update follow-up date
- **Body**: `{ nextFollowUpDate }`

### PUT `/api/properties/:id/notes`
Update property notes
- **Body**: `{ notes }`

### PUT `/api/properties/:id/phones`
Update phone numbers
- **Body**: `{ phoneNumbers: [] }`

### PUT `/api/properties/:id/priority`
Update priority
- **Body**: `{ priority: 'high' | 'med' | 'low' }`

### PUT `/api/properties/:id/task-done`
Mark task as done
- **Body**: `{ outcome, nextAction }`

### PUT `/api/properties/:id/deal-stage`
Update deal stage
- **Body**: `{ dealStage }`

### PUT `/api/properties/:id/visited`
Mark property as visited
- **Body**: `{ visited, visitedAt, visitedBy }`

### POST `/api/properties/geocode/batch`
Batch geocode addresses
- **Body**: `{ addresses: [] }`
- **Response**: Geocoded results

### GET `/api/properties/geocode/status`
Get geocoding status
- **Response**: Status of geocoding jobs

---

## Tasks (`/api/tasks`)

### GET `/api/tasks`
Get all tasks
- **Response**: Array of properties with task information

### GET `/api/tasks/:id`
Get single task
- **Response**: Task object

### POST `/api/tasks`
Create new task
- **Body**: Task data

### PUT `/api/tasks/:id`
Update task
- **Body**: Task updates

### POST `/api/tasks/:id/outcome`
Record task outcome
- **Body**: `{ outcome, nextAction }`

### DELETE `/api/tasks/:id`
Delete task
- **Auth**: Required

---

## Pre-Foreclosure (`/api/preforeclosure`)

### GET `/api/preforeclosure`
Get all pre-foreclosure records
- **Query Params**: `address`, `city`, `zip`
- **Response**: Array of pre-foreclosure records

### POST `/api/preforeclosure/upload`
Upload pre-foreclosure file
- **Body**: FormData with file
- **Response**: `{ fileId, message, status: 'PROCESSING' }`
- **Background**: File processed asynchronously

### POST `/api/preforeclosure/upload-address-only`
Upload address-only pre-foreclosure file
- **Body**: FormData with file
- **Response**: `{ fileId, message, status: 'PROCESSING' }`
- **Background**: File processed asynchronously

### PUT `/api/preforeclosure/:documentNumber`
Update pre-foreclosure record
- **Body**: Record updates including `workflow_stage`

### PUT `/api/preforeclosure/:documentNumber/visit`
Mark record as visited
- **Body**: `{ visited, visitedAt, visitedBy }`

### GET `/api/preforeclosure/upload-history`
Get upload history
- **Query Params**: `limit`
- **Response**: Array of upload records

### GET `/api/preforeclosure/upload-stats/latest`
Get latest upload statistics
- **Response**: Latest upload stats

### DELETE `/api/preforeclosure`
Delete pre-foreclosure records
- **Body**: `{ documentNumbers: [] }`

---

## Files (`/api/files`)

### GET `/api/files`
Get all uploaded files
- **Response**: Array of file records with status

### DELETE `/api/files/:fileId`
Delete file
- **Auth**: Required

### POST `/api/files/:fileId/reprocess`
Reprocess file
- **Response**: `{ message: 'File reprocessing started' }`
- **Background**: File reprocessed asynchronously

### GET `/api/files/:fileId/status`
Get file processing status
- **Response**: `{ status, processedRecords, totalRecords, error }`

---

## Upload (`/api/upload`)

### POST `/api/upload`
Upload file (base64)
- **Body**: `{ file: base64, filename }`
- **Response**: `{ fileId, message, status: 'PROCESSING' }`
- **Background**: File processed asynchronously

### POST `/api/upload/excel`
Upload Excel file
- **Body**: FormData with file
- **Response**: `{ fileId, message, status: 'PROCESSING' }`
- **Background**: File processed asynchronously

### GET `/api/upload/:fileId/status`
Get upload status
- **Response**: `{ status, processedRecords, totalRecords, error }`

### GET `/api/upload`
Get all uploads
- **Response**: Array of upload records

### DELETE `/api/upload/properties/all`
Delete all properties (Admin only)
- **Auth**: Required (Admin role)

---

## Notes (`/api/notes`)

### GET `/api/notes`
Get all notes
- **Query Params**: `propertyId`
- **Response**: Array of notes

### GET `/api/notes/:id`
Get single note
- **Response**: Note object

### POST `/api/notes`
Create new note
- **Body**: Note data

### PUT `/api/notes/:id`
Update note
- **Body**: Note updates

### DELETE `/api/notes/:id`
Delete note
- **Auth**: Required

---

## Users (`/api/users`)

### GET `/api/users`
Get all users
- **Auth**: Required
- **Response**: Array of users

### GET `/api/users/:id`
Get single user
- **Auth**: Required
- **Response**: User object

### PUT `/api/users/:id`
Update user
- **Auth**: Required
- **Body**: User updates

### DELETE `/api/users/:id`
Delete user
- **Auth**: Required

---

## Routing (`/api/routing`)

### POST `/api/routing/solve`
Solve routing problem
- **Body**: Routing problem data
- **Response**: Optimized route

---

## Routes (`/api/routes`)

### GET `/api/routes`
Get all routes
- **Response**: Array of routes

### GET `/api/routes/active`
Get active routes
- **Response**: Array of active routes

### POST `/api/routes`
Create new route
- **Body**: Route data

### PUT `/api/routes/:id/finish`
Finish route
- **Body**: Route completion data

### PUT `/api/routes/:id/cancel`
Cancel route
- **Body**: Cancellation data

### DELETE `/api/routes/:id`
Delete route

### DELETE `/api/routes/:routeId/records/:recordId`
Remove record from route

### PUT `/api/routes/:routeId/records/:recordId/reorder`
Reorder records in route
- **Body**: `{ newIndex }`

### PUT `/api/routes/:routeId/records/:recordId/visit`
Mark record as visited in route
- **Body**: Visit data

---

## Zones (`/api/zones`)

### GET `/api/zones`
Get all zones
- **Response**: Array of zones

### GET `/api/zones/:id`
Get single zone
- **Response**: Zone object

### POST `/api/zones`
Create new zone
- **Auth**: Required
- **Body**: Zone data

### PUT `/api/zones/:id`
Update zone
- **Auth**: Required
- **Body**: Zone updates

### DELETE `/api/zones/:id`
Delete zone
- **Auth**: Required

---

## Background Processing

The following endpoints trigger background processing:

1. **File Uploads** (`/api/upload`, `/api/preforeclosure/upload`)
   - Files are processed asynchronously
   - Check status via `/api/upload/:fileId/status` or `/api/files/:fileId/status`

2. **Geocoding** (`/api/properties/geocode/batch`)
   - Batch geocoding runs in background
   - Check status via `/api/properties/geocode/status`

3. **File Reprocessing** (`/api/files/:fileId/reprocess`)
   - Reprocessing runs asynchronously
   - Check status via `/api/files/:fileId/status`

---

## Status Endpoints for Background Jobs

### File Processing Status
- `GET /api/upload/:fileId/status` - Check upload processing status
- `GET /api/files/:fileId/status` - Check file processing status

### Geocoding Status
- `GET /api/properties/geocode/status` - Check geocoding job status

---

## Authentication

Most endpoints support optional authentication via `optionalAuth` middleware.
Some endpoints require authentication via `authenticateToken` middleware.

**Headers**: `Authorization: Bearer <token>`

---

## Error Responses

All endpoints return errors in this format:
```json
{
  "error": "Error message"
}
```

Status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error
