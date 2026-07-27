/**
 * Minimal Gmail SMTP (port 465) using Node tls — no npm dependency.
 * Set NEXUS_NOTE_GMAIL_USER + NEXUS_NOTE_GMAIL_APP_PASSWORD (Google App Password).
 */

import tls from 'tls';

function env(name: string): string {
  return process.env[name]?.trim() || '';
}

export function gmailCredentials(): { user: string; pass: string } | null {
  const user = env('NEXUS_NOTE_GMAIL_USER') || env('GMAIL_USER') || env('SMTP_USER');
  const pass =
    env('NEXUS_NOTE_GMAIL_APP_PASSWORD') ||
    env('GMAIL_APP_PASSWORD') ||
    env('SMTP_PASS');
  if (!user || !pass) return null;
  return { user, pass };
}

function b64Auth(user: string, pass: string): string {
  return Buffer.from(`\0${user}\0${pass}`).toString('base64');
}

async function readReply(socket: tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    const onData = (chunk: Buffer) => {
      data += chunk.toString('utf8');
      // SMTP multi-line replies end when a line matches /^\d{3} /
      const lines = data.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return;
      const last = lines[lines.length - 1];
      if (/^\d{3} /.test(last)) {
        socket.off('data', onData);
        socket.off('error', onErr);
        resolve(data);
      }
    };
    const onErr = (err: Error) => {
      socket.off('data', onData);
      reject(err);
    };
    socket.on('data', onData);
    socket.on('error', onErr);
  });
}

async function cmd(socket: tls.TLSSocket, line: string, expect: RegExp): Promise<string> {
  socket.write(`${line}\r\n`);
  const reply = await readReply(socket);
  if (!expect.test(reply)) {
    throw new Error(`SMTP failed for "${line.slice(0, 40)}": ${reply.trim().slice(0, 180)}`);
  }
  return reply;
}

export async function sendGmailOtp(to: string, otp: string): Promise<{ ok: boolean; error?: string }> {
  const creds = gmailCredentials();
  if (!creds) {
    return {
      ok: false,
      error:
        'Gmail not configured. Set NEXUS_NOTE_GMAIL_USER and NEXUS_NOTE_GMAIL_APP_PASSWORD. OTP was also saved locally for admin recovery.',
    };
  }

  const text =
    `NexusPulse Strategy Note — password reset\n\n` +
    `Your OTP code is: ${otp}\n\n` +
    `Valid for 15 minutes.\n` +
    `If you did not request this, ignore this email.\n`;

  try {
    await new Promise<void>((resolve, reject) => {
      const socket = tls.connect(
        { host: 'smtp.gmail.com', port: 465, servername: 'smtp.gmail.com' },
        () => {
          void (async () => {
            try {
              await readReply(socket); // 220 greeting
              await cmd(socket, 'EHLO localhost', /^250/m);
              await cmd(socket, `AUTH PLAIN ${b64Auth(creds.user, creds.pass)}`, /^235/m);
              await cmd(socket, `MAIL FROM:<${creds.user}>`, /^250/m);
              await cmd(socket, `RCPT TO:<${to}>`, /^250/m);
              await cmd(socket, 'DATA', /^354/m);
              const payload =
                `From: NexusPulse <${creds.user}>\r\n` +
                `To: ${to}\r\n` +
                `Subject: NexusPulse Strategy Note OTP\r\n` +
                `Content-Type: text/plain; charset=utf-8\r\n` +
                `\r\n` +
                `${text}\r\n` +
                `.`;
              await cmd(socket, payload, /^250/m);
              socket.write('QUIT\r\n');
              socket.end();
              resolve();
            } catch (err) {
              socket.destroy();
              reject(err);
            }
          })();
        }
      );
      socket.setTimeout(25_000, () => {
        socket.destroy();
        reject(new Error('SMTP timeout'));
      });
      socket.on('error', reject);
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Email send failed',
    };
  }
}
