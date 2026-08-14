# 📝 Notes Module - Blog Comments System

Complete modular implementation of a blog comments/notes system using NestJS + MongoDB.

## 🏗️ Architecture

### File Structure

```
src/notes/
├── schemas/
│   └── note.schema.ts              # Mongoose schema definition
├── services/
│   ├── notes.service.ts            # Business logic (CRUD, queries)
│   └── spam-detection.service.ts   # Anti-spam logic
├── dto/
│   ├── create-note.dto.ts          # Input validation
│   └── note-response.dto.ts        # Output serialization
├── notes.controller.ts             # HTTP endpoints
├── notes.module.ts                 # NestJS module definition
└── README.md                       # This file
```

## 📋 API Reference

### Public Endpoints

#### Create Note
```
POST /notes/:articleId
Content-Type: application/json

Request:
{
  "name": "John Doe",           // optional, max 100 chars
  "email": "john@example.com",  // optional, valid email
  "content": "Great article!",  // required, 3-1000 chars
  "website": "https://...",     // optional honeypot
  "honeypot": ""                // required, must be empty
}

Response (201):
{
  "id": "507f1f77bcf86cd799439012",
  "articleId": "507f1f77bcf86cd799439011",
  "name": "John Doe",
  "email": "john@example.com",
  "content": "Great article!",
  "isApproved": true,
  "createdAt": "2026-08-14T10:30:00.000Z",
  "updatedAt": "2026-08-14T10:30:00.000Z"
}

Error (400):
{
  "statusCode": 400,
  "message": "La nota è stata contrassegnata come spam",
  "error": "Bad Request"
}
```

#### Get Notes
```
GET /notes/:articleId?limit=50&skip=0

Response (200):
{
  "data": [
    {
      "id": "507f1f77bcf86cd799439012",
      "articleId": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "content": "Great article!",
      "isApproved": true,
      "createdAt": "2026-08-14T10:30:00.000Z",
      "updatedAt": "2026-08-14T10:30:00.000Z"
    }
  ],
  "total": 42
}
```

### Admin Endpoints (JWT Required)

#### Get Notes Stats
```
GET /notes/:articleId/stats
Authorization: Bearer <JWT_TOKEN>

Response (200):
{
  "total": 15,
  "approved": 13,
  "pending": 1,
  "spam": 1
}
```

#### Get Single Note
```
GET /notes/:noteId/admin
Authorization: Bearer <JWT_TOKEN>

Response (200):
{
  "id": "507f1f77bcf86cd799439012",
  "articleId": "507f1f77bcf86cd799439011",
  "name": "John Doe",
  "email": "john@example.com",
  "content": "Great article!",
  "isApproved": true,
  "isSpam": false,
  "spamScore": 0,
  "userIp": "192.168.1.1",
  "createdAt": "2026-08-14T10:30:00.000Z",
  "updatedAt": "2026-08-14T10:30:00.000Z"
}
```

#### Approve Note
```
PATCH /notes/:noteId/approve
Authorization: Bearer <JWT_TOKEN>

Response (200): Updated note
```

#### Reject Note
```
PATCH /notes/:noteId/reject
Authorization: Bearer <JWT_TOKEN>

Response (200): Updated note
```

#### Mark as Spam
```
PATCH /notes/:noteId/spam
Authorization: Bearer <JWT_TOKEN>

Response (200): Updated note
```

#### Delete Note
```
DELETE /notes/:noteId
Authorization: Bearer <JWT_TOKEN>

Response (204): No content
```

## 🔒 Security Features

### Honeypot
- Hidden field `honeypot` must be empty
- Automatically rejects if filled (spambot detection)

### Spam Detection
- **Keyword detection**: Filters common spam keywords
- **URL patterns**: Penalizes excessive links
- **Anonymous detection**: Scores anonymous submissions
- **Length heuristics**: Long content scores higher
- **Spam score**: 0-100 scale
  - Score < 30: Approved automatically
  - Score 30-50: Requires admin approval
  - Score > 50: Rejected automatically

### Input Validation
- `name`: Max 100 chars, alphanumeric + spaces
- `email`: Valid email format (RFC)
- `content`: 3-1000 chars, trimmed
- HTML escaping on all string fields

### Rate Limiting
- **Public POST**: 5 requests per minute per IP
- **Public GET**: 100 requests per minute per IP
- **Admin**: Standard global throttle (60/60s)

