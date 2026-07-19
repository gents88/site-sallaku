# Guida: Paginazione + Caching in NestJS

Questo documento mostra come integrare paginazione e caching nei tuoi controller e servizi.

---

## 1. Uso di PaginationDto

### Nel Controller

```typescript
import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { PaginationDto, createPaginatedResponse } from '../common/dto/pagination.dto';
import { CacheInterceptor } from '../common/interceptors/cache.interceptor';
import { BlogService } from './blog.service';

@Controller('blog')
export class BlogController {
  constructor(private blogService: BlogService) {}

  @Get('posts')
  @UseInterceptors(CacheInterceptor)
  async findPublished(@Query() paginationDto: PaginationDto) {
    // paginationDto include: page, limit, sort, search
    return this.blogService.findPublished(paginationDto);
  }

  @Get('posts/:id')
  @UseInterceptors(CacheInterceptor)
  async findById(@Param('id') id: string) {
    return this.blogService.findById(id);
  }
}
```

### Nel Service

```typescript
import { Injectable } from '@nestjs/common';
import { PaginationDto, PaginatedResponse, createPaginatedResponse } from '../common/dto/pagination.dto';
import { BlogPost } from './schemas/blog-post.schema';

@Injectable()
export class BlogService {
  constructor(private readonly blogModel: Model<BlogPost>) {}

  async findPublished(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponse<BlogPost>> {
    const page = paginationDto.page || 1;
    const limit = paginationDto.limit || 10;
    const skip = (page - 1) * limit;

    // Parsing sort: "createdAt:DESC" → { createdAt: -1 }
    const sortObj: any = {};
    if (paginationDto.sort) {
      const [field, direction] = paginationDto.sort.split(':');
      sortObj[field] = direction === 'DESC' ? -1 : 1;
    }

    // Ricerca testuale (se implementato)
    const filter: any = { published: true };
    if (paginationDto.search) {
      filter.$or = [
        { title: { $regex: paginationDto.search, $options: 'i' } },
        { content: { $regex: paginationDto.search, $options: 'i' } },
      ];
    }

    // Query
    const [data, total] = await Promise.all([
      this.blogModel
        .find(filter)
        .sort(sortObj)
        .limit(limit)
        .skip(skip)
        .exec(),
      this.blogModel.countDocuments(filter),
    ]);

    return createPaginatedResponse(data, { page, limit }, total);
  }

  async findById(id: string): Promise<BlogPost | null> {
    return this.blogModel.findById(id).exec();
  }
}
```

---

## 2. Uso di CacheInterceptor

### Applicazione Globale (Tutti i GET)

```typescript
// main.ts
import { CacheInterceptor } from './common/interceptors/cache.interceptor';

app.useGlobalInterceptors(new CacheInterceptor(cacheManager));
```

### Applicazione Selettiva (Specifici endpoint)

```typescript
import { UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '../common/interceptors/cache.interceptor';

@Get('posts')
@UseInterceptors(CacheInterceptor)
@CacheTTL(5 * 60 * 1000) // Cache 5 minuti
async findPublished(@Query() paginationDto: PaginationDto) {
  return this.blogService.findPublished(paginationDto);
}

@Get('expensive-operation')
@UseInterceptors(CacheInterceptor)
@CacheTTL(30 * 60 * 1000) // Cache 30 minuti
async expensiveOperation() {
  // Operazione costosa...
  return result;
}
```

### Disabilitare Cache Manualmente

```bash
# Client può disabilitare cache aggiungendo ?nocache=true
curl "http://localhost:3000/api/v1/blog/posts?nocache=true"
```

---

## 3. Configurazione Cache in app.module.ts

✅ **Già configurato nel tuo progetto!**

```typescript
// app.module.ts
CacheModule.registerAsync({
  isGlobal: true,
  imports: [ConfigModule],
  useFactory: (cfg: ConfigService) => ({
    ttl: cfg.get<number>('CACHE_TTL', 60 * 1000), // 60s default
    max: cfg.get<number>('CACHE_MAX_ITEMS', 100),
    isGlobal: true,
  }),
  inject: [ConfigService],
}),
```

### Variabili d'Ambiente

Aggiungi nel tuo `.env`:

```env
# Cache configuration
CACHE_TTL=60000          # Milliseconds (default 60s)
CACHE_MAX_ITEMS=100      # Max entries in memory cache

# Upgrade to Redis
CACHE_STORE=redis        # Optional: redis | memory (default)
REDIS_URL=redis://localhost:6379
```

---

## 4. Upgrade a Redis (Opzionale)

Per ambienti production con più istanze:

```bash
npm install cache-manager-redis-store
```

```typescript
// app.module.ts
import * as redisStore from 'cache-manager-redis-store';

CacheModule.registerAsync({
  isGlobal: true,
  useFactory: async (cfg: ConfigService) => {
    const store = cfg.get<string>('CACHE_STORE', 'memory');

    if (store === 'redis') {
      return {
        store: redisStore,
        host: cfg.get('REDIS_HOST', 'localhost'),
        port: cfg.get('REDIS_PORT', 6379),
        ttl: cfg.get<number>('CACHE_TTL', 60 * 1000),
        max: cfg.get<number>('CACHE_MAX_ITEMS', 100),
      };
    }

    return {
      ttl: cfg.get<number>('CACHE_TTL', 60 * 1000),
      max: cfg.get<number>('CACHE_MAX_ITEMS', 100),
    };
  },
  inject: [ConfigService],
}),
```

