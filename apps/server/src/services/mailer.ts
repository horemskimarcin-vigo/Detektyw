import nodemailer from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
  /** Wysłane wiadomości – tylko dla mailera deweloperskiego (testy). */
  outbox?: Mail[];
}

export function createMailer(opts: {
  smtpUrl?: string;
  from: string;
  log: (msg: string) => void;
}): Mailer {
  if (opts.smtpUrl) {
    const transport = nodemailer.createTransport(opts.smtpUrl);
    return {
      async send(mail) {
        await transport.sendMail({ from: opts.from, ...mail });
      },
    };
  }
  const outbox: Mail[] = [];
  return {
    outbox,
    async send(mail) {
      outbox.push(mail);
      opts.log(`[mail dev] do: ${mail.to} | ${mail.subject}\n${mail.text}`);
    },
  };
}
