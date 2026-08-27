import { Module } from '@nestjs/common';
import { S3StorageModule } from '../storage/s3-storage.module';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

@Module({
  imports: [S3StorageModule],
  controllers: [MaterialsController],
  providers: [MaterialsService],
})
export class MaterialsModule {}
