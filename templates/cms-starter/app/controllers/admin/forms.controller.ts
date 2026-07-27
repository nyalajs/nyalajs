import { Controller, Get, Post, Param, Req, Res, UseGuards } from "@nyalajs/core";
import { view } from "@nyalajs/react";
import { SessionAuthGuard } from "../../guards/session-auth.guard";
import { FormSubmissionRepository } from "../../repositories/form-submission.repository";
import { FormsPage } from "../../views/admin/forms-page";
import { currentUser } from "../../helpers/current-user.helper";

@Controller("/admin/forms")
@UseGuards(SessionAuthGuard)
export class FormsController {
    constructor(private readonly formSubmissionRepository: FormSubmissionRepository) {}

    @Get("/")
    async index(@Req() req: any) {
        const submissions = await this.formSubmissionRepository.listRecent(50);
        return view(FormsPage, { user: currentUser(req), submissions });
    }

    @Post("/:id/read")
    async markRead(@Param("id") id: string, @Res() res: any) {
        await this.formSubmissionRepository.markRead(id);
        return res.redirect(302, "/admin/forms");
    }

    @Post("/:id/delete")
    async delete(@Param("id") id: string, @Res() res: any) {
        await this.formSubmissionRepository.delete(id);
        return res.redirect(302, "/admin/forms");
    }
}
