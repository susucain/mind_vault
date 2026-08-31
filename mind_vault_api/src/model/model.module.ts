import { Global, Module } from '@nestjs/common';
import { ModelGatewayService } from './model-gateway.service';

@Global()
@Module({
  providers: [ModelGatewayService],
  exports: [ModelGatewayService],
})
export class ModelModule {}
