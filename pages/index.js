import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';
import ActiveFilterTag from '@/components/ActiveFilterTag';
import DatePicker, { registerLocale } from 'react-datepicker';
import es from 'date-fns/locale/es';
import Select from 'react-select'; 
import Modal from 'react-modal';
import ContactModal from '@/components/ContactModal';
import WelcomeCarousel from '@/components/WelcomeCarousel';
import Swal from 'sweetalert2';

registerLocale('es', es);
Modal.setAppElement('#__next');

// --- CLAVES LÓGICAS QUE COINCIDEN CON EL DICCIONARIO DEL SERVICIO ---
const PERIOD_OPTIONS_2026 = [
  { value: 'ID_NAV', label: 'Navidad (19/12 al 26/12)' },
  { value: 'ID_AN', label: 'Año Nuevo (26/12 al 02/01)' },
  { value: 'ID_COMBINED', label: 'Año Nuevo c/1er q Enero (30/12 al 15/01)' }, // ESTA ES LA CLAVE CRÍTICA
  { value: 'ID_ENE1', label: 'Ene 1er q (02/01 al 15/01)' },
  { value: 'ID_ENE2', label: 'Ene 2da q (16/01 al 31/01)' },
  { value: 'ID_FEB1', label: 'Feb 1er q c/CARNAVAL (01/02 al 17/02)' },
  { value: 'ID_FEB2', label: 'Feb 2da q (18/02 al 01/03)' },
];

const EXCLUDE_DATES = [{ start: new Date('2025-12-19'), end: new Date('2026-03-01') }];