---

## 5. Pattern Completo: Esempio Blog

### Service con Paginazione

```typescript
// blog.service.ts
@Injectable()
export class BlogService {
  constructor(
    @InjectModel(BlogPost.name) private blogModel: Model<BlogPost>,
  ) {}

  async findPublished(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponse<BlogPost>> {
    const { page = 1, limit = 10, sort = 'createdAt:DESC', search } = paginationDto;
    const skip = (page - 1) * limit;

    const sortMap = this.parseSortString(sort);
    const filter = this.buildFilter(search);

    const [data, total] = await Promise.all([
      this.blogModel.find(filter).sort(sortMap).skip(skip).limit(limit).lean(),
      this.blogModel.countDocuments(filter),
    ]);

    return createPaginatedResponse(data, { page, limit }, total);
  }

  private parseSortString(sortStr: string): Record<string, 1 | -1> {
    const [field, direction] = sortStr.split(':');
    return { [field]: direction === 'ASC' ? 1 : -1 };
  }

  private buildFilter(search?: string): any {
    const filter = { published: true };
    if (search) {
      (filter as any).$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
      ];
    }
    return filter;
  }
}
```

### Controller con Interceptor

```typescript
// blog.controller.ts
@ApiTags('Blog')
@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get('posts')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(2 * 60 * 1000) // Cache 2 minuti
  @ApiOperation({ summary: 'Get published posts (paginated)' })
  async findPublished(@Query() paginationDto: PaginationDto) {
    return this.blogService.findPublished(paginationDto);
  }

  @Get('posts/:slug')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(5 * 60 * 1000) // Cache 5 minuti
  @ApiOperation({ summary: 'Get post by slug' })
  async findBySlug(@Param('slug') slug: string) {
    return this.blogService.findBySlug(slug);
  }

  @Post('admin/posts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Create post (invalidates cache)' })
  async create(@Body() createPostDto: CreatePostDto) {
    // POST bypassa cache automaticamente (solo GET è cacheato)
    return this.blogService.create(createPostDto);
  }
}
```

---

## 6. Query Examples

```bash
# Pagina 1, 10 elementi
curl "http://localhost:3000/api/v1/blog/posts"

# Pagina 2, 20 elementi
curl "http://localhost:3000/api/v1/blog/posts?page=2&limit=20"

# Ordinamento decrescente per createdAt
curl "http://localhost:3000/api/v1/blog/posts?sort=createdAt:DESC"

# Ordinamento crescente per title
curl "http://localhost:3000/api/v1/blog/posts?sort=title:ASC"

# Ricerca testuale
curl "http://localhost:3000/api/v1/blog/posts?search=angular"

# Disabilita cache
curl "http://localhost:3000/api/v1/blog/posts?nocache=true"

# Combinato
curl "http://localhost:3000/api/v1/blog/posts?page=1&limit=15&sort=title:ASC&search=nestjs"
```

---

## 7. Tipologie di Cache

### Automatica (CacheInterceptor)
- ✅ Applica automaticamente a tutte le GET
- ✅ Personalizzabile per endpoint con `@CacheTTL()`
- ✅ Disabilitabile con `?nocache=true`
- ✅ Headers: `X-Cache: HIT|MISS`, `X-Cache-Key`

### Manuale (Servizio)
```typescript
constructor(
  @Inject(CACHE_MANAGER) private cacheManager: Cache,
) {}

async getExpensiveData() {
  const cacheKey = 'my-expensive-data';
  let data = await this.cacheManager.get(cacheKey);

  if (!data) {
    data = await this.expensiveComputation();
    await this.cacheManager.set(cacheKey, data, 60000); // 60s
  }

  return data;
}
```

---

## 8. Monitoraggio

### Log Cache Hits/Misses

```typescript
// Vedi il log:
// [CACHE HIT] cache:/api/v1/blog/posts?page=1
// [CACHE MISS] cache:/api/v1/blog/posts?page=2
// [CACHE SET] cache:/api/v1/blog/posts?page=1 (TTL: 120000ms)
```

### Headers di Risposta

```
X-Cache: HIT           # Hit dalla cache
X-Cache: MISS          # Miss (appena calcolato e cacheato)
X-Cache-Key: cache:/api/v1/blog/posts
```

---

## ✅ Checklist Implementazione

- [ ] Aggiunto `PaginationDto` ai tuoi DTO
- [ ] `CacheModule` registrato in `app.module.ts`
- [ ] `CacheInterceptor` aggiunto ai controller pubblici
- [ ] Convertito un servizio per usare `PaginationDto`
- [ ] Testato con `?nocache=true` per verificare
- [ ] Aggiunto `CACHE_TTL` nel `.env`
- [ ] Verificato nei logs `[CACHE HIT/MISS]`
