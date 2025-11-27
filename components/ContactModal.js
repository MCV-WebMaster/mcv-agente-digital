import { useState, useEffect } from 'react';
import Modal from 'react-modal';
import Spinner from './Spinner';

const customStyles = {
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    width: '90%',
    maxWidth: '500px',
    borderRadius: '8px',
    boxShadow: '0 4px 40px rgba(0,0,0,0.5)', // Hacemos la sombra más fuerte
  },
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
};

export default function ContactModal({ isOpen, onRequestClose, whatsappMessage, adminEmailHtml, propertyCount, filteredProperties, currentFilters }) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
  });
  const [status, setStatus] = useState('idle'); 

  // --- LÓGICA DE LOCAL STORAGE (Recordar usuario) ---
  useEffect(() => {
    try {
      const storedData = localStorage.getItem('mcv_contact_data');
      if (storedData) {
        const { name, phone, email } = JSON.parse(storedData);
        setFormData({ name: name || '', phone: phone || '', email: email || '' });
      }
    } catch (e) {
      console.error("Error al cargar localStorage:", e);
    }
  }, [isOpen]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');

    // 1. Guardar datos en Local Storage para la próxima vez
    localStorage.setItem('mcv_contact_data', JSON.stringify(formData));

    // 2. Preparar el Payload para la API
    const propertyDetails = filteredProperties.map(p => ({ title: p.title, url: p.url, id: p.property_id }));
    
    const contactData = { 
      ...formData, 
      adminMessageHtml: adminEmailHtml,
      propertyDetails: propertyDetails, // Para guardar en Supabase
      rawFilters: currentFilters,      // Para guardar en Supabase
    };

    // 3. Enviar a la API (guarda en DB y envía email)
    const apiPromise = fetch('/api/send-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contactData),
    });

    // 4. Crear Link de WhatsApp para el Usuario
    const finalWhatsappMessage = encodeURIComponent(whatsappMessage);
    const whatsappLink = `https://wa.me/${process.env.NEXT_PUBLIC_CONTACT_WHATSAPP_NUMBER}?text=${finalWhatsappMessage}`;

    // 5. Esperar envío de API (opcional, pero mejora UX)
    try {
        await apiPromise;
    } catch (apiError) {
        console.error("Fallo el envío de email/DB, procediendo a WA.", apiError);
    }
    
    // 6. Redirigir y cerrar
    setStatus('sent');
    window.open(whatsappLink, '_blank');
    
    setTimeout(() => {
      onRequestClose();
      setStatus('idle');
    }, 1000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      style={customStyles}
      contentLabel="Formulario de Contacto"
    >
      <h2 className="text-2xl font-bold text-mcv-azul mb-4">Contactar con un Agente</h2>
      
      {status === 'sent' ? (
        <div className="text-center p-8">
          <p className="text-lg text-mcv-verde font-bold">¡Datos enviados!</p>
          <p className="text-gray-600">Serás redirigido a WhatsApp para enviar tu consulta.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nombre</label>
            <input
              type="text" name="name" id="name" required
              value={formData.name} onChange={handleInputChange}
              placeholder="Ej: Maria Cecilia Vidal" 
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Celular (con cód. de área)</label>
            <input
              type="tel" name="phone" id="phone" required
              value={formData.phone} onChange={handleInputChange}
              placeholder="Ej: 1165517385"
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email" name="email" id="email" required
              value={formData.email} onChange={handleInputChange}
              placeholder="Ej: cecilia@mcvpropiedades.com.ar"
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
            />
          </div>
          <p className="text-sm text-gray-500 mb-4">
            {propertyCount > 0 ?
              `Se enviará una consulta por las ${propertyCount} propiedades que has filtrado.` :
              "Se enviará una consulta general."
            }
          </p>
          
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={onRequestClose}
              disabled={status === 'sending'}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={status === 'sending'}
              className="px-4 py-2 bg-mcv-verde text-white rounded-md hover:bg-opacity-80 flex items-center"
            >
              {status === 'sending' ? <Spinner /> : 'Enviar por WhatsApp'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}