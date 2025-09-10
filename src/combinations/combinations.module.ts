import { Module } from '@nestjs/common';
import { CombinationsController } from './combinations.controller';
import { CombinationsService } from './combinations.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [CombinationsController],
  providers: [CombinationsService],
})
export class CombinationsModule {}
