import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { name, phone, email, message, propertyLinks } = req.body;

  // --- 1. Configuración del Transportador de Email ---
  // (Usa las variables de Vercel que usted ya configuró)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465, // true para puerto 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  // --- 2. Contenido del Email para el Administrador ---
  const adminMail = {
    from: `"Agente Digital MCV" <${process.env.SMTP_USER}>`,
    to: process.env.CONTACT_ADMIN_EMAIL, // ¡Usa la nueva variable!
    subject: `Nuevo Lead (Agente Digital): ${name}`,
    html: `
      <p>Un nuevo cliente ha solicitado más información.</p>
      <ul>
        <li><strong>Nombre:</strong> ${name}</li>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Celular:</strong> ${phone}</li>
      </ul>
      <p><strong>Mensaje:</strong></p>
      <p>${message}</p>
      <p><strong>Propiedades de Interés:</strong></p>
      <ul>
        ${propertyLinks.map(link => `<li><a href="${link}">${link}</a></li>`).join('')}
      </ul>
    `,
  };

  // --- 3. Enviar el Email ---
  try {
    await transporter.sendMail(adminMail);
    res.status(200).json({ status: 'OK', message: 'Email enviado' });
  } catch (error) {
    console.error('Error al enviar email:', error);
    res.status(500).json({ status: 'Error', error: 'No se pudo enviar el email.' });
  }
}