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
import 'react-datepicker/dist/react-datepicker.css';

// Configuración inicial
registerLocale('es', es);
Modal.setAppElement('#__next');

// --- OPCIONES DE TEMPORADA SINCRONIZADAS ---
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
  
  // Estado Principal
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

  // Inicialización
  useEffect(() => {
    if (router.isReady && !hasHydrated) {
      const { query } = router;
      if (query.operacion) setFilters(prev => ({...prev, operacion: query.operacion}));
      setHasHydrated(true);
    }
  }, [router.isReady, hasHydrated]);

  // Cargar Barrios/Zonas dinámicamente
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

  // Búsqueda de Propiedades
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

  // Debounce para búsqueda
  useEffect(() => {
    if (hasHydrated) {
        const handler = setTimeout(() => fetchProperties(filters), 500);
        return () => clearTimeout(handler);
    }
  }, [filters, fetchProperties, hasHydrated]);

  // Manejadores
  const handleFilterChange = (name, value) => {
    setFilters(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'operacion') return { ...next, zona: null, tipo: null, barrios: [], pets: false, pool: false, selectedPeriod: '' };
      if (name === 'zona') next.barrios = [];
      if (name === 'tipo' && value === 'lote') { next.bedrooms = ''; next.pax = ''; next.pets = false; next.pool = false; }
      return next;
    });
  };

  // Popup de Mascotas Detallado (RECUPERADO)
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

  // --- COMPONENTES UI RECUPERADOS ---

  // Tags de Filtros Activos
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
                <button 
                    key={f.key} 
                    onClick={() => removeFilter(f.key)}
                    className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold hover:bg-blue-200 transition"
                >
                    {f.label} ✕
                </button>
            ))}
            <button onClick={() => window.location.reload()} className="text-sm text-gray-500 hover:text-red-500 underline ml-2">
                Limpiar todo
            </button>
        </div>
    );
  };

  // Renderizador Principal del Asistente
  const renderAsistente = () => {
    if (isLoadingFilters) return <div className="p-10"><Spinner /></div>;

    // 1. Selección de Operación
    if (!filters.operacion) {
        return (
            <div className="text-center p-8 animate-fade-in">
                <h1 className="text-4xl font-extrabold text-gray-800 mb-8">¿Qué estás buscando hoy?</h1>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    <button onClick={() => handleFilterChange('operacion', 'venta')} className="group p-8 bg-white border-2 border-gray-100 rounded-2xl shadow-xl hover:border-mcv-azul hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
                        <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">🏠</div>
                        <span className="text-2xl font-bold text-gray-700 group-hover:text-mcv-azul block">Comprar</span>
                        <span className="text-sm text-gray-400 mt-2 block">Encuentra tu nuevo hogar</span>
                    </button>
                    <button onClick={() => handleFilterChange('operacion', 'alquiler_temporal')} className="group p-8 bg-white border-2 border-gray-100 rounded-2xl shadow-xl hover:border-mcv-verde hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
                        <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">🏖️</div>
                        <span className="text-2xl font-bold text-gray-700 group-hover:text-mcv-verde block">Alquiler Temporal</span>
                        <span className="text-sm text-gray-400 mt-2 block">Vacaciones y escapadas</span>
                    </button>
                    <button onClick={() => handleFilterChange('operacion', 'alquiler_anual')} className="group p-8 bg-white border-2 border-gray-100 rounded-2xl shadow-xl hover:border-mcv-gris hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
                        <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">📅</div>
                        <span className="text-2xl font-bold text-gray-700 group-hover:text-mcv-gris block">Alquiler Anual</span>
                        <span className="text-sm text-gray-400 mt-2 block">Contratos largos</span>
                    </button>
                </div>
            </div>
        );
    }
    
    // 2. Selección de Zona (RECUPERADO CON ESTILOS)
    if (!filters.zona) {
        return (
            <div className="text-center p-8 animate-fade-in">
                <button onClick={() => setFilters(prev => ({...prev, operacion: null}))} className="mb-6 text-gray-500 hover:text-gray-800 font-medium">← Volver</button>
                <h2 className="text-3xl font-bold mb-8 text-gray-800">¿En qué zona?</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    <button onClick={() => handleFilterChange('zona', 'GBA Sur')} className="group p-8 bg-white border-2 border-gray-100 rounded-2xl shadow-lg hover:shadow-2xl hover:border-blue-500 transition-all duration-300 transform hover:-translate-y-1">
                        <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">🏡</div>
                        <span className="text-2xl font-bold text-gray-700 group-hover:text-blue-600 block">GBA Sur</span>
                        <span className="text-sm text-gray-400 mt-2 block">Hudson, Berazategui...</span>
                    </button>
                    <button onClick={() => handleFilterChange('zona', 'Costa Esmeralda')} className="group p-8 bg-white border-2 border-gray-100 rounded-2xl shadow-lg hover:shadow-2xl hover:border-green-500 transition-all duration-300 transform hover:-translate-y-1">
                        <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">🌊</div>
                        <span className="text-2xl font-bold text-gray-700 group-hover:text-green-600 block">Costa Esmeralda</span>
                        <span className="text-sm text-gray-400 mt-2 block">Barrios privados y playa</span>
                    </button>
                    <button onClick={() => handleFilterChange('zona', 'Arelauquen (BRC)')} className="group p-8 bg-white border-2 border-gray-100 rounded-2xl shadow-lg hover:shadow-2xl hover:border-cyan-600 transition-all duration-300 transform hover:-translate-y-1">
                        <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">🏔️</div>
                        <span className="text-2xl font-bold text-gray-700 group-hover:text-cyan-700 block">Bariloche</span>
                        <span className="text-sm text-gray-400 mt-2 block">Arelauquen Golf & Country</span>
                    </button>
                </div>
            </div>
        );
    }

    // 3. Panel de Filtros Completo
    const barrioOpts = (listas.barrios[filters.zona] || []).map(b => ({ value: b, label: b }));
    const selectedBarrios = filters.barrios.map(b => ({ value: b, label: b }));

    return (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-lg mb-8 animate-fade-in relative">
            <button onClick={() => setFilters(prev => ({...prev, zona: null}))} className="absolute top-4 right-4 text-xs text-gray-400 hover:text-gray-800 border px-2 py-1 rounded">Cambiar Zona</button>
            
            <ActiveFilters />

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* Columna Izquierda: Búsqueda y Tipo */}
                <div className="md:col-span-3 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Palabra Clave</label>
                        <input type="text" value={filters.searchText} onChange={e => handleFilterChange('searchText', e.target.value)} placeholder="Ej: Golf, Laguna" className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo de Propiedad</label>
                        <select value={filters.tipo || ''} onChange={e => handleFilterChange('tipo', e.target.value)} className="w-full p-3 rounded-lg border border-gray-300 bg-white text-sm">
                            <option value="">Todos los tipos</option>
                            <option value="casa">Casa</option>
                            <option value="departamento">Departamento</option>
                            <option value="lote">Lote</option>
                        </select>
                    </div>
                </div>

                {/* Columna Central: Filtros Específicos */}
                <div className="md:col-span-6 space-y-4">
                    {/* Barrios */}
                    {barrioOpts.length > 0 && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Barrio(s)</label>
                            <Select options={barrioOpts} value={selectedBarrios} onChange={opts => handleFilterChange('barrios', opts ? opts.map(o => o.value) : [])} isMulti placeholder="Seleccionar..." className="text-sm" />
                        </div>
                    )}
                    
                    {/* Alquiler Temporal: Fechas */}
                    {filters.operacion === 'alquiler_temporal' && (
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-bold text-blue-800">📅 Temporada 2026</label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={showOtherDates} onChange={() => { setShowOtherDates(!showOtherDates); setFilters(prev => ({...prev, selectedPeriod: ''})); }} className="h-4 w-4 text-blue-600 rounded" />
                                    <span className="text-xs font-semibold text-blue-600">Otras fechas</span>
                                </label>
                            </div>
                            
                            {!showOtherDates ? (
                                <select value={filters.selectedPeriod} onChange={e => handleFilterChange('selectedPeriod', e.target.value)} className="w-full p-3 rounded-lg border border-blue-200 bg-white font-medium text-gray-700 focus:ring-2 focus:ring-blue-400 outline-none">
                                    <option value="">Seleccionar quincena...</option>
                                    {PERIOD_OPTIONS_2026.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                            ) : (
                                <DatePicker selectsRange startDate={dateRange[0]} endDate={dateRange[1]} onChange={handleDateChange} placeholderText="Seleccionar desde - hasta" className="w-full p-3 rounded-lg border border-blue-200" isClearable dateFormat="dd/MM/yyyy" />
                            )}
                        </div>
                    )}

                    {/* Filtros Numéricos (Dorm, Precio) */}
                    {filters.tipo !== 'lote' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold text-gray-400 mb-1">PRECIO MÍN</label><input type="number" placeholder="USD" value={filters.minPrice} onChange={e => handleFilterChange('minPrice', e.target.value)} className="w-full p-2 border rounded text-sm" /></div>
                            <div><label className="block text-xs font-bold text-gray-400 mb-1">PRECIO MÁX</label><input type="number" placeholder="USD" value={filters.maxPrice} onChange={e => handleFilterChange('maxPrice', e.target.value)} className="w-full p-2 border rounded text-sm" /></div>
                        </div>
                    )}
                </div>

                {/* Columna Derecha: Extras */}
                <div className="md:col-span-3 flex flex-col gap-3 justify-start">
                    <label className="block text-xs font-bold text-gray-500 uppercase">Adicionales</label>
                    {filters.tipo !== 'lote' && (
                        <>
                            <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${filters.pool ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                                <input type="checkbox" checked={filters.pool} onChange={() => setFilters(prev => ({...prev, pool: !prev.pool}))} className="h-5 w-5 rounded text-blue-600" />
                                <span className="font-semibold text-sm">Con Pileta</span>
                            </label>
                            
                            {filters.operacion !== 'venta' && (
                                <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${filters.pets ? 'bg-orange-100 border-orange-300 text-orange-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                                    <input type="checkbox" checked={filters.pets} onChange={handleMascotasChange} className="h-5 w-5 rounded text-orange-500" />
                                    <span className="font-semibold text-sm">Mascotas</span>
                                </label>
                            )}
                            <div className="mt-2">
                                <label className="block text-xs font-bold text-gray-400 mb-1">DORMITORIOS</label>
                                <input type="number" min="1" max="10" value={filters.bedrooms} onChange={e => handleFilterChange('bedrooms', e.target.value)} className="w-full p-2 border rounded text-sm" placeholder="Mínimo" />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
  };

  // Botón Contacto Global
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
        
        {/* Header Simple */}
        <div className="bg-white shadow-sm py-4 mb-8">
            <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
                <div className="text-2xl font-black text-gray-800 tracking-tight">MCV<span className="text-mcv-azul">PROPIEDADES</span></div>
                {filters.operacion && <button onClick={() => setFilters({ operacion: null, zona: null, tipo: null, barrios: [] })} className="text-sm font-semibold text-gray-500 hover:text-mcv-azul">Nueva Búsqueda</button>}
            </div>
        </div>

        <div ref={contentRef} className="max-w-6xl mx-auto px-4 pb-20">
            {renderAsistente()}
            
            {/* Resultados */}
            {isSearching ? <div className="py-20"><Spinner /></div> : (
                results.length > 0 ? (
                    <>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800">Encontramos {propertyCount} propiedades</h3>
                            <select value={filters.sortBy} onChange={(e) => handleFilterChange('sortBy', e.target.value)} className="p-2 border rounded text-sm bg-white">
                                <option value="default">Relevancia</option>
                                <option value="price_asc">Precio: Menor a Mayor</option>
                                <option value="price_desc">Precio: Mayor a Menor</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {results.map(p => <PropertyCard key={p.property_id} property={p} filters={filters} onContact={handleContact} />)}
                        </div>
                        <div className="flex justify-center mt-12">
                            <button onClick={generateContactAction} className="px-8 py-4 bg-green-600 text-white font-bold rounded-full shadow-xl hover:bg-green-700 transform hover:scale-105 transition-all flex items-center gap-2">
                                <FaWhatsapp className="text-2xl" /> Consultar por este listado
                            </button>
                        </div>
                    </>
                ) : ( 
                    filters.operacion && !isLoadingFilters && (
                        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-200">
                            <div className="text-6xl mb-4">🏠❓</div>
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