import { Module, Logger } from "@nestjs/common";
import { createNotificationProvider } from "@eldercare/ai-providers";
import { AlertService } from "./alert.service";
import { AlertController } from "./alert.controller";
import { NOTIFICATION_PROVIDER } from "./notification.token";

/**
 * Builds the SMS provider from env. Returns undefined (a no-op channel) until
 * TWILIO_* are set, so enabling real texting is a host-config change, no deploy.
 * Set NOTIFICATION_PROVIDER=none to force it off even with creds present.
 */
const notificationProvider = {
  provide: NOTIFICATION_PROVIDER,
  useFactory: () => {
    const provider = createNotificationProvider({
      provider: process.env.NOTIFICATION_PROVIDER,
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      twilioFromNumber: process.env.TWILIO_FROM_NUMBER,
    });
    new Logger("AlertModule").log(
      provider
        ? `SMS notifications enabled via ${provider.name}`
        : "SMS notifications disabled (no provider configured)",
    );
    return provider;
  },
};

@Module({
  controllers: [AlertController],
  providers: [AlertService, notificationProvider],
  exports: [AlertService],
})
export class AlertModule {}
