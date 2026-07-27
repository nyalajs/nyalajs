import { Module } from "@nyalajs/core";
import { ConfigService } from "@nyalajs/config";
import { Logger } from "@nyalajs/observability";
import { StorageService } from "@nyalajs/storage";
import { namespaces } from "../config";

// Controllers
import { AdminAuthController } from "../app/controllers/admin/auth.controller";
import { DashboardController } from "../app/controllers/admin/dashboard.controller";
import { CategoriesController } from "../app/controllers/admin/categories.controller";
import { TagsController } from "../app/controllers/admin/tags.controller";
import { PagesController } from "../app/controllers/admin/pages.controller";
import { PostsController } from "../app/controllers/admin/posts.controller";
import { MediaController } from "../app/controllers/admin/media.controller";
import { MenusController } from "../app/controllers/admin/menus.controller";
import { SettingsController } from "../app/controllers/admin/settings.controller";
import { UsersController } from "../app/controllers/admin/users.controller";
import { FormsController } from "../app/controllers/admin/forms.controller";
import { PublicPagesController } from "../app/controllers/public/pages.controller";
import { BlogController } from "../app/controllers/public/blog.controller";
import { ContactController } from "../app/controllers/public/contact.controller";
import { SeoController } from "../app/controllers/public/seo.controller";

// Services
import { AuthService } from "../app/services/auth.service";
import { LayoutDataService } from "../app/services/layout-data.service";

// Repositories
import { UserRepository } from "../app/repositories/user.repository";
import { PageRepository } from "../app/repositories/page.repository";
import { PostRepository } from "../app/repositories/post.repository";
import { CategoryRepository } from "../app/repositories/category.repository";
import { TagRepository } from "../app/repositories/tag.repository";
import { MediaRepository } from "../app/repositories/media.repository";
import { MenuRepository, MenuItemRepository } from "../app/repositories/menu.repository";
import { SettingRepository } from "../app/repositories/setting.repository";
import { FormSubmissionRepository } from "../app/repositories/form-submission.repository";

/**
 * Application Root Module
 *
 * `nyala generate controller|service` appends new entries here automatically.
 */
@Module({
    providers: [
        {
            provide: ConfigService,
            useFactory: () => {
                const configService = new ConfigService();
                for (const [namespace, values] of Object.entries(namespaces)) {
                    configService.load(namespace, values as Record<string, any>);
                }
                return configService;
            },
        },
        {
            provide: Logger,
            useFactory: () => new Logger(process.env.APP_NAME ?? "nyala-app"),
        },
        {
            provide: StorageService,
            useFactory: () => {
                const storage = new StorageService();
                storage.connect();
                return storage;
            },
        },
        UserRepository,
        PageRepository,
        PostRepository,
        CategoryRepository,
        TagRepository,
        MediaRepository,
        MenuRepository,
        MenuItemRepository,
        SettingRepository,
        FormSubmissionRepository,
        AuthService,
        LayoutDataService,
    ],
    controllers: [
        AdminAuthController,
        DashboardController,
        CategoriesController,
        TagsController,
        PagesController,
        PostsController,
        MediaController,
        MenusController,
        SettingsController,
        UsersController,
        FormsController,
        // Public site — SeoController/PublicPagesController's static routes
        // (e.g. /sitemap.xml, /blog) always win over PublicPagesController's
        // /:slug catch-all, regardless of registration order (Fastify's
        // router prefers static routes over parametric ones).
        BlogController,
        ContactController,
        SeoController,
        PublicPagesController,
    ],
    exports: [ConfigService, Logger],
})
export class AppModule {}
