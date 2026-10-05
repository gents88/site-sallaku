import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SavedResult, SavedResultSchema } from './schemas/saved-result.schema';
import { SavedResultsController } from './saved-results.controller';
import { SavedResultsService } from './services/saved-results.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SavedResult.name, schema: SavedResultSchema }]),
  ],
  controllers: [SavedResultsController],
  providers: [SavedResultsService],
  exports: [SavedResultsService],
})
export class SavedResultsModule {}
