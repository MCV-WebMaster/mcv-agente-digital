import { useState } from 'react';
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
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
  },
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
};

// ¡NUEVO! Props 'whatsappMessage' y 'adminEmailHtml'
export default function ContactModal({ isOpen, onRequestClose, whatsappMessage, adminEmailHtml, propertyCount }) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
  });
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');

    const contactData = { 
      ...formData, 
      adminMessageHtml: adminEmailHtml // ¡NUEVO!
    };

    // 1. Enviar Email al Administrador (sin esperar)
    fetch('/api/send-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contactData),
    }).catch(err => {
      console.error("Error al enviar email al admin:", err);
    });

    // 2. Crear Link de WhatsApp para el Usuario
    const finalWhatsappMessage = encodeURIComponent(
      `Hola, soy ${formData.name}. Te contacto desde el Agente Digital. \n\n${whatsappMessage}`
    );
    const whatsappLink = `https://wa.me/${process.env.NEXT_PUBLIC_CONTACT_WHATSAPP_NUMBER}?text=${finalWhatsappMessage}`;

    // 3. Redirigir y cerrar
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
          <p className="text-lg text-mcv-verde font-bold">¡Gracias!</p>
          <p className="text-gray-600">Serás redirigido a WhatsApp para enviar tu consulta.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nombre</label>
            <input
              type="text" name="name" id="name" required
              value={formData.name} onChange={handleInputChange}
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