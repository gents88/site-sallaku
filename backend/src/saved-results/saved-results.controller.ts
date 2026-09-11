import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SavedResultsService } from './services/saved-results.service';
import { CreateSavedResultDto } from './dto/create-saved-result.dto';
import { SavedResultResponseDto, SavedResultListItemDto } from './dto/saved-result-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('SavedResults')
@ApiBearerAuth()
@Controller('saved-results')
@UseGuards(JwtAuthGuard)
export class SavedResultsController {
  constructor(private readonly savedResultsService: SavedResultsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Salva il risultato di un tool nel proprio account' })
  async create(
    @Req() req: any,
    @Body() dto: CreateSavedResultDto,
  ): Promise<SavedResultResponseDto> {
    return this.savedResultsService.create(req.user._id.toString(), dto);
  }

  @Get()
  @ApiOperation({ summary: 'Elenca i risultati salvati dall’utente autenticato' })
  async findAll(
    @Req() req: any,
  ): Promise<{ data: SavedResultListItemDto[]; total: number }> {
    return this.savedResultsService.findAllForUser(req.user._id.toString());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Recupera un risultato salvato (solo il proprietario)' })
  async findOne(@Req() req: any, @Param('id') id: string): Promise<SavedResultResponseDto> {
    return this.savedResultsService.findOneForUser(req.user._id.toString(), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina un risultato salvato (solo il proprietario)' })
  async remove(@Req() req: any, @Param('id') id: string): Promise<void> {
    return this.savedResultsService.removeForUser(req.user._id.toString(), id);
  }
}
