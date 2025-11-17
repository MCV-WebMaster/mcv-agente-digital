import nodemailer from 'nodemailer';
import { Resend } from 'resend';

// Inicializamos Resend (solo para guardar contactos)
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { name, phone, email, adminMessageHtml } = req.body;

  // --- PASO 1: Enviar Email de Aviso con Nodemailer (SMTP) ---
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const adminMail = {
    from: `"Asistente Digital" <${process.env.SMTP_USER}>`,
    to: process.env.CONTACT_ADMIN_EMAIL,
    reply_to: email,
    subject: `Nuevo Lead: ${name}`,
    html: `
      <div style="font-family: sans-serif; color: #333;">
        <h2>Nuevo contacto desde el Asistente Digital</h2>
        <p>Un cliente ha dejado sus datos y consultado por WhatsApp.</p>
        <hr />
        <h3>Datos del Cliente:</h3>
        <ul>
          <li><strong>Nombre:</strong> ${name}</li>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Celular:</strong> <a href="https://wa.me/${phone.replace(/\D/g,'')}">${phone}</a></li>
        </ul>
        <hr />
        <h3>Intereses / Propiedades:</h3>
        ${adminMessageHtml}
      </div>
    `,
  };

  try {
    // 1. Enviamos el correo
    await transporter.sendMail(adminMail);

    // --- PASO 2: Guardar Contacto en Resend (Silencioso) ---
    // Lo hacemos después de enviar el correo para no bloquear si falla
    if (process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID) {
      try {
        await resend.contacts.create({
          email: email,
          firstName: name,
          unsubscribed: false,
          audienceId: process.env.RESEND_AUDIENCE_ID
        });
        console.log(`Contacto ${email} guardado en Resend.`);
      } catch (resendError) {
        // Si falla Resend (ej. contacto ya existe), solo lo logueamos, no fallamos el request
        console.warn('Aviso: No se pudo guardar en Resend (puede que ya exista):', resendError.message);
      }
    }

    res.status(200).json({ status: 'OK', message: 'Email enviado y contacto procesado' });

  } catch (error) {
    console.error('Error al enviar email con Nodemailer:', error);
    res.status(500).json({ status: 'Error', error: 'No se pudo enviar el email.' });
  }
}