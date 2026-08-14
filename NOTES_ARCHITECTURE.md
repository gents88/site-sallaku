# 🏗️ Architettura Sistema Note del Blog

Documentazione completa dell'architettura, flusso dati, e decisioni progettuali.

---

## 🎯 Panoramica del Sistema

Questo sistema permette ai lettori di lasciare note (commenti) su ogni articolo del blog con:
- Validazione rigorosa
- Anti-spam automatico
- Moderazione admin
- UI responsive e moderna

---

## 📊 Flusso Dati

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Angular)                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         ArticleNotesComponent                       │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │  Form (Reactive Forms)                       │  │   │
│  │  │  - name (optional)                           │  │   │
│  │  │  - email (optional)                          │  │   │
│  │  │  - content (required)                        │  │   │
│  │  │  - honeypot (hidden)                         │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │                        ↓ (FormBuilder.formControl)  │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │  NotesService                                │  │   │
│  │  │  - createNote(articleId, payload)            │  │   │
│  │  │  - getNotes(articleId)                       │  │   │
│  │  │  - cache management (BehaviorSubject)        │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                        ↓ (HttpClient)                       │
└─────────────────────────────────────────────────────────────┘
                         ↓ HTTP
                 POST /notes/:articleId
                 GET /notes/:articleId
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (NestJS)                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  NotesController                                    │   │
│  │  - POST /:articleId → createNote()                 │   │
│  │  - GET /:articleId → getNotes()                    │   │
│  │  - PATCH /:id/approve → updateApprovalStatus()    │   │
│  │  - DELETE /:id → deleteNote()                      │   │
│  └──────────────────┬───────────────────────────────────┘   │
│                     ↓                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  NotesService (Business Logic)                     │   │
│  │  - createNote()                                    │   │
│  │  - getNotes()                                      │   │
│  │  - updateNoteApprovalStatus()                      │   │
│  │  - markAsSpam()                                    │   │
│  │  - getArticleNotesStats()                          │   │
│  └──────────────────┬───────────────────────────────────┘   │
│                     ↓                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  SpamDetectionService                              │   │
│  │  - detectSpam() → score (0-100)                    │   │
│  │  - sanitizeContent() → escape HTML                 │   │
│  │  - validateEmailFormat()                           │   │
│  └──────────────────┬───────────────────────────────────┘   │
│                     ↓                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  MongoDB Mongoose Model (Note)                      │   │
│  │  - Schema: articleId, name, email, content, etc.   │   │
│  │  - Indexes: articleId, createdAt, isApproved       │   │
│  └──────────────────┬───────────────────────────────────┘   │
│                     ↓                                        │
└─────────────────────────────────────────────────────────────┘
                      ↓ (Save/Query)
            ┌─────────────────────────┐
            │   MongoDB Database      │
            │   Collection: notes     │
            └─────────────────────────┘
```

---

## 🔐 Security Layers

### Layer 1: Frontend Validation
```typescript
// Reactive Forms Validators
name:    [maxLength(100)]
email:   [email]
content: [required, minLength(3), maxLength(1000)]
honeypot: [must be empty]
```

### Layer 2: Backend DTO Validation
```typescript
// class-validator decorators
@MaxLength(100) name: string;
@IsEmail() email: string;
@MinLength(3) @MaxLength(1000) content: string;
```

### Layer 3: Business Logic Validation
```typescript
// NotesService.createNote()
1. Validate articleId is valid ObjectId
2. Run spam detection
3. Sanitize content (HTML escape)
4. Set isApproved based on spam score
5. Store in database
```

### Layer 4: Spam Detection Algorithm
```
Input → Honeypot Check → Keyword Detection → URL Pattern → 
  Content Analysis → Score Calculation → Decision

Score: 0-29    → Approved automatically
       30-50   → Requires admin approval
       50+     → Rejected automatically
