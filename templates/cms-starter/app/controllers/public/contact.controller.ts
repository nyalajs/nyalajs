import { Controller, Get, Post, Body, Req } from "@nyalajs/core";
import { ValidateBody } from "@nyalajs/validation";
import { view } from "@nyalajs/react";
import { FormSubmissionRepository } from "../../repositories/form-submission.repository";
import { LayoutDataService } from "../../services/layout-data.service";
import { ContactValidator, ContactDto } from "../../validators/contact.validator";
import { ContactPage } from "../../views/public/contact-page";

@Controller("/contact")
export class ContactController {
    constructor(
        private readonly formSubmissionRepository: FormSubmissionRepository,
        private readonly layoutDataService: LayoutDataService
    ) {}

    @Get("/")
    async show() {
        const chrome = await this.layoutDataService.getSiteChrome();
        return view(ContactPage, { chrome });
    }

    @Post("/")
    @ValidateBody(ContactValidator)
    async submit(@Body() dto: ContactDto, @Req() req: any) {
        const chrome = await this.layoutDataService.getSiteChrome();

        await this.formSubmissionRepository.create({
            formName: "contact",
            data: dto,
            ip: req.ip,
            userAgent: req.headers["user-agent"],
        } as any);

        return view(ContactPage, { chrome, submitted: true });
    }
}
