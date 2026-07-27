import { Controller, Get, Post, Body, Req, UseGuards } from "@nyalajs/core";
import { view } from "@nyalajs/react";
import { SessionAuthGuard } from "../../guards/session-auth.guard";
import { SettingRepository } from "../../repositories/setting.repository";
import { SettingsPage } from "../../views/admin/settings-page";
import { currentUser } from "../../helpers/current-user.helper";

@Controller("/admin/settings")
@UseGuards(SessionAuthGuard)
export class SettingsController {
    constructor(private readonly settingRepository: SettingRepository) {}

    @Get("/")
    async index(@Req() req: any) {
        const settings = await this.loadSettings();
        return view(SettingsPage, { user: currentUser(req), settings });
    }

    @Post("/")
    async update(
        @Body()
        body: {
            siteName: string;
            siteDescription?: string;
            contactEmail?: string;
            footerText?: string;
            maintenanceMode?: string;
        },
        @Req() req: any
    ) {
        await Promise.all([
            this.settingRepository.set("siteName", body.siteName),
            this.settingRepository.set("siteDescription", body.siteDescription ?? ""),
            this.settingRepository.set("contactEmail", body.contactEmail ?? ""),
            this.settingRepository.set("footerText", body.footerText ?? ""),
            this.settingRepository.set("maintenanceMode", body.maintenanceMode === "on"),
        ]);

        const settings = await this.loadSettings();
        return view(SettingsPage, { user: currentUser(req), settings, saved: true });
    }

    private async loadSettings() {
        const [siteName, siteDescription, contactEmail, footerText, maintenanceMode] = await Promise.all([
            this.settingRepository.get("siteName"),
            this.settingRepository.get("siteDescription"),
            this.settingRepository.get("contactEmail"),
            this.settingRepository.get("footerText"),
            this.settingRepository.get("maintenanceMode"),
        ]);

        return {
            siteName: siteName ?? "",
            siteDescription: siteDescription ?? "",
            contactEmail: contactEmail ?? "",
            footerText: footerText ?? "",
            maintenanceMode: Boolean(maintenanceMode),
        };
    }
}
