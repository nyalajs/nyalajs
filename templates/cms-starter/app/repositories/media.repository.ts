import { Injectable } from "@nyalajs/core";
import { BaseRepository } from "./base.repository";
import { media, Media } from "../models/media.model";

@Injectable()
export class MediaRepository extends BaseRepository<Media> {
    constructor() {
        super(media);
    }
}
