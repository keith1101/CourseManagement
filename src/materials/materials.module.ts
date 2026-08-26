import { Module } from '@nestjs/common';
import { GcsStorageModule } from '../storage/gcs-storage.module';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

@Module({
  imports: [GcsStorageModule],
  controllers: [MaterialsController],
  providers: [MaterialsService],
})
export class MaterialsModule {}
