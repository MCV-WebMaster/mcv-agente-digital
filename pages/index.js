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
// Sin Footer ni FloatingButton
import Swal from 'sweetalert2';

registerLocale('es', es);

Modal.setAppElement('#__next');

const PERIOD_OPTIONS_2026 = [
  { value: 'Diciembre 2da Quincena', label: 'Diciembre 2da Quincena (15/12 al 31/12)' },
  { value: 'Navidad', label: 'Navidad (19/12 al 26/12)' },
  { value: 'Año Nuevo', label: 'Año Nuevo (26/12 al 02/01)' },
  { value: 'Año Nuevo con 1ra Enero', label: 'Año Nuevo c/1ra Enero (30/12 al 15/01)' },
  { value: 'Enero 1ra Quincena', label: 'Enero 1ra Quincena (02/01 al 15/01)' },
  { value: 'Enero 2da Quincena', label: 'Enero 2da Quincena (16/01 al 31/01)' },
  { value: 'Febrero 1ra Quincena', label: 'Febrero 1ra Quincena (01/02 al 17/02)' },
  { value: 'Febrero 2da Quincena', label: 'Febrero 2da Quincena (18/02 al 01/03)' },
];

const EXCLUDE_DATES = [
  { start: new Date('2025-12-19'), end: new Date('2026-03-01') }
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
    pax_or_more: false,
    pets: false,
    pool: false,
    bedrooms: '',
    bedrooms_or_more: false,
    minMts: '',
    maxMts: '',
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
  
  const [contactPayload, setContactPayload] = useState({
    whatsappMessage: '',
    adminEmailHtml: '',
    propertyCount: 0,
    filteredProperties: [],
    currentFilters: {}
  });

  const [results, setResults] = useState([]);
  const [propertyCount, setPropertyCount] = useState(0);
  const [listas, setListas] = useState({ zonas: [], barrios: {} });
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  const pricePlaceholder = {
    venta: "Ej: 300000",
    alquiler_temporal: "Ej: 1500",
    alquiler_anual: "Ej: 1000"
  };

  useEffect(() => {
    if (router.isReady && !hasHydrated) {
      const { query } = router;
      if (query.operacion) {
        setFilters(prev => ({
          ...prev,
          operacion: query.operacion,
          zona: query.zona || null,
          tipo: query.tipo || null,
          barrios: query.barrios ? query.barrios.split(',') : [],
          pax: query.pax || '',
          selectedPeriod: query.selectedPeriod || '',
          searchText: query.searchText || '',
          pax_or_more: query.pax ? true : false,
          bedrooms: query.bedrooms || '',
          bedrooms_or_more: query.bedrooms ? true : false
        }));
      }
      setHasHydrated(true);
    }
  }, [router.isReady, hasHydrated, router]);

  useEffect(() => {
    if (!filters.operacion) return;
    async function loadFilters() {
      setIsLoadingFilters(true);
      setError(null);
      try {
        const res = await fetch(`/api/get-filters?operacion=${filters.operacion}`);
        const data = await res.json();
        if (data.status === 'OK') {
          setListas({ 
            zonas: Object.keys(data.filtros).sort().reverse(), 
            barrios: data.filtros
          });
        } else {
          setListas({ zonas: [], barrios: {} });
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoadingFilters(false);
      }
    }
    loadFilters();
  }, [filters.operacion]);

  const fetchProperties = useCallback(async (currentFilters) => {
    if (!currentFilters.operacion) {
      setResults([]); 
      setPropertyCount(0);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      const payload = { 
          ...currentFilters, 
          bedrooms_or_more: currentFilters.bedrooms_or_more 
      };
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (data.status === 'OK') {
        setResults(data.results);
        setPropertyCount(data.count);
      } else {
        throw new Error(data.error || 'Error en la API');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (hasHydrated) {
        const handler = setTimeout(() => {
          fetchProperties(filters);
        }, 500); 
        return () => clearTimeout(handler);
    }
  }, [filters, fetchProperties, hasHydrated]);

  const handleFilterChange = (name, value) => {
    setFilters(prev => {
      let newState = { ...prev, [name]: value };
      
      if (name === 'operacion') {
        newState = { 
            ...newState, 
            zona: null, tipo: null, barrios: [],
            pax: '', pets: false, pool: false, bedrooms: '',
            startDate: null, endDate: null, selectedPeriod: ''
        };
        setDateRange([null, null]);
        setShowOtherDates(false);
      }
      
      if (name === 'zona') newState.barrios = []; 
      
      if (name === 'tipo' && value === 'lote') {
        newState = { ...newState,
          bedrooms: '', pax: '', pax_or_more: false, 
          pets: false, pool: false
        };
      }
      return newState;
    });
  };

  // --- LOGIC: Handler de Checkbox + Popup Mascotas ---
  const handleCheckboxChange = (name) => {
    // Si el usuario activa Mascotas, mostramos el aviso
    if (name === 'pets' && !filters.pets) {
        Swal.fire({
            title: 'Política de Mascotas 🐾',
            html: `
                <div style="text-align: left; font-size: 0.95rem; color: #78350f;">
                    <p style="margin-bottom: 10px; font-weight: 600;">¡Nos encantan las visitas de cuatro patas! Solo recordá:</p>
                    <ul style="list-style-type: disc; padding-left: 20px; line-height: 1.6;">
                        <li>Máximo <strong>3 mascotas</strong> por propiedad.</li>
                        <li><strong>No se aceptan cachorros</strong> (menores de 2 años).</li>
                        <li>Razas de guardia o peligrosas no permitidas.</li>
                    </ul>
                </div>
            `,
            icon: 'warning',
            iconColor: '#d97706',
            background: '#fffbeb',
            confirmButtonText: 'Entendido 🐾',
            confirmButtonColor: '#d97706',
        });
    }
    setFilters(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleMultiBarrioChange = (selectedOptions) => {
    const barrioValues = selectedOptions ? selectedOptions.map(option => option.value) : [];
    setFilters(prev => ({ ...prev, barrios: barrioValues }));
  };

  const handleDateChange = (dates) => {
    const [start, end] = dates;
    setDateRange(dates);
    if (start && end) {
      setFilters(prev => ({
        ...prev,
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        selectedPeriod: '', 
      }));
    } else {
      setFilters(prev => ({ ...prev, startDate: null, endDate: null }));
    }
  };
  
  const handleShowOtherDates = () => {
    setShowOtherDates(!showOtherDates);
    setFilters(prev => ({
      ...prev,
      startDate: null,
      endDate: null,
      selectedPeriod: '',
    }));
    setDateRange([null, null]);
  };

  const removeFilter = (name, value = null) => {
    const defaultFilters = {
      operacion: null, zona: null, tipo: null, barrios: [],
      pax: '', pax_or_more: false, pets: false, pool: false, bedrooms: '',
      bedrooms_or_more: false,
      minMts: '', maxMts: '', minPrice: '', maxPrice: '',
      startDate: null, endDate: null, selectedPeriod: '', sortBy: 'default', searchText: ''
    };
    if (name === 'operacion') {
      setFilters(defaultFilters);
      setDateRange([null, null]);
      setShowOtherDates(false);
    } else if (name === 'zona') {
      setFilters(prev => ({ ...prev, zona: null, barrios: [] }));
    } else if (name === 'barrios') {
      setFilters(prev => ({ ...prev, barrios: prev.barrios.filter(b => b !== value) }));
    } else {
      setFilters(prev => ({ ...prev, [name]: defaultFilters[name] }));
    }
  };

  const generateContactMessages = () => {
    const targetAgentNumber = process.env.NEXT_PUBLIC_WHATSAPP_AGENT_NUMBER;
    let whatsappMessage, adminEmailHtml;
    
    if (results.length > 0 && results.length <= 10) {
      const propsListWsp = results.map(p => `${p.title}\n${p.url}\n`).join('\n');
      const propsListHtml = results.map(p => `<li><strong>${p.title}</strong><br><a href="${p.url}">${p.url}</a></li>`).join('');
      whatsappMessage = `Hola! Me interesan estas propiedades:\n\n${propsListWsp}`;
      adminEmailHtml = `<ul>${propsListHtml}</ul>`;
    } else {
      whatsappMessage = `Hola! Busco propiedades en ${filters.zona || 'general'}.`;
      adminEmailHtml = `<p>Búsqueda general.</p>`;
    }
    
    setContactPayload({ 
        whatsappMessage, 
        adminEmailHtml, 
        propertyCount: results.length,
        filteredProperties: results,
        currentFilters: filters,
        targetAgentNumber 
    });
    setIsModalOpen(true);
  };

  const handleContactSingleProperty = (property) => {
    const targetAgentNumber = process.env.NEXT_PUBLIC_WHATSAPP_AGENT_NUMBER;
    const whatsappMessage = `Hola! Me interesa: ${property.title}\n${property.url}`;
    const adminEmailHtml = `<ul><li><strong>${property.title}</strong><br><a href="${property.url}">${property.url}</a></li></ul>`;
    setContactPayload({ 
        whatsappMessage, 
        adminEmailHtml, 
        propertyCount: 1,
        filteredProperties: [property],
        currentFilters: filters,
        targetAgentNumber
    });
    setIsModalOpen(true);
  };

  const renderFiltrosActivos = () => (
    <div className="flex flex-wrap gap-2 items-center min-h-[34px]">
      {filters.operacion && <ActiveFilterTag label={`${filters.operacion.replace('_', ' ')}`} onRemove={() => removeFilter('operacion')} />}
      {filters.zona && <ActiveFilterTag label={`Zona: ${filters.zona}`} onRemove={() => removeFilter('zona')} />}
      {filters.tipo && <ActiveFilterTag label={`Tipo: ${filters.tipo}`} onRemove={() => removeFilter('tipo')} />}
      {filters.barrios.map(b => (
          <ActiveFilterTag key={b} label={`Barrio: ${b}`} onRemove={() => removeFilter('barrios', b)} />
      ))}
      {filters.searchText && <ActiveFilterTag label={`"${filters.searchText}"`} onRemove={() => removeFilter('searchText')} />}
    </div>
  );

  const renderAsistente = () => {
    if (!filters.operacion) {
        return (
            <div className="text-center">
            <h2 className="text-xl font-bold mb-4">¿Qué buscás?</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button onClick={() => handleFilterChange('operacion', 'venta')} className="p-4 bg-mcv-azul text-white rounded-lg shadow-lg hover:bg-opacity-80 transition-all text-lg font-bold">Comprar</button>
                <button onClick={() => handleFilterChange('operacion', 'alquiler_temporal')} className="p-4 bg-mcv-verde text-white rounded-lg shadow-lg hover:bg-opacity-80 transition-all text-lg font-bold">Alquiler Temporal</button>
                <button onClick={() => handleFilterChange('operacion', 'alquiler_anual')} className="p-4 bg-mcv-gris text-white rounded-lg shadow-lg hover:bg-opacity-80 transition-all text-lg font-bold">Alquiler Anual</button>
            </div>
            </div>
        );
    }
    
    if (isLoadingFilters) return <Spinner />;
    
    if (!filters.zona) {
      const buttonColors = ['bg-mcv-azul text-white', 'bg-mcv-verde text-white', 'bg-mcv-gris text-white'];
      return (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">¿En qué zona?</h2>
          {listas.zonas.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {listas.zonas.map((zona, index) => (
                <button key={zona} onClick={() => handleFilterChange('zona', zona)} className={`p-4 rounded-lg shadow-lg font-bold ${buttonColors[index % 3]}`}>{zona}</button>
              ))}
            </div>
          ) : (<p>No hay zonas disponibles.</p>)}
        </div>
      );
    }

    const barrioOptions = (listas.barrios[filters.zona] || []).map(b => ({ value: b, label: b }));
    const selectedBarrios = filters.barrios.map(b => ({ value: b, label: b }));

    return (
      <div className="bg-gray-50 p-4 border border-gray-200 rounded-lg">
        {/* Fila 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Palabra Clave</label>
                <input type="text" name="searchText" value={filters.searchText} onChange={(e) => handleFilterChange('searchText', e.target.value)} placeholder="Ej. quincho, polo, lote 34" className="w-full p-2 rounded-md border text-sm" />
            </div>
            <div>
                <label htmlFor="tipo" className="block text-sm font-medium text-gray-700 mb-1">Tipo de Propiedad</label>
                <select name="tipo" value={filters.tipo || ''} onChange={(e) => handleFilterChange('tipo', e.target.value)} className="w-full p-2 rounded-md border text-sm">
                    <option value="">Cualquiera</option>
                    <option value="casa">Casa</option>
                    <option value="departamento">Departamento</option>
                    <option value="lote">Lote</option>
                    <option value="local">Local Comercial</option>
                    <option value="deposito">Depósito</option>
                </select>
            </div>
        </div>

        {/* Fila 2 */}
        {barrioOptions.length > 0 && (
          <div className="mb-4">
            <label htmlFor="barrio" className="block text-sm font-medium text-gray-700 mb-1">Barrio(s)</label>
            <Select id="barrio" options={barrioOptions} value={selectedBarrios} onChange={handleMultiBarrioChange} placeholder="Seleccionar barrios..." className="text-sm" isMulti />
          </div>
        )}

        {/* Fila 3 */}
        {filters.tipo !== 'lote' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dormitorios Mínimos</label>
                    <input type="number" value={filters.bedrooms} onChange={(e) => handleFilterChange('bedrooms', e.target.value)} className="w-full p-2 rounded-md border text-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad Pasajeros</label>
                    <input type="number" value={filters.pax} onChange={(e) => handleFilterChange('pax', e.target.value)} className="w-full p-2 rounded-md border text-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Presupuesto Mínimo (USD)</label>
                    <input type="number" value={filters.minPrice} onChange={(e) => handleFilterChange('minPrice', e.target.value)} className="w-full p-2 rounded-md border text-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Presupuesto Máximo (USD)</label>
                    <input type="number" value={filters.maxPrice} onChange={(e) => handleFilterChange('maxPrice', e.target.value)} className="w-full p-2 rounded-md border text-sm" />
                </div>
            </div>
        )}

        {/* Fila 4 */}
        {filters.operacion === 'alquiler_temporal' && (
            <div className="mb-4 bg-white p-3 rounded border border-slate-100">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div>
                        <label htmlFor="selectedPeriod" className="block text-sm font-medium text-gray-700 mb-1">Temporada 2026</label>
                        <select name="selectedPeriod" value={filters.selectedPeriod} onChange={(e) => handleFilterChange('selectedPeriod', e.target.value)} disabled={showOtherDates} className="w-full p-2 rounded-md border text-sm disabled:opacity-50">
                        <option value="">Todas (Temporada 2026)</option>
                        {PERIOD_OPTIONS_2026.map(p => (<option key={p.value} value={p.value}>{p.label}</option>))}
                        </select>
                    </div>
                    <div className="flex flex-col justify-end">
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                            <input type="checkbox" checked={showOtherDates} onChange={handleShowOtherDates} className="h-4 w-4" />
                            <span className="text-sm font-bold text-gray-700">Otras fechas (Fuera de temporada)</span>
                        </label>
                        {showOtherDates && (
                            <DatePicker selectsRange={true} startDate={dateRange[0]} endDate={dateRange[1]} onChange={handleDateChange} locale="es" dateFormat="dd/MM/yyyy" placeholderText="Seleccione rango" className="w-full p-2 rounded-md border text-sm" isClearable={true} minDate={new Date()} excludeDateIntervals={EXCLUDE_DATES} />
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Fila 5 */}
        <div className="flex flex-row gap-6 pt-2">
            {filters.tipo !== 'lote' && (
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="pool" checked={filters.pool} onChange={() => handleCheckboxChange('pool')} className="h-5 w-5" />
                    <span className="text-sm font-medium text-gray-700">Con Pileta</span>
                </label>
            )}
            
            {/* Ocultar mascotas en Venta */}
            {filters.operacion !== 'venta' && filters.tipo !== 'lote' && (
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="pets" checked={filters.pets} onChange={() => handleCheckboxChange('pets')} className="h-5 w-5" />
                    <span className="text-sm font-medium text-gray-700">Acepta Mascotas</span>
                </label>
            )}
        </div>
      </div>
    );
  };

  const renderMainContent = () => {
    if (isSearching) return <Spinner />;
    if (error) return <div className="text-red-600 font-bold p-4">Error: {error}</div>;

    if (!filters.operacion) {
        return (
            <div className="text-center p-10 text-gray-500">
                <h2 className="text-xl font-bold mb-4">Bienvenido al Buscador</h2>
                <p>Seleccione una operación arriba para comenzar.</p>
                <div className="mt-8"><WelcomeCarousel /></div>
            </div>
        );
    }

    if (results.length > 0) {
        return (
            <div className="mt-8">
                <h2 className="text-xl font-bold text-mcv-gris mb-4">{propertyCount} Propiedades Encontradas</h2>
                <div className="flex justify-end mb-4">
                        <select name="sortBy" value={filters.sortBy} onChange={(e) => handleFilterChange('sortBy', e.target.value)} className="p-2 border rounded text-sm">
                            <option value="default">Ordenar por...</option>
                            <option value="price_asc">Precio: Menor a Mayor</option>
                            <option value="price_desc">Precio: Mayor a Menor</option>
                        </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {results.map(prop => (
                        <PropertyCard key={prop.property_id} property={prop} filters={filters} onContact={handleContactSingleProperty} />
                    ))}
                </div>
                <div className="flex justify-center mt-8 pb-8">
                    <button onClick={generateContactMessages} className="px-6 py-3 bg-mcv-verde text-white font-bold rounded-lg shadow-lg">Contactar Agente</button>
                </div>
            </div>
        );
    }

    if (filters.zona) return <div className="text-center p-10 bg-gray-50 rounded-lg mt-8 font-bold text-gray-500">No se encontraron propiedades. Intente ajustar los filtros.</div>;

    return null;
  };

  return (
    <div id="__next" className="min-h-screen relative">
      <Head><title>Buscador Inteligente | MCV Propiedades</title></Head>
      <ContactModal isOpen={isModalOpen} onRequestClose={() => setIsModalOpen(false)} {...contactPayload} />
      <div ref={contentRef} className="max-w-7xl mx-auto px-4 pb-20">
        <main>
          {renderFiltrosActivos()}
          {renderAsistente()} 
          {renderMainContent()}
        </main>
      </div>
    </div>
  );
}