```

### Layer 5: Rate Limiting
```
POST /notes/:articleId   → 5 requests/min per IP
GET  /notes/:articleId   → 100 requests/min per IP
```

---

## 📈 Database Schema

### Collection: `notes`

```javascript
db.notes.insertOne({
  _id: ObjectId("507f..."),
  articleId: ObjectId("507f..."),    // FK to posts
  name: "Mario Rossi",               // User provided
  email: "mario@example.com",        // User provided
  content: "Great article!",         // User provided (sanitized)
  isApproved: true,                  // Approval status
  isSpam: false,                     // Spam flag
  spamScore: 10,                     // 0-100 score
  userIp: "192.168.1.1",             // IP for abuse tracking
  createdAt: ISODate("2026-08-14..."),
  updatedAt: ISODate("2026-08-14...")
})
```

### Indexes

```
Primary:   { articleId: 1, createdAt: -1 }
Secondary: { articleId: 1, isApproved: 1, createdAt: -1 }
```

### Query Patterns

```javascript
// Get approved notes
db.notes.find({
  articleId: ObjectId("..."),
  isSpam: false,
  isApproved: true
}).sort({ createdAt: -1 }).limit(50)

// Get stats (admin)
db.notes.aggregate([
  { $match: { articleId: ObjectId("...") } },
  { $group: {
      _id: null,
      total: { $sum: 1 },
      approved: { $sum: { $cond: ["$isApproved", 1, 0] } },
      spam: { $sum: { $cond: ["$isSpam", 1, 0] } }
    }
  }
])
```

---

## 🔄 Component Communication

### Frontend Component Hierarchy

```
AppComponent (root)
  └── ArticleComponent
        └── ArticleNotesComponent
              ├── [Input] articleId
              └── [Services]
                    └── NotesService
                          └── HttpClient → Backend API
```

### Service Injection

```typescript
// ArticleNotesComponent
constructor(
  private fb: FormBuilder,              // Angular Forms
  private notesService: NotesService    // Custom Service
)

// NotesService
constructor(
  private http: HttpClient              // HTTP calls
)
```

### Data Flow

```
User Input
    ↓
Form Validation (Component)
    ↓
Service Method (NotesService)
    ↓
HTTP POST to Backend
    ↓
DTO Validation (Backend)
    ↓
Business Logic (NotesService)
    ↓
Spam Detection (SpamDetectionService)
    ↓
Sanitization
    ↓
Database Save (MongoDB)
    ↓
Response DTO
    ↓
HTTP Response to Frontend
    ↓
Cache Update (BehaviorSubject)
    ↓
Component UI Update (Change Detection)
    ↓
User Sees New Note
```

---

## 🔍 Spam Detection Algorithm

### Scoring Mechanism

```typescript
let score = 0;

// Honeypot check (instant reject)
if (honeypot.filled) return { isSpam: true, score: 100 };

// Keyword scanning
for each spam_keyword in content:
  score += 30

// URL pattern detection
for each URL in content:
  score += 20

// Suspicious patterns
if (excessive_capitals) score += 15
if (multiple_URLs) score += 10

// User behavior heuristics
if (!name && !email) score += 10
if (content_length > 500) score += 5
if (website_field_filled) score += 25

// Final decision
isSpam = (score >= 50)
needsModeration = (score >= 30 && score < 50)
isApproved = (score < 30)
```

### Tuning Sensitivity

```typescript
// Conservative (more strict)
isSpam = (score >= 50)
isApproved = (score < 30)

// Aggressive (less strict)
isSpam = (score >= 70)
isApproved = (score < 50)
```

---

## ⚡ Performance Considerations

### Frontend

- **Change Detection**: OnPush strategy for efficiency
- **Unsubscription**: takeUntil() with destroy$ subject
- **Caching**: BehaviorSubject caches notes per article
- **Lazy Loading**: No notes loaded until component initializes

### Backend

- **Indexing**: Indexes on articleId and createdAt
- **Pagination**: Default 50 results per request
- **Concurrent Queries**: Promise.all() for stats
- **Rate Limiting**: Throttler guard prevents abuse

### Database

- **Query**: Covered index for { articleId, createdAt }
- **Write**: Single document insert (atomic)
- **Aggregation**: Minimal for stats (group stage only)

---

## 🔄 State Management

### Frontend State

```typescript
// Component State
form: FormGroup
notes: Note[]
isLoadingNotes: boolean
isSubmittingNote: boolean
submitError: string
submitSuccess: boolean
totalNotes: number

// Service State (Cache)
notesCache: Map<string, BehaviorSubject<Note[]>>
```

### Backend State

```typescript
// MongoDB Documents
Note {
  articleId: ObjectId
  name?: string
  email?: string
  content: string
  isApproved: boolean
  isSpam: boolean
  spamScore: number
  createdAt: Date
  updatedAt: Date
}
```

---

## 🧪 Testing Strategy

### Unit Tests (Backend)

```
✓ NotesService
  ✓ createNote() with valid input
  ✓ createNote() with spam detection
  ✓ getNotes() with pagination
  ✓ updateNoteApprovalStatus()
  ✓ deleteNote()

