import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as compression from 'compression';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

function parseCorsOrigins(rawOrigins?: string): string[] {
  return (rawOrigins ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const allowedOrigins = parseCorsOrigins(process.env.CORS_ORIGIN);

  app.getHttpAdapter().getInstance().set('trust proxy', true);

  // ── Security middleware ──────────────────────────────
  app.use(helmet());
  app.use(compression());

  // ── CORS ─────────────────────────────────────────────
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Global prefix ─────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Global pipes ─────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global filters ───────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── Swagger (dev & staging only) ─────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Portfolio API')
      .setDescription('Developer Portfolio Admin REST API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    logger.log(`📚 Swagger docs → http://localhost:${process.env.PORT || 3000}/api/docs`);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Portfolio API running on http://localhost:${port}`);
}
bootstrap();
