import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  website: z.string().max(253).optional(),
  message: z.string().min(10).max(2000),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = contactSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, email, website, message } = validation.data;

    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'AdLeak Shield <notifications@adleakshield.com>',
      to: 'mehradhaftsavar@outlook.com',
      reply_to: email,
      subject: `New contact form message from ${name}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;">
          <h2 style="color:#111827;margin:0 0 24px;">New contact form submission</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;width:80px;">Name</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;">${esc(name)}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Email</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;">${esc(email)}</td></tr>
            ${website ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Website</td><td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;">${esc(website)}</td></tr>` : ''}
          </table>
          <div style="margin-top:24px;padding:20px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;white-space:pre-wrap;">${esc(message)}</p>
          </div>
          <p style="margin-top:24px;font-size:12px;color:#9ca3af;">Sent from adleakshield.com contact form</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Contact form error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
