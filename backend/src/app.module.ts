import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { StorageModule } from './common/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { BannersModule } from './modules/banners/banners.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { ContactChannelsModule } from './modules/contact-channels/contact-channels.module';
import { HealthModule } from './modules/health/health.module';
import { MediaModule } from './modules/media/media.module';
import { ProductsModule } from './modules/products/products.module';
import { PublicModule } from './modules/public/public.module';
import { PublishModule } from './modules/publish/publish.module';
import { SiteSettingsModule } from './modules/site-settings/site-settings.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    StorageModule,
    AuthModule,
    CategoriesModule,
    ProductsModule,
    CollectionsModule,
    MediaModule,
    BannersModule,
    ContactChannelsModule,
    SiteSettingsModule,
    PublicModule,
    PublishModule,
    HealthModule,
  ],
})
export class AppModule {}
