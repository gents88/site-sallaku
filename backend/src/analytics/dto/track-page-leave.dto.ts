import { IsInt, IsNotEmpty, IsUUID, Max, Min } from 'class-validator';

export class TrackPageLeaveDto {
  @IsUUID(4, { message: 'viewId must be a valid UUID v4' })
  @IsNotEmpty()
  viewId: string;

  /** Active time spent on the page in ms. Capped at 30 minutes to keep aggregates sane. */
  @IsInt()
  @Min(0)
  @Max(30 * 60 * 1000)
  durationMs: number;
}
