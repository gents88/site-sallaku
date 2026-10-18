import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ErrorLogController } from './error-log.controller';
import { ErrorLogService } from './error-log.service';
import { ServerError, ServerErrorSchema } from './server-error.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: ServerError.name, schema: ServerErrorSchema }])],
  controllers: [ErrorLogController],
  providers: [ErrorLogService],
  exports: [ErrorLogService],
})
export class ErrorLogModule {}
