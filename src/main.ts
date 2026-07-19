import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { hostname } from 'os';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS so the browser allows the Flutter web client to interact with the API
  app.enableCors();


  // you can change the host name to localhost if you want to run the android app on a real android device instead of an emulator
  await app.listen(
    process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