✓ SpamDetectionService
  ✓ detectSpam() with keywords
  ✓ detectSpam() with honeypot
  ✓ sanitizeContent()

✓ NotesController
  ✓ createNote() endpoint
  ✓ getNotes() endpoint
  ✓ approveNote() endpoint
```

### Integration Tests (Frontend)

```
✓ ArticleNotesComponent
  ✓ Load notes on init
  ✓ Submit form with validation
  ✓ Display success message
  ✓ Display error message
  ✓ Update notes list
  ✓ Handle loading state
```

### E2E Tests

```
✓ User can submit a note
✓ Note appears in list immediately
✓ Spam is detected and rejected
✓ Admin can approve/reject notes
```

---

## 📈 Scalability

### Current Approach

- Single article notes collection
- In-memory cache per component instance
- Direct HTTP calls (no state management)

### Future Improvements

1. **Real-time Updates**: WebSocket for live note refresh
2. **Caching**: Redis for frequently accessed articles
3. **Message Queue**: Async spam detection
4. **Analytics**: Separate analytics collection
5. **Full-text Search**: Elasticsearch for note search

### Growth Plan

```
Phase 1 (Current)     Phase 2              Phase 3
─────────────────     ────────────────     ────────────────
MongoDB only          + Redis cache        + Message queue
Single server         + Load balancer      + Sharding
No analytics          + Basic analytics    + Advanced ML spam
Admin moderation      + Email notify       + Auto-moderate
```

---

## 🔒 Security Best Practices

### Input Validation
- ✅ Length limits (100, 255, 1000)
- ✅ Type validation (string, email)
- ✅ Pattern matching (email regex)
- ✅ HTML escaping

### Output Encoding
- ✅ XSS prevention (HTML escape)
- ✅ NoSQL injection prevention (Mongoose)
- ✅ DTO serialization

### Authentication
- ✅ JWT for admin endpoints
- ✅ Role-based access (Admin role only)
- ✅ No auth needed for public read/write

### Rate Limiting
- ✅ 5 req/min for POST (spam prevention)
- ✅ 100 req/min for GET (reasonable limit)
- ✅ Per-IP throttling

### Data Protection
- ✅ PII (email) not exposed in public responses
- ✅ Spam scores hidden from users
- ✅ User IP logged but not exposed

---

## 📊 Monitoring & Observability

### Logging

```typescript
// Backend logging
logger.debug(`Creating note for article ${articleId}`);
logger.log(`Spam score: ${score}`);
logger.warn(`High spam activity from IP ${userIp}`);
logger.error(`Database error: ${error}`);
```

### Metrics to Track

```
- Total notes per article
- Approved vs pending vs spam ratio
- Average spam score
- Notes per IP address
- Response time (GET/POST)
- Error rate
```

### Alerts

```
- Spam rate > 50%
- Rate limit violations
- Database errors
- Response time > 1s
```

---

## 🎯 Design Decisions

| Decision | Rationale |
|----------|-----------|
| Honeypot over CAPTCHA | User-friendly, no third-party dependency |
| Auto-approval < score 30 | Balance between UX and moderation |
| HTML escaping lato server | Defense in depth, server-side validation |
| Rate limit 5/min POST | Prevent spam while allowing genuine users |
| BehaviorSubject caching | Instant UI update, efficient data binding |
| Mongoose indexes | Fast queries on large collections |
| OnPush change detection | Better performance, explicit updates |
| Separate SpamService | Single responsibility, testable |

---

## 🚀 Deployment Checklist

- [ ] Backend tests passing
- [ ] Frontend tests passing
- [ ] E2E tests passing
- [ ] CORS configured correctly
- [ ] Environment variables set
- [ ] Database indexes created
- [ ] Rate limiting tuned
- [ ] Error monitoring set up
- [ ] Admin panel tested
- [ ] Documentation reviewed

---

## 📚 References

- [NestJS Docs](https://docs.nestjs.com)
- [Angular Docs](https://angular.io/docs)
- [Mongoose Docs](https://mongoosejs.com)
- [Security Best Practices](https://owasp.org/Top10)

---

**Ultima revisione: 2026-08-14** | **Versione: 1.0**
