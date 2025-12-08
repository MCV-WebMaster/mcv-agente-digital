import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';
import DatePicker, { registerLocale } from 'react-datepicker';
import es from 'date-fns/locale/es';
import Select from 'react-select'; 
import Modal from 'react-modal';
import ContactModal from '@/components/ContactModal';
import Swal from 'sweetalert2';
import { FaWhatsapp } from 'react-icons/fa'; // Importación corregida
import 'react-datepicker/dist/react-datepicker.css';

registerLocale('es', es);
Modal.setAppElement('#__next');

// CLAVES SEGURAS PARA EL BUSCADOR
const PERIOD_OPTIONS_2026 = [
  { value: 'ID_NAV', label: '🎄 Navidad (19/12 al 26/12)' },
  { value: 'ID_AN', label: '🥂 Año Nuevo (26/12 al 02/01)' },
  { value: 'ID_COMBINED', label: '🌟 Año Nuevo Extendido (30/12 al 15/01)' },
  { value: 'ID_ENE1', label: '📅 Enero 1ra Quincena (02/01 al 15/01)' },
  { value: 'ID_ENE2', label: '📅 Enero 2da Quincena (16/01 al 31/01)' },
  { value: 'ID_FEB1', label: '🎭 Feb 1ra + Carnaval (01/02 al 17/02)' },
  { value: 'ID_FEB2', label: '📅 Febrero 2da Quincena (18/02 al 01/03)' },
];

