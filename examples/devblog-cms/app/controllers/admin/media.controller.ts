import { Controller, Get, Post, Param, UploadedFile, Req, Res, UseGuards } from "@nyalajs/core";
import { view } from "@nyalajs/react";
import { StorageService } from "@nyalajs/storage";
import { SessionAuthGuard } from "../../guards/session-auth.guard";
import { MediaRepository } from "../../repositories/media.repository";
import { MediaPage } from "../../views/admin/media-page";
import { currentUser } from "../../helpers/current-user.helper";

@Controller("/admin/media")
@UseGuards(SessionAuthGuard)
export class MediaController {
    constructor(
        private readonly mediaRepository: MediaRepository,
        private readonly storageService: StorageService
    ) {}

    @Get("/")
    async index(@Req() req: any) {
        const media = await this.mediaRepository.findAll();
        return view(MediaPage, { user: currentUser(req), media });
    }

    @Post("/upload")
    async upload(@UploadedFile("file") file: any, @Req() req: any, @Res() res: any) {
        if (!file) {
            return res.status(400).send({ error: "No file provided" });
        }

        const userId = req.session.get("userId");
        const buffer: Buffer = await file.toBuffer();
        const storagePath = `media/${Date.now()}-${file.filename}`;

        await this.storageService.put(storagePath, buffer);
        const url = await this.storageService.url(storagePath);

        const media = await this.mediaRepository.create({
            filename: file.filename,
            url,
            mimeType: file.mimetype,
            size: buffer.length,
            uploadedById: userId,
        } as any);

        return res.status(201).send(media);
    }

    @Post("/:id/delete")
    async delete(@Param("id") id: string, @Res() res: any) {
        await this.mediaRepository.delete(id);
        return res.redirect(302, "/admin/media");
    }
}
