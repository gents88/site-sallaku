import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

/** Un id non valido diventa 400, non un CastError di Mongoose che il filtro globale trasforma in 500. */
@Injectable()
export class ParseMongoIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isValidObjectId(value)) throw new BadRequestException('Invalid id');
    return value;
  }
}
