import { Injectable } from "@nyala/core";
import { MailService } from "@nyala/mail";
import { Notification } from "./notification";

/** Interface for entities that can receive notifications */
export interface Notifiable {
    /** e.g. the user's email address */
    email?: string;
    /** e.g. the user's phone number */
    phone?: string;
    /** e.g. the user's database ID */
    id?: string | number;
}

export interface NotificationConfig {
    /** Optional global defaults or SMS driver configs */
    smsDriver?: any; 
    /** Reference to a database model/repository to save DB notifications */
    databaseModel?: any;
}

@Injectable()
export class NotificationService {
    private mailService: MailService | null = null;
    private config?: NotificationConfig;

    connect(config?: NotificationConfig) {
        this.config = config;
    }

    /**
     * Set the mail service dependency. In a fully-fledged DI setup, 
     * this could be injected via the constructor.
     */
    setMailService(mailService: MailService) {
        this.mailService = mailService;
    }

    /**
     * Send a notification to a single notifiable entity.
     */
    async send(notifiable: Notifiable, notification: Notification): Promise<void> {
        const channels = notification.via(notifiable);

        for (const channel of channels) {
            try {
                await this.sendToChannel(channel, notifiable, notification);
            } catch (error) {
                console.error(`[nyala/notifications] Failed to send to channel ${channel}:`, error);
            }
        }
    }

    private async sendToChannel(channel: string, notifiable: Notifiable, notification: Notification): Promise<void> {
        switch (channel) {
            case "mail":
                if (!this.mailService) {
                    throw new Error("[nyala/notifications] MailService not provided. Cannot send mail notification.");
                }
                if (!notification.toMail) {
                    throw new Error(`[nyala/notifications] Notification is missing toMail() implementation.`);
                }
                
                const mailable = notification.toMail(notifiable);
                // Dynamically ensure the "to" field is set if not provided by the Mailable
                const env = mailable.envelope();
                if (!env.to && notifiable.email) {
                    // It's a bit rigid, but works for the majority of cases
                    (mailable as any).envelope = () => ({ ...env, to: notifiable.email });
                }
                
                await this.mailService.send(mailable);
                break;

            case "database":
                if (!notification.toDatabase) {
                    throw new Error(`[nyala/notifications] Notification is missing toDatabase() implementation.`);
                }
                const data = notification.toDatabase(notifiable);
                const dbModel = this.config?.databaseModel;
                
                if (dbModel && dbModel.create) {
                    await dbModel.create({
                        notifiableId: notifiable.id,
                        type: notification.constructor.name,
                        data: data,
                        readAt: null
                    });
                } else {
                    console.log(`[nyala/notifications] Database channel simulated. Payload:`, data);
                }
                break;
                
            case "sms":
                if (!notification.toSms) {
                    throw new Error(`[nyala/notifications] Notification is missing toSms() implementation.`);
                }
                const message = notification.toSms(notifiable);
                // Simulate SMS
                console.log(`[nyala/notifications] SMS to ${notifiable.phone}: ${message}`);
                break;

            default:
                console.warn(`[nyala/notifications] Unknown channel: ${channel}`);
        }
    }
}