export default function SearchPage() {
  const router = useRouter(); 
  const contentRef = useRef(null);
  
  const [filters, setFilters] = useState({
    operacion: null, 
    zona: null, 
    tipo: null, 
    barrios: [], 
    pax: '', 
    pets: false, 
    pool: false, 
    bedrooms: '', 
    minPrice: '', 
    maxPrice: '',
    startDate: null, 
    endDate: null, 
    selectedPeriod: '', 
    sortBy: 'default', 
    searchText: '',
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
      } catch (err) { console.error(err); } 
      finally { setIsLoadingFilters(false); }
    }
    loadFilters();
  }, [filters.operacion]);

  const fetchProperties = useCallback(async (currentFilters) => {
    if (!currentFilters.operacion) { setResults([]); setPropertyCount(0); return; }
    setIsSearching(true);
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
      }
    } catch (err) { console.error(err); } 
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
      if (name === 'operacion') return { ...next, zona: null, tipo: null, barrios: [], pets: false, pool: false, selectedPeriod: '' };
      if (name === 'zona') next.barrios = [];
      if (name === 'tipo' && value === 'lote') { next.bedrooms = ''; next.pax = ''; next.pets = false; next.pool = false; }
      return next;
    });
  };

  const handleMascotasChange = () => {
    if (!filters.pets) {
        Swal.fire({
            title: '<span class="text-2xl font-bold text-gray-800">Política de Mascotas 🐾</span>',
            html: `
                <div class="text-left bg-orange-50 p-5 rounded-lg border border-orange-100">
                    <p class="mb-3 text-gray-700 font-medium">Reglas generales para propiedades Pet Friendly:</p>
                    <ul class="list-disc pl-5 space-y-2 text-sm text-gray-600">
                        <li><strong>Cantidad:</strong> Generalmente máx. 2 mascotas pequeñas/medianas.</li>
                        <li><strong>Restricciones:</strong> Razas peligrosas o perros muy grandes requieren aprobación.</li>
                        <li><strong>Prohibido:</strong> No se suelen aceptar cachorros por riesgo de daños.</li>
                        <li><strong>Responsabilidad:</strong> El inquilino cubre 100% daños o suciedad.</li>
                    </ul>
                    <p class="mt-4 text-xs text-gray-500 italic">*Cada propiedad puede tener reglas específicas.</p>
                </div>
            `,
            icon: 'info',
            iconColor: '#f59e0b',
            confirmButtonText: 'Entendido, aplicar filtro',
            confirmButtonColor: '#f59e0b',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            focusConfirm: false,
            customClass: {
                popup: 'rounded-xl shadow-2xl',
                confirmButton: 'rounded-lg px-6 py-3 font-bold',
                cancelButton: 'rounded-lg px-6 py-3 text-gray-500 hover:bg-gray-100'
            }
        }).then((result) => {
            if (result.isConfirmed) setFilters(prev => ({ ...prev, pets: true }));
        });
    } else {
        setFilters(prev => ({ ...prev, pets: false }));
    }
  };

  const handleDateChange = (dates) => {
      const [start, end] = dates;
      setDateRange(dates);
      setFilters(prev => ({ ...prev, startDate: start, endDate: end }));
  };

  const handleContact = (prop) => {
      const agent = (filters.operacion === 'venta' && prop.zona === 'Costa Esmeralda') 
        ? process.env.NEXT_PUBLIC_WHATSAPP_AGENT2_NUMBER 
        : process.env.NEXT_PUBLIC_WHATSAPP_AGENT_NUMBER;
      
      setContactPayload({ 
        whatsappMessage: `Hola! Me interesa esta propiedad: ${prop.title}\n${prop.url}`, 
        adminEmailHtml: `<ul><li>${prop.title}</li></ul>`, 
        propertyCount: 1, 
        targetAgentNumber: agent 
      });
      setIsModalOpen(true);
  };

  const removeFilter = (key) => {
      if (key === 'barrios') setFilters(prev => ({ ...prev, barrios: [] }));
      else if (key === 'dates') { setFilters(prev => ({ ...prev, startDate: null, endDate: null, selectedPeriod: '' })); setDateRange([null, null]); }
      else if (key === 'price') setFilters(prev => ({ ...prev, minPrice: '', maxPrice: '' }));
      else handleFilterChange(key, key === 'pets' || key === 'pool' ? false : '');
  };

  const ActiveFilters = () => {
    const active = [];
    if (filters.zona) active.push({ key: 'zona', label: filters.zona });
    if (filters.tipo) active.push({ key: 'tipo', label: filters.tipo });
    if (filters.barrios.length > 0) active.push({ key: 'barrios', label: `${filters.barrios.length} barrios` });
    if (filters.selectedPeriod) {
        const pLabel = PERIOD_OPTIONS_2026.find(p => p.value === filters.selectedPeriod)?.label;
        active.push({ key: 'dates', label: pLabel || 'Periodo' });
    }
    if (filters.pets) active.push({ key: 'pets', label: 'Mascotas' });
    if (filters.pool) active.push({ key: 'pool', label: 'Pileta' });
    
    if (active.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2 mb-6">
            {active.map(f => (
                <button key={f.key} onClick={() => removeFilter(f.key)} className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold hover:bg-blue-200 transition">
                    {f.label} ✕
                </button>
            ))}
            <button onClick={() => window.location.reload()} className="text-sm text-gray-500 hover:text-red-500 underline ml-2">Limpiar todo</button>
        </div>
    );
  };

  const renderAsistente = () => {
    if (isLoadingFilters) return <div className="p-20 flex justify-center"><Spinner /></div>;

    if (!filters.operacion) {
        return (
            <div className="text-center py-10 animate-fade-in">
                <h1 className="text-3xl md:text-4xl font-extrabold text-gray-700 mb-10 tracking-tight">¿Qué estás buscando hoy?</h1>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto px-4">
                    <button onClick={() => handleFilterChange('operacion', 'venta')} className="group relative overflow-hidden bg-mcv-verde text-white p-8 rounded-lg shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left">
                        <div className="relative z-10"><h3 className="text-2xl font-bold mb-1">Comprar</h3><p className="text-sm font-medium opacity-90">Encuentra tu nuevo hogar</p></div>
                    </button>
                    <button onClick={() => handleFilterChange('operacion', 'alquiler_temporal')} className="group relative overflow-hidden bg-mcv-azul text-white p-8 rounded-lg shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left">
                        <div className="relative z-10"><h3 className="text-2xl font-bold mb-1">Alquiler Temporal</h3><p className="text-sm font-medium opacity-90">Vacaciones y escapadas</p></div>
                    </button>
                    <button onClick={() => handleFilterChange('operacion', 'alquiler_anual')} className="group relative overflow-hidden bg-mcv-gris text-white p-8 rounded-lg shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left">
                        <div className="relative z-10"><h3 className="text-2xl font-bold mb-1">Alquiler Anual</h3><p className="text-sm font-medium opacity-90">Contratos largos</p></div>
                    </button>
                </div>
            </div>
        );
    }
    
    if (!filters.zona) {
        return (
            <div className="text-center py-10 animate-fade-in">
                <div className="flex justify-start max-w-6xl mx-auto px-4 mb-8">
                    <button onClick={() => setFilters(prev => ({...prev, operacion: null}))} className="text-sm font-semibold text-gray-500 hover:text-mcv-azul transition-colors flex items-center gap-2">← Volver al inicio</button>
                </div>
                <h2 className="text-3xl font-extrabold text-gray-700 mb-10 tracking-tight">¿En qué zona?</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto px-4">
                    <button onClick={() => handleFilterChange('zona', 'GBA Sur')} className="group bg-white border-l-8 border-mcv-verde p-8 rounded-r-lg shadow-sm hover:shadow-md transition-all duration-300 text-left border-y border-r border-gray-100 hover:border-gray-200">
                        <h3 className="text-xl font-bold text-gray-800 mb-1 group-hover:text-mcv-verde transition-colors">GBA Sur</h3><p className="text-sm text-gray-500">Hudson, Berazategui y alrededores</p>
                    </button>
                    <button onClick={() => handleFilterChange('zona', 'Costa Esmeralda')} className="group bg-white border-l-8 border-mcv-azul p-8 rounded-r-lg shadow-sm hover:shadow-md transition-all duration-300 text-left border-y border-r border-gray-100 hover:border-gray-200">
                        <h3 className="text-xl font-bold text-gray-800 mb-1 group-hover:text-mcv-azul transition-colors">Costa Esmeralda</h3><p className="text-sm text-gray-500">Barrios privados y playa</p>
                    </button>
                    <button onClick={() => handleFilterChange('zona', 'Arelauquen (BRC)')} className="group bg-white border-l-8 border-mcv-gris p-8 rounded-r-lg shadow-sm hover:shadow-md transition-all duration-300 text-left border-y border-r border-gray-100 hover:border-gray-200">
                        <h3 className="text-xl font-bold text-gray-800 mb-1 group-hover:text-mcv-gris transition-colors">Bariloche</h3><p className="text-sm text-gray-500">Arelauquen Golf & Country</p>
                    </button>
                </div>
            </div>
        );
    }

    const barrioOpts = (listas.barrios[filters.zona] || []).map(b => ({ value: b, label: b }));
    const selectedBarrios = filters.barrios.map(b => ({ value: b, label: b }));

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8 animate-fade-in relative">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                <h3 className="font-bold text-gray-700 text-lg">Filtros de búsqueda</h3>
                <button onClick={() => setFilters(prev => ({...prev, zona: null}))} className="text-xs font-semibold text-mcv-azul hover:underline">Cambiar Zona</button>
            </div>
            
            <ActiveFilters />

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-3 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1 tracking-wider">Palabra Clave</label>
                        <input type="text" value={filters.searchText} onChange={e => handleFilterChange('searchText', e.target.value)} placeholder="Ej: Golf, Laguna" className="w-full p-2.5 rounded border border-gray-300 focus:border-mcv-azul focus:ring-1 focus:ring-mcv-azul outline-none text-sm transition-all" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1 tracking-wider">Tipo de Propiedad</label>
                        <select value={filters.tipo || ''} onChange={e => handleFilterChange('tipo', e.target.value)} className="w-full p-2.5 rounded border border-gray-300 bg-white text-sm focus:border-mcv-azul outline-none">
                            <option value="">Todos los tipos</option>
                            <option value="casa">Casa</option>
                            <option value="departamento">Departamento</option>
                            <option value="lote">Lote</option>
                        </select>
                    </div>
                </div>

                <div className="md:col-span-6 space-y-4">
                    {barrioOpts.length > 0 && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1 tracking-wider">Barrio(s)</label>
                            <Select options={barrioOpts} value={selectedBarrios} onChange={opts => handleFilterChange('barrios', opts ? opts.map(o => o.value) : [])} isMulti placeholder="Seleccionar..." className="text-sm" styles={{ control: (base) => ({...base, borderColor: '#d1d5db', '&:hover': { borderColor: '#4A90E2' } }), option: (base, state) => ({...base, backgroundColor: state.isSelected ? '#4A90E2' : state.isFocused ? '#eff6ff' : 'white'}) }} />
                        </div>
                    )}
                    
                    {filters.operacion === 'alquiler_temporal' && (
                        <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-bold text-mcv-azul uppercase tracking-wider">Temporada 2026</label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={showOtherDates} onChange={() => { setShowOtherDates(!showOtherDates); setFilters(prev => ({...prev, selectedPeriod: ''})); }} className="h-4 w-4 text-mcv-azul rounded focus:ring-mcv-azul" />
                                    <span className="text-xs font-semibold text-gray-600">Otras fechas</span>
                                </label>
                            </div>
                            
                            {!showOtherDates ? (
                                <select value={filters.selectedPeriod} onChange={e => handleFilterChange('selectedPeriod', e.target.value)} className="w-full p-2.5 rounded border border-blue-200 bg-white font-medium text-gray-700 focus:border-mcv-azul outline-none text-sm">
                                    <option value="">Seleccionar quincena...</option>
                                    {PERIOD_OPTIONS_2026.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                            ) : (
                                <DatePicker selectsRange startDate={dateRange[0]} endDate={dateRange[1]} onChange={handleDateChange} placeholderText="Seleccionar desde - hasta" className="w-full p-2.5 rounded border border-blue-200 text-sm" isClearable dateFormat="dd/MM/yyyy" />
                            )}
                        </div>
                    )}

                    {filters.tipo !== 'lote' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Precio Mín</label><input type="number" placeholder="USD" value={filters.minPrice} onChange={e => handleFilterChange('minPrice', e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm focus:border-mcv-gris outline-none" /></div>
                            <div><label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Precio Máx</label><input type="number" placeholder="USD" value={filters.maxPrice} onChange={e => handleFilterChange('maxPrice', e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm focus:border-mcv-gris outline-none" /></div>
                        </div>
                    )}
                </div>

                <div className="md:col-span-3 flex flex-col gap-3 justify-start">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Adicionales</label>
                    {filters.tipo !== 'lote' && (
                        <>
                            <label className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-all ${filters.pool ? 'bg-blue-50 border-mcv-azul text-mcv-azul' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                                <input type="checkbox" checked={filters.pool} onChange={() => setFilters(prev => ({...prev, pool: !prev.pool}))} className="h-4 w-4 rounded text-mcv-azul focus:ring-mcv-azul" />
                                <span className="font-semibold text-sm">Con Pileta</span>
                            </label>
                            
                            {filters.operacion !== 'venta' && (
                                <label className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-all ${filters.pets ? 'bg-green-50 border-mcv-verde text-mcv-verde' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                                    <input type="checkbox" checked={filters.pets} onChange={handleMascotasChange} className="h-4 w-4 rounded text-mcv-verde focus:ring-mcv-verde" />
                                    <span className="font-semibold text-sm">Mascotas</span>
                                </label>
                            )}
                            <div className="mt-2">
                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Dormitorios</label>
                                <input type="number" min="1" max="10" value={filters.bedrooms} onChange={e => handleFilterChange('bedrooms', e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm focus:border-mcv-gris outline-none" placeholder="Mínimo" />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
  };

  const generateContactAction = () => {
      const msg = results.length > 10 
        ? `Hola! Vi que hay ${propertyCount} propiedades para mi búsqueda en la web.` 
        : `Hola! Me interesan estas propiedades:\n\n${results.map(p => p.title).join('\n')}`;
      const agent = process.env.NEXT_PUBLIC_WHATSAPP_AGENT_NUMBER;
      setContactPayload({ whatsappMessage: msg, adminEmailHtml: '<p>Contacto Web General</p>', propertyCount: results.length, targetAgentNumber: agent });
      setIsModalOpen(true);
  };

  return (
    <div id="__next" className="min-h-screen bg-gray-50 font-sans">
        <Head><title>Buscador MCV Propiedades</title></Head>
        <ContactModal isOpen={isModalOpen} onRequestClose={() => setIsModalOpen(false)} {...contactPayload} />
        
        <div className="bg-white shadow-sm py-4 mb-8">
            <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
                <div className="text-2xl font-black text-gray-800 tracking-tight">MCV<span className="text-mcv-azul">PROPIEDADES</span></div>
                {filters.operacion && <button onClick={() => setFilters({ operacion: null, zona: null, tipo: null, barrios: [] })} className="text-sm font-semibold text-gray-500 hover:text-mcv-azul">Nueva Búsqueda</button>}
            </div>
        </div>

        <div ref={contentRef} className="max-w-6xl mx-auto px-4 pb-20">
            {renderAsistente()}
            
            {isSearching ? <div className="py-20"><Spinner /></div> : (
                results.length > 0 ? (
                    <>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800">Encontramos {propertyCount} propiedades</h3>
                            <select value={filters.sortBy} onChange={(e) => handleFilterChange('sortBy', e.target.value)} className="p-2 border rounded text-sm bg-white focus:border-mcv-azul outline-none">
                                <option value="default">Relevancia</option>
                                <option value="price_asc">Precio: Menor a Mayor</option>
                                <option value="price_desc">Precio: Mayor a Menor</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {results.map(p => <PropertyCard key={p.property_id} property={p} filters={filters} onContact={handleContact} />)}
                        </div>
                        <div className="flex justify-center mt-12">
                            <button onClick={generateContactAction} className="px-8 py-4 bg-mcv-verde text-white font-bold rounded-full shadow-xl hover:bg-green-700 transform hover:scale-105 transition-all flex items-center gap-2">
                                <FaWhatsapp className="text-2xl" /> Consultar por este listado
                            </button>
                        </div>
                    </>
                ) : ( 
                    filters.operacion && !isLoadingFilters && (
                        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-200">
                            <div className="text-6xl mb-4 grayscale opacity-50">🏠</div>
                            <h3 className="text-2xl font-bold text-gray-800 mb-2">No encontramos propiedades exactas</h3>
                            <p className="text-gray-500 mb-6">Intenta ampliar tu búsqueda o cambiar los filtros.</p>
                            <button onClick={() => setFilters(prev => ({...prev, barrios: [], minPrice: '', maxPrice: '', selectedPeriod: ''}))} className="text-mcv-azul font-bold hover:underline">Limpiar filtros</button>
                        </div>
                    ) 
                )
            )}
        </div>
    </div>
  );
}