## 🗄️ Database Schema

### Note Document

```typescript
{
  // Reference to blog post
  articleId: ObjectId;          // Index: articleId, createdAt

  // User info
  name?: string;                // Max 100 chars
  email?: string;               // Valid email format
  content: string;              // 3-1000 chars, HTML-escaped

  // Moderation
  isApproved: boolean;          // Default: false if spam score > 30
  isSpam: boolean;              // Default: false
  spamScore: number;            // 0-100

  // Metadata
  userIp?: string;              // Stored for abuse tracking
  createdAt: Date;              // Index: DESC for sorting
  updatedAt: Date;
}
```

### Indexes

```
db.notes.createIndex({ articleId: 1, createdAt: -1 })
db.notes.createIndex({ articleId: 1, isApproved: 1, createdAt: -1 })
```

## 🧪 Testing Examples

### Create a Note
```bash
curl -X POST http://localhost:3000/notes/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mario Rossi",
    "email": "mario@example.com",
    "content": "Articolo fantastico!"
  }'
```

### Get Notes for Article
```bash
curl http://localhost:3000/notes/507f1f77bcf86cd799439011?limit=10&skip=0
```

### Get Stats (Admin)
```bash
curl http://localhost:3000/notes/507f1f77bcf86cd799439011/stats \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Approve Note (Admin)
```bash
curl -X PATCH http://localhost:3000/notes/507f1f77bcf86cd799439012/approve \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## 🔧 Configuration

### Environment Variables

No additional environment variables required. Uses:
- `MONGODB_URI`: MongoDB connection string
- `NODE_ENV`: dev | uat | prod

### Throttler Config

Override in `AppModule`:

```typescript
ThrottlerModule.forRoot([
  { ttl: 60000, limit: 60 }
])
```

Override per-endpoint:

```typescript
@Throttle({ default: { limit: 10, ttl: 60000 } })
async createNote(...) { }
```

## 📊 Monitoring & Analytics

### Get Stats
```typescript
const stats = await notesService.getArticleNotesStats(articleId);
// { total: 15, approved: 13, pending: 1, spam: 1 }
```

### Track Spam
```typescript
// Notes with isSpam: true are not returned to public
// Admin can view all via /notes/:noteId/admin
```

## 🚀 Performance

### Optimizations
- Indexes on `articleId` and `createdAt` for fast pagination
- Separate index for admin queries (`isApproved` filter)
- Limit 50 results per request (configurable)
- Cache invalidation on write

### Response Times (Target)
- GET list: < 50ms
- POST create: < 100ms
- Admin queries: < 100ms

## 🔄 Async Operations

All operations are async:

```typescript
// Concurrent queries
const [notes, stats] = await Promise.all([
  getNotes(articleId),
  getArticleNotesStats(articleId),
]);
```

## 🛠️ Extending the Module

### Add Notification on New Note
```typescript
// In notes.service.ts
async createNote(...) {
  const note = await this.noteModel.save(newNote);
  
  // Emit event or call service
  this.notificationService.notifyAdminNewNote(note);
  
  return note;
}
```

### Add Email Validation
```typescript
// In spam-detection.service.ts
const isValidEmail = await this.emailService.verify(email);
if (!isValidEmail) score += 50;
```

### Add IP-based Rate Limit
```typescript
// In notes.controller.ts
const notesByIp = await this.notesService.getNotesByIp(userIp);
if (notesByIp > 50) throw new TooManyRequestsException();
```

## 📝 Logging

Add Winston logger:

```typescript
constructor(
  private readonly logger: Logger,
  private readonly notesService: NotesService,
) {}

async createNote(...) {
  this.logger.debug(`Creating note for article ${articleId}`);
  const note = await this.notesService.createNote(...);
  this.logger.log(`Note created: ${note.id}`);
  return note;
}
```

## 🎯 Best Practices

1. ✅ Always validate user input
2. ✅ Sanitize HTML content
3. ✅ Use DTOs for serialization
4. ✅ Implement rate limiting
5. ✅ Log important events
6. ✅ Use transactions for critical operations
7. ✅ Cache frequently accessed data
8. ✅ Index common queries
9. ✅ Handle errors gracefully
10. ✅ Document API endpoints

---

Made with ❤️ for clean, scalable architecture.
