import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS so the browser allows the Flutter web client to interact with the API
  app.enableCors();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
