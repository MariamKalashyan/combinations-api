import { Body, Controller, Post } from '@nestjs/common';
import { GenerateDto } from './dto/generate.dto';
import { CombinationsService } from './combinations.service';

@Controller()
export class CombinationsController {
  constructor(private readonly svc: CombinationsService) {}

  @Post('generate')
  async generate(@Body() dto: GenerateDto) {
    return this.svc.generateAndStore(dto);
  }
}
