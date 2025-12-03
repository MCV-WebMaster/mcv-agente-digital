import { useState, useEffect } from 'react';
import Modal from 'react-modal';
import Spinner from './Spinner';

const customStyles = {
  content: {
    top: '50px', 
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translateX(-50%)',
    position: 'fixed', 
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh', 
    overflowY: 'auto', 
    borderRadius: '8px',
    boxShadow: '0 4px 40px rgba(0,0,0,0.5)',
    padding: '2rem',
    zIndex: 1000,
  },
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    position: 'fixed',
    zIndex: 999,
  },
};

// RECIBE targetAgentNumber
export default function ContactModal({ isOpen, onRequestClose, whatsappMessage, adminEmailHtml, propertyCount, filteredProperties, currentFilters, targetAgentNumber }) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
  });
  const [status, setStatus] = useState('idle'); 

  useEffect(() => {
    if (isOpen) {
        try {
          const storedData = localStorage.getItem('mcv_contact_data');
          if (storedData) {
            const { name, phone, email } = JSON.parse(storedData);
            setFormData({ name: name || '', phone: phone || '', email: email || '' });
          }
        } catch (e) {
          console.error("Error leyendo localStorage", e);
        }
    }
  }, [isOpen]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');

    localStorage.setItem('mcv_contact_data', JSON.stringify(formData));

    const propertyDetails = filteredProperties ? filteredProperties.map(p => ({ title: p.title, url: p.url, id: p.property_id })) : [];
    
    const contactData = { 
      ...formData, 
      adminMessageHtml: adminEmailHtml,
      propertyDetails: propertyDetails, 
      rawFilters: currentFilters,      
    };

    fetch('/api/send-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contactData),
    }).catch(err => console.error("Error envío silencioso:", err));

    const finalWhatsappMessage = encodeURIComponent(
        `Hola, soy ${formData.name}. ${whatsappMessage.replace('Hola...!', '')}`
    );
    
    // USA targetAgentNumber O EL DEFAULT
    const agentNumber = targetAgentNumber || process.env.NEXT_PUBLIC_WHATSAPP_AGENT_NUMBER;
    const whatsappLink = `https://wa.me/${agentNumber}?text=${finalWhatsappMessage}`;

    window.open(whatsappLink, '_blank');
    
    setStatus('sent');
    
    setTimeout(() => {
      onRequestClose();
      setStatus('idle');
    }, 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      style={customStyles}
      contentLabel="Formulario de Contacto"
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-mcv-azul">Contactar con un Agente</h2>
        <button onClick={onRequestClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
      </div>
      
      {status === 'sent' ? (
        <div className="text-center p-8">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-lg text-mcv-verde font-bold">¡Abriendo WhatsApp!</p>
          <p className="text-gray-600">Gracias por tu consulta.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nombre</label>
            <input
              type="text" name="name" id="name" required
              value={formData.name} onChange={handleInputChange}
              placeholder="Ej: Maria Cecilia Vidal" 
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md focus:ring-mcv-azul focus:border-mcv-azul"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Celular (con cód. de área)</label>
            <input
              type="tel" name="phone" id="phone" required
              value={formData.phone} onChange={handleInputChange}
              placeholder="Ej: 1165517385"
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md focus:ring-mcv-azul focus:border-mcv-azul"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email" name="email" id="email" required
              value={formData.email} onChange={handleInputChange}
              placeholder="Ej: cecilia@mcvpropiedades.com.ar"
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md focus:ring-mcv-azul focus:border-mcv-azul"
            />
          </div>
          
          <div className="bg-gray-50 p-3 rounded text-sm text-gray-600 mb-6 border border-gray-200">
             <p><strong>Estás consultando por:</strong></p>
             {propertyCount === 1 ? (
                 <p className="truncate">Propiedad seleccionada</p>
             ) : (
                 <p>{propertyCount} propiedades filtradas</p>
             )}
          </div>
          
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onRequestClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={status === 'sending'}
              className="px-4 py-2 bg-green-600 text-white font-bold rounded-md hover:bg-green-700 transition-colors flex items-center gap-2 shadow-md"
            >
              {status === 'sending' ? <Spinner /> : 'Ir a WhatsApp'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}