export default function SearchPage() {
  const router = useRouter(); 
  const contentRef = useRef(null);
  
  const [filters, setFilters] = useState({
    operacion: null, zona: null, tipo: null, barrios: [], 
    pax: '', pax_or_more: false, pets: false, pool: false, 
    bedrooms: '', bedrooms_or_more: false,
    minMts: '', maxMts: '', minPrice: '', maxPrice: '',
    startDate: null, endDate: null, selectedPeriod: '', 
    sortBy: 'default', searchText: '',
  });

  const [dateRange, setDateRange] = useState([null, null]);
  const [showOtherDates, setShowOtherDates] = useState(false); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contactPayload, setContactPayload] = useState({});
  const [results, setResults] = useState([]);
  const [propertyCount, setPropertyCount] = useState(0);
  const [listas, setListas] = useState({ zonas: [], barrios: {} });
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    if (router.isReady && !hasHydrated) {
      const { query } = router;
      if (query.operacion) setFilters(prev => ({...prev, operacion: query.operacion}));
      setHasHydrated(true);
    }
  }, [router.isReady, hasHydrated]);

  useEffect(() => {
    if (!filters.operacion) return;
    async function loadFilters() {
      setIsLoadingFilters(true);
      try {
        const res = await fetch(`/api/get-filters?operacion=${filters.operacion}`);
        const data = await res.json();
        if (data.status === 'OK') setListas({ zonas: Object.keys(data.filtros).sort().reverse(), barrios: data.filtros });
      } catch (err) { setError(err.message); } 
      finally { setIsLoadingFilters(false); }
    }
    loadFilters();
  }, [filters.operacion]);

  const fetchProperties = useCallback(async (currentFilters) => {
    if (!currentFilters.operacion) { setResults([]); setPropertyCount(0); return; }
    setIsSearching(true); setError(null);
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentFilters),
      });
      const data = await response.json();
      if (data.status === 'OK') {
        setResults(data.results);
        setPropertyCount(data.count);
      } else throw new Error(data.error);
    } catch (err) { setError(err.message); } 
    finally { setIsSearching(false); }
  }, []);

  useEffect(() => {
    if (hasHydrated) {
        const handler = setTimeout(() => fetchProperties(filters), 500);
        return () => clearTimeout(handler);
    }
  }, [filters, fetchProperties, hasHydrated]);

  const handleFilterChange = (name, value) => {
    setFilters(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'operacion') return { ...next, zona: null, tipo: null, barrios: [], pets: false, pool: false, startDate: null, selectedPeriod: '' };
      if (name === 'zona') next.barrios = [];
      if (name === 'tipo' && value === 'lote') { next.bedrooms = ''; next.pax = ''; next.pets = false; next.pool = false; }
      return next;
    });
  };

  const handleMascotasChange = () => {
      if (!filters.pets) Swal.fire({ title: 'Política de Mascotas 🐾', html: 'Máximo 3 mascotas. No cachorros.', icon: 'warning', iconColor: '#d97706', confirmButtonText: 'Entendido 🐾', confirmButtonColor: '#d97706' });
      setFilters(prev => ({ ...prev, pets: !prev.pets }));
  };

  const handleCheckboxChange = (name) => {
    setFilters(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleDateChange = (dates) => {
      const [start, end] = dates;
      setDateRange(dates);
      setFilters(prev => ({ ...prev, startDate: start, endDate: end }));
  };

  const handleContact = (prop) => {
      const agent = (filters.operacion === 'venta' && prop.zona === 'Costa Esmeralda') ? process.env.NEXT_PUBLIC_WHATSAPP_AGENT2_NUMBER : process.env.NEXT_PUBLIC_WHATSAPP_AGENT_NUMBER;
      setContactPayload({ whatsappMessage: `Hola! Me interesa: ${prop.title}\n${prop.url}`, adminEmailHtml: `<ul><li>${prop.title}</li></ul>`, propertyCount: 1, targetAgentNumber: agent });
      setIsModalOpen(true);
  };

  const handleMultiBarrio = (opts) => setFilters(prev => ({ ...prev, barrios: opts ? opts.map(o => o.value) : [] }));

  const renderAsistente = () => {
    if (isLoadingFilters) return <Spinner />;

    if (!filters.operacion) {
        return (
            <div className="text-center p-8">
                <h2 className="text-2xl font-bold mb-6">¿Qué buscás?</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
                    <button onClick={() => handleFilterChange('operacion', 'venta')} className="p-6 bg-mcv-azul text-white rounded-xl shadow-lg hover:opacity-90 text-xl font-bold">Comprar</button>
                    <button onClick={() => handleFilterChange('operacion', 'alquiler_temporal')} className="p-6 bg-mcv-verde text-white rounded-xl shadow-lg hover:opacity-90 text-xl font-bold">Alquiler Temporal</button>
                    <button onClick={() => handleFilterChange('operacion', 'alquiler_anual')} className="p-6 bg-mcv-gris text-white rounded-xl shadow-lg hover:opacity-90 text-xl font-bold">Alquiler Anual</button>
                </div>
            </div>
        );
    }
    
    if (!filters.zona) {
        return (
            <div className="text-center p-8">
                <h2 className="text-2xl font-bold mb-6">¿En qué zona?</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                    {(listas.zonas || []).map(z => (
                        <button key={z} onClick={() => handleFilterChange('zona', z)} className="p-4 bg-white border border-gray-200 rounded-lg shadow hover:bg-gray-50 font-bold text-lg">{z}</button>
                    ))}
                </div>
            </div>
        );
    }

    const barrioOpts = (listas.barrios[filters.zona] || []).map(b => ({ value: b, label: b }));
    const selectedBarrios = filters.barrios.map(b => ({ value: b, label: b }));

    return (
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-sm mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div><label className="block text-sm font-bold text-gray-700 mb-2">Palabra Clave</label><input type="text" value={filters.searchText} onChange={e => handleFilterChange('searchText', e.target.value)} placeholder="Ej: Quincho, Polo" className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500" /></div>
                <div><label className="block text-sm font-bold text-gray-700 mb-2">Tipo de Propiedad</label><select value={filters.tipo || ''} onChange={e => handleFilterChange('tipo', e.target.value)} className="w-full p-3 rounded-lg border border-gray-300 bg-white"><option value="">Cualquiera</option><option value="casa">Casa</option><option value="departamento">Departamento</option><option value="lote">Lote</option><option value="local">Local Comercial</option><option value="deposito">Depósito</option></select></div>
            </div>
            {barrioOpts.length > 0 && <div className="mb-6"><label className="block text-sm font-bold text-gray-700 mb-2">Barrio(s)</label><Select options={barrioOpts} value={selectedBarrios} onChange={handleMultiBarrio} isMulti placeholder="Seleccionar barrios..." className="text-base" /></div>}
            
            {filters.tipo !== 'lote' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {filters.operacion !== 'venta' && <><div><label className="block text-xs font-bold text-gray-500 mb-1">DORMITORIOS MÍN.</label><input type="number" value={filters.bedrooms} onChange={e => handleFilterChange('bedrooms', e.target.value)} className="w-full p-2 border rounded" /></div><div><label className="block text-xs font-bold text-gray-500 mb-1">CANT. PASAJEROS</label><input type="number" value={filters.pax} onChange={e => handleFilterChange('pax', e.target.value)} className="w-full p-2 border rounded" /></div></>}
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">PRESUPUESTO MÍNIMO (USD)</label><input type="number" value={filters.minPrice} onChange={e => handleFilterChange('minPrice', e.target.value)} className="w-full p-2 border rounded" /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">PRESUPUESTO MÁXIMO (USD)</label><input type="number" value={filters.maxPrice} onChange={e => handleFilterChange('maxPrice', e.target.value)} className="w-full p-2 border rounded" /></div>
                </div>
            )}

            {filters.operacion === 'alquiler_temporal' && (
                <div className="mb-6 bg-white p-4 rounded-lg border border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="block text-sm font-bold text-gray-700 mb-2">Temporada 2026</label><select value={filters.selectedPeriod} onChange={e => handleFilterChange('selectedPeriod', e.target.value)} disabled={showOtherDates} className="w-full p-3 rounded border bg-gray-50 disabled:opacity-50"><option value="">Seleccionar Periodo...</option>{PERIOD_OPTIONS_2026.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
                        <div className="flex items-center"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showOtherDates} onChange={() => { setShowOtherDates(!showOtherDates); setFilters(prev => ({...prev, selectedPeriod: ''})); }} className="h-5 w-5 text-blue-600" /><span className="font-bold text-gray-700">Otras fechas (Fuera de temporada)</span></label></div>
                    </div>
                    {showOtherDates && <div className="mt-4"><DatePicker selectsRange startDate={dateRange[0]} endDate={dateRange[1]} onChange={handleDateChange} placeholderText="Seleccionar rango de fechas" className="w-full p-3 border rounded" isClearable /></div>}
                </div>
            )}

            {filters.tipo !== 'lote' && (
                <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-4 py-2 rounded border hover:bg-gray-50"><input type="checkbox" checked={filters.pool} onChange={() => setFilters(prev => ({...prev, pool: !prev.pool}))} className="h-5 w-5 text-blue-600" /><span className="font-medium">Con Pileta</span></label>
                    {filters.operacion !== 'venta' && <label className="flex items-center gap-2 cursor-pointer bg-white px-4 py-2 rounded border hover:bg-gray-50"><input type="checkbox" checked={filters.pets} onChange={handleMascotasChange} className="h-5 w-5 text-blue-600" /><span className="font-medium">Acepta Mascotas</span></label>}
                </div>
            )}
        </div>
    );
  };

  const generateContactAction = () => {
      const msg = results.length > 10 ? `Hola! Vi que hay ${propertyCount} propiedades para mi búsqueda.` : `Hola! Me interesan estas propiedades:\n\n${results.map(p => p.title).join('\n')}`;
      const agent = process.env.NEXT_PUBLIC_WHATSAPP_AGENT_NUMBER;
      setContactPayload({ whatsappMessage: msg, adminEmailHtml: '<p>Contacto Web</p>', propertyCount: results.length, targetAgentNumber: agent });
      setIsModalOpen(true);
  };

  return (
    <div id="__next" className="min-h-screen bg-white">
        <Head><title>Buscador Inteligente | MCV Propiedades</title></Head>
        <ContactModal isOpen={isModalOpen} onRequestClose={() => setIsModalOpen(false)} {...contactPayload} />
        <div ref={contentRef} className="max-w-6xl mx-auto px-4 py-8">
            {renderAsistente()}
            {isSearching ? <Spinner /> : (
                results.length > 0 ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{results.map(p => <PropertyCard key={p.property_id} property={p} filters={filters} onContact={handleContact} />)}</div>
                        <div className="flex justify-center mt-8"><button onClick={generateContactAction} className="px-6 py-3 bg-mcv-verde text-white font-bold rounded-lg shadow-lg">Contactar Agente</button></div>
                    </>
                ) : ( filters.operacion && !isLoadingFilters && <div className="text-center p-10 text-gray-500 bg-gray-50 rounded">No se encontraron propiedades.</div> )
            )}
        </div>
    </div>
  );
}