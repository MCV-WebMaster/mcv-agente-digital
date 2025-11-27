import nodemailer from 'nodemailer';
import { supabase } from '@/lib/supabaseClient'; // ¡Importamos Supabase!

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Recibimos nuevos campos: rawFilters y propertyDetails
  const { name, phone, email, adminMessageHtml, rawFilters, propertyDetails } = req.body; 

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
    // 1. Enviamos el correo de aviso
    await transporter.sendMail(adminMail);

    // --- PASO 2: Guardar Contacto en la tabla 'leads' (¡NUEVO!) ---
    const { data, error } = await supabase
      .from('leads')
      .insert([
        {
          name: name,
          email: email,
          phone: phone,
          properties: propertyDetails, // JSONB de propiedades (links/titulos)
          filters: rawFilters, // JSONB de filtros usados
        }
      ]);

    if (error) {
      console.error('Error al guardar lead en Supabase:', error);
      // No rompemos el flujo si la base de datos falla, solo lo logueamos
    }

    res.status(200).json({ status: 'OK', message: 'Email enviado y lead guardado' });

  } catch (error) {
    console.error('Error general en API Contact:', error);
    res.status(500).json({ status: 'Error', error: error.message });
  }
}