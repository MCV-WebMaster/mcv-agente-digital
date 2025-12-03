import { useState, useEffect, useCallback, useRef } from 'react'; 
import { useRouter } from 'next/router';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';
import ActiveFilterTag from '@/components/ActiveFilterTag'; 
import DatePicker, { registerLocale } from 'react-datepicker';
import es from 'date-fns/locale/es';
import Select from 'react-select'; 
import Modal from 'react-modal';
import ContactModal from '@/components/ContactModal';
import "react-datepicker/dist/react-datepicker.css"; // Aseguramos estilos si faltaban

// Registrar idioma español
if (es) {
  registerLocale('es', es);
}

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

const ALERT_MASCOTAS_TEXT = "Solo se podrán llevar razas permitidas según el reglamento. Las mascotas deberán ser mayores de 2 años de edad. Se podrán llevar un máximo de 3 mascotas por propiedad como aclara el reglamento.";

export default function EmbedSearchPage() {
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

  // FIX DE ESTABILIDAD: Siempre inicializar como array, nunca null
  const [dateRange, setDateRange] = useState([null, null]);
  const [showOtherDates, setShowOtherDates] = useState(false); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPetAlert, setShowPetAlert] = useState(false);
  
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

  // --- PostMessage (Scroll) ---
  const sendHeightToParent = useCallback(() => {
    if (contentRef.current && window.parent) {
      const height = contentRef.current.scrollHeight;
      window.parent.postMessage({ 
        action: 'set_iframe_height', 
        height: height + 50, 
        frameId: 'mcv-asistente-iframe' 
      }, '*');
    }
  }, []);

  useEffect(() => {
    const delayedSend = setTimeout(sendHeightToParent, 100); 
    window.addEventListener('resize', sendHeightToParent);
    return () => {
        clearTimeout(delayedSend);
        window.removeEventListener('resize', sendHeightToParent);
    };
  }, [results, listas, isSearching, sendHeightToParent, showPetAlert]); 

  useEffect(() => {
    const interval = setInterval(sendHeightToParent, 1000);
    return () => clearInterval(interval);
  }, [sendHeightToParent]);

  // --- Inicialización ---
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

  // --- Carga de Filtros ---
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
        console.error("Error cargando listas de filtros:", err);
        setError(err.message);
      } finally {
        setIsLoadingFilters(false);
      }
    }
    loadFilters();
  }, [filters.operacion]);

  // --- Búsqueda ---
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
          bedrooms_or_more: currentFilters.bedrooms_or_more,
          showOtherDates: showOtherDates 
      };

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'La respuesta de la red no fue OK');
      }
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
  }, [showOtherDates]); 

  useEffect(() => {
    if (hasHydrated) {
        const handler = setTimeout(() => {
          fetchProperties(filters);
        }, 500); 
        return () => clearTimeout(handler);
    }
  }, [filters, fetchProperties, hasHydrated]);

  // --- Handler de Mascotas ---
  const handleMascotasChange = () => {
    if (!filters.pets) {
        setShowPetAlert(true);
    }
    handleCheckboxChange('pets');
  };

  // --- Contacto ---
  const getAgentNumber = (op, zona) => {
    if (op === 'venta' && zona === 'Costa Esmeralda') {
      return process.env.NEXT_PUBLIC_WHATSAPP_AGENT2_NUMBER;
    }
    return process.env.NEXT_PUBLIC_WHATSAPP_AGENT_NUMBER;
  };

  const generateContactMessages = () => {
    const targetAgentNumber = getAgentNumber(filters.operacion, filters.zona);
    let whatsappMessage, adminEmailHtml;
    
    if (results.length > 0 && results.length <= 10) {
      const propsListWsp = results.map(p => `${p.title}\n${p.url}\n`).join('\n');
      const propsListHtml = results.map(p => `<li><strong>${p.title}</strong><br><a href="${p.url}">${p.url}</a></li>`).join('');
      whatsappMessage = `Hola...! Te escribo porque vi estas propiedades que me interesan en https://mcvpropiedades.com.ar:\n\n${propsListWsp}`;
      adminEmailHtml = `<ul>${propsListHtml}</ul>`;
    } else if (results.length > 10) {
      whatsappMessage = `Hola...! Te escribo porque vi una propiedad que me interesa en https://mcvpropiedades.com.ar, me podes dar mas informacion sobre mi búsqueda? (encontré ${propertyCount} propiedades).`;
      adminEmailHtml = `<p>El cliente realizó una búsqueda que arrojó ${propertyCount} propiedades.</p>`;
    } else {
      whatsappMessage = `Hola...! Te escribo porque vi una propiedad que me interesa en https://mcvpropiedades.com.ar, me podes dar mas informacion?`;
      adminEmailHtml = `<p>El cliente hizo una consulta general (sin propiedades específicas en el filtro).</p>`;
    }
    
    setContactPayload({ 
        whatsappMessage, 
        adminEmailHtml, 
        propertyCount: results.length,
        filteredProperties: results,
        currentFilters: filters,
        targetAgentNumber: targetAgentNumber 
    });
    setIsModalOpen(true);
  };

  const handleContactSingleProperty = (property) => {
    const targetAgentNumber = getAgentNumber(filters.operacion, property.zona);
    const whatsappMessage = `Hola...! Te escribo porque vi esta propiedad en el Asistente Digital y me interesa:\n\n${property.title}\n${property.url}`;
    const adminEmailHtml = `<ul><li><strong>${property.title}</strong><br><a href="${property.url}">${property.url}</a></li></ul>`;
    setContactPayload({ 
        whatsappMessage, 
        adminEmailHtml, 
        propertyCount: 1,
        filteredProperties: [property],
        currentFilters: filters,
        targetAgentNumber: targetAgentNumber
    });
    setIsModalOpen(true);
  };
  
  // --- Handlers de Filtros ---
  const handleFilterChange = (name, value) => {
    const defaultState = {
      operacion: null, zona: null, tipo: null, barrios: [],
      pax: '', pax_or_more: false, pets: false, pool: false, bedrooms: '',
      bedrooms_or_more: false,
      minMts: '', maxMts: '', minPrice: '', maxPrice: '',
      startDate: null, endDate: null, selectedPeriod: '', sortBy: 'default', searchText: ''
    };
    
    setFilters(prev => {
      let newState = { ...prev, [name]: value };
      if (name === 'operacion') {
        newState = { ...defaultState, operacion: value };
        setDateRange([null, null]);
        setShowOtherDates(false);
      }
      if (name === 'zona') newState.barrios = []; 
      if (name === 'tipo' && value === 'lote') {
        newState = { ...newState,
          bedrooms: '', pax: '', pax_or_more: false, pets: false, pool: false,
          minMts: '', maxMts: '',
        };
      }
      
      if (name === 'selectedPeriod' && value !== '') {
        newState.startDate = null;
        newState.endDate = null;
        newState.showOtherDates = false; 
        setShowOtherDates(false);
        setDateRange([null, null]);
      }

      return newState;
    });
  };

  const handleMultiBarrioChange = (selectedOptions) => {
    const barrioValues = selectedOptions ? selectedOptions.map(option => option.value) : [];
    setFilters(prev => ({ ...prev, barrios: barrioValues }));
  };

  // FIX DE ESTABILIDAD: Handler de Fechas Seguro
  const handleDateChange = (dates) => {
    // react-datepicker puede enviar null si se limpia
    if (!dates) {
        setDateRange([null, null]);
        setFilters(prev => ({ ...prev, startDate: null, endDate: null }));
        return;
    }

    const [start, end] = dates;
    setDateRange(dates);
    
    if (start && end) {
      setFilters(prev => ({
        ...prev,
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        selectedPeriod: '', 
        showOtherDates: true,
      }));
      if (!showOtherDates) setShowOtherDates(true);
    } else {
      // Si falta alguna fecha, solo actualizamos el estado local de dateRange
      setFilters(prev => ({ ...prev, startDate: null, endDate: null }));
    }
  };

  const handleCheckboxChange = (name) => {
    setFilters(prev => ({
      ...prev,
      [name]: !prev[name],
      ...(name === 'bedrooms_or_more' && { bedrooms_or_more: !prev.bedrooms_or_more }),
    }));
  };
  
  const handleToggleOtherDates = () => {
    const newState = !showOtherDates;
    setShowOtherDates(newState);
    
    setFilters(prev => {
        const newFilters = { ...prev, showOtherDates: newState };
        if (newState) {
            newFilters.selectedPeriod = '';
            newFilters.startDate = null;
            newFilters.endDate = null;
            setDateRange([null, null]);
        } else {
             newFilters.startDate = null;
             newFilters.endDate = null;
             setDateRange([null, null]);
        }
        return newFilters;
    });
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

  // --- RENDERIZADO DEL ASISTENTE ---
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
            <button onClick={() => handleFilterChange('operacion', 'venta')} className="p-4 bg-mcv-azul text-white rounded-lg shadow-lg hover:bg-opacity-80 transition-all text-lg font-bold">
              Comprar
            </button>
            <button onClick={() => handleFilterChange('operacion', 'alquiler_temporal')} className="p-4 bg-mcv-verde text-white rounded-lg shadow-lg hover:bg-opacity-80 transition-all text-lg font-bold">
              Alquiler Temporal
            </button>
            <button onClick={() => handleFilterChange('operacion', 'alquiler_anual')} className="p-4 bg-mcv-gris text-white rounded-lg shadow-lg hover:bg-opacity-80 transition-all text-lg font-bold">
              Alquiler Anual
            </button>
          </div>
        </div>
      );
    }
    
    if (isLoadingFilters) {
      return <Spinner />;
    }
    
    if (error && !listas.zonas.length) {
       return (
         <div className="text-center text-red-600 bg-red-100 p-4 rounded-lg">
           <p className="font-bold">{error}</p>
         </div>
      );
    }

    if (!filters.zona) {
      const buttonColors = [
        'bg-mcv-azul text-white hover:bg-opacity-80',
        'bg-mcv-verde text-white hover:bg-opacity-80',
        'bg-mcv-gris text-white hover:bg-opacity-80',
      ];
      return (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">¿En qué zona?</h2>
          {listas.zonas.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {listas.zonas.map((zona, index) => (
                <button 
                  key={zona} 
                  onClick={() => handleFilterChange('zona', zona)} 
                  className={`p-4 rounded-lg shadow-lg transition-all text-lg font-bold ${buttonColors[index % buttonColors.length]}`}
                >
                  {zona}
                </button>
              ))}
            </div>
          ) : (
             <p className="text-gray-500">No hay zonas compatibles con "{filters.operacion.replace('_', ' ')}".</p>
          )}
        </div>
      );
    }

    const barrioOptions = (listas.barrios[filters.zona] || []).map(b => ({ value: b, label: b }));
    const selectedBarrios = filters.barrios.map(b => ({ value: b, label: b }));
    
    const isCommercialType = ['lote', 'local', 'deposito'].includes(filters.tipo);

    return (
      <div className="bg-gray-50 p-4 border border-gray-200 rounded-lg">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-mcv-gris">Personalizá tu búsqueda:</h2>
          
          <div className="grid grid-cols-4 gap-4 w-full">
            <div className="col-span-2">
                <input
                    type="text" name="searchText" value={filters.searchText}
                    onChange={(e) => handleFilterChange('searchText', e.target.value)}
                    placeholder="Buscar por palabra clave, ejemplo: Lavavajilla"
                    className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
                />
            </div>
            <div className="col-span-2">
                <select
                    id="tipo" name="tipo" value={filters.tipo || ''}
                    onChange={(e) => handleFilterChange('tipo', e.target.value)}
                    className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
                >
                    <option value="">Tipo</option>
                    <option value="casa">Casa</option>
                    <option value="departamento">Departamento</option>
                    {filters.operacion === 'venta' && <option value="lote">Lote</option>}
                    {filters.operacion === 'venta' && filters.zona === 'Costa Esmeralda' && <option value="local">Local</option>}
                    {filters.operacion === 'venta' && filters.zona === 'GBA Sur' && (
                        <>
                            <option value="local">Local</option>
                            <option value="deposito">Depósito</option>
                        </>
                    )}
                </select>
            </div>
          </div>
        </div>
        
        {barrioOptions.length > 0 && (
            <div className="mb-4">
                <label htmlFor="barrio" className="block text-sm font-medium text-gray-700 mb-1">Barrio(s)</label>
                <Select
                    id="barrio" instanceId="barrio-select" options={barrioOptions}
                    value={selectedBarrios} onChange={handleMultiBarrioChange}
                    placeholder="Todos los barrios seleccionados, seleccionar uno o varios barrios para mejorar la búsqueda"
                    className="text-sm" isMulti
                />
            </div>
        )}

        <div className="grid grid-cols-4 gap-4 mb-4">
          
          <div className={!isCommercialType ? 'col-span-1' : 'hidden'}>
            <label htmlFor="bedrooms" className="block text-sm font-medium text-gray-700 mb-1">Dorm. (mín)</label>
            <input
              type="number" id="bedrooms" name="bedrooms" min="0"
              value={filters.bedrooms}
              onChange={(e) => handleFilterChange('bedrooms', e.target.value)}
              placeholder="Ej: 3"
              className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
            />
            <label className="flex items-center gap-1 cursor-pointer mt-1">
              <input
                type="checkbox" name="bedrooms_or_more"
                checked={filters.bedrooms_or_more}
                onChange={() => handleCheckboxChange('bedrooms_or_more')}
                className="h-3 w-3 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
              />
              <span className="text-xs text-gray-600">o más</span>
            </label>
          </div>

          {filters.operacion !== 'venta' && !isCommercialType && (
            <div className="col-span-1">
              <label htmlFor="pax" className="block text-sm font-medium text-gray-700 mb-1">Personas</label>
              <input
                type="number" id="pax" name="pax" min="0"
                value={filters.pax}
                onChange={(e) => handleFilterChange('pax', e.target.value)}
                placeholder="Ej: 6"
                className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
              />
              <label className="flex items-center gap-1 cursor-pointer mt-1">
                <input
                  type="checkbox" name="pax_or_more"
                  checked={filters.pax_or_more}
                  onChange={() => handleCheckboxChange('pax_or_more')}
                  className="h-3 w-3 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
                />
                <span className="text-xs text-gray-600">o más</span>
              </label>
            </div>
          )}
          
          <div className={(filters.operacion === 'venta' && isCommercialType) ? 'col-span-2' : 'col-span-1'}>
            <label htmlFor="minPrice" className="block text-sm font-medium text-gray-700 mb-1">Precio (mín)</label>
            <input 
              type="number" id="minPrice" name="minPrice"
              placeholder={pricePlaceholder[filters.operacion] || 'Ej: 1000'}
              value={filters.minPrice} onChange={(e) => handleFilterChange('minPrice', e.target.value)}
              className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
            />
          </div>
          <div className={(filters.operacion === 'venta' && isCommercialType) ? 'col-span-2' : 'col-span-1'}>
            <label htmlFor="maxPrice" className="block text-sm font-medium text-gray-700 mb-1">Precio (máx)</label>
            <input 
              type="number" id="maxPrice" name="maxPrice"
              placeholder="Sin límite"
              value={filters.maxPrice} onChange={(e) => handleFilterChange('maxPrice', e.target.value)}
              className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
            />
          </div>
        </div>

        {filters.operacion === 'alquiler_temporal' && (
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="col-span-2">
                <label htmlFor="selectedPeriod" className="block text-sm font-medium text-gray-700 mb-1">Temporada 2026</label>
                <select
                  id="selectedPeriod" name="selectedPeriod"
                  value={filters.selectedPeriod}
                  onChange={(e) => handleFilterChange('selectedPeriod', e.target.value)}
                  disabled={showOtherDates} 
                  className={`w-full p-2 rounded-md bg-white border border-gray-300 text-sm ${showOtherDates ? 'bg-gray-200 cursor-not-allowed' : ''}`}
                >
                  <option value="">Todas (Temporada 2026)</option>
                  {PERIOD_OPTIONS_2026.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2 flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-3">
                  <input
                    type="checkbox" name="showOtherDates"
                    checked={showOtherDates}
                    onChange={handleToggleOtherDates}
                    className="h-4 w-4 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
                  />
                  <span className="text-sm text-gray-700">Otras fechas (Fuera de temporada)</span>
                </label>
              </div>

              {showOtherDates && (
                <div className="col-span-4">
                  <label htmlFor="dateRange" className="block text-sm font-medium text-gray-700 mb-1">Rango de Fechas Específico</label>
                  <DatePicker
                    id="dateRange" selectsRange={true} startDate={dateRange[0]} endDate={dateRange[1]}
                    onChange={handleDateChange} locale="es" dateFormat="dd/MM/yyyy"
                    placeholderText="Seleccione un rango" className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
                    isClearable={true} minDate={new Date()} excludeDateIntervals={EXCLUDE_DATES}
                  />
                </div>
              )}
            </div>
          )}

          {!isCommercialType && (
            <div className="flex flex-row gap-4 pt-2 pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" name="pool" checked={filters.pool}
                  onChange={() => handleCheckboxChange('pool')}
                  className="h-4 w-4 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
                />
                <span className="text-sm text-gray-700">Con Pileta</span>
              </label>
              
              {filters.operacion !== 'venta' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox" name="pets" checked={filters.pets}
                    onChange={handleMascotasChange}
                    className="h-4 w-4 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
                  />
                  <span className="text-sm text-gray-700">Acepta Mascotas</span>
                </label>
              )}
            </div>
          )}
      </div>
    );
  };

  const renderMainContent = () => {
    if (isSearching) {
        return <Spinner />;
    }
    
    if (error) {
        return (
            <div className="text-center text-red-600 bg-red-100 p-4 rounded-lg mt-8">
                <p className="font-bold">Error al cargar: {error}</p>
            </div>
        );
    }

    if (!filters.operacion) {
        return (
            <div className="text-center text-gray-500 p-10 mt-8">
                <h2 className="text-xl font-bold mb-4">Bienvenido al Buscador</h2>
                <p>Seleccione una operación arriba para comenzar.</p>
            </div>
        );
    }

    if (results.length > 0) {
        return (
            <div className="mt-8">
                <h2 className="text-xl font-bold text-mcv-gris mb-4">
                    {propertyCount} Propiedades Encontradas
                </h2>
                
                {results.length > 1 && (
                    <div className="flex justify-end mb-4">
                        <select
                            name="sortBy"
                            value={filters.sortBy}
                            onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                            className="p-2 rounded-md bg-white border border-gray-300 text-sm"
                        >
                            <option value="default">Ordenar por...</option>
                            <option value="price_asc">Precio: más bajo primero</option>
                            <option value="price_desc">Precio: más alto primero</option>
                        </select>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {results.map(prop => (
                        <PropertyCard key={prop.property_id} property={prop} filters={filters} onContact={handleContactSingleProperty} />
                    ))}
                </div>
                
                <div className="flex justify-center mt-8 pb-8">
                    <button
                        onClick={generateContactMessages}
                        className="px-6 py-3 bg-mcv-verde text-white font-bold rounded-lg shadow-lg hover:bg-opacity-80 transition-all"
                    >
                        Contactar con un Agente por estas opciones
                    </button>
                </div>
            </div>
        );
    }

    if (filters.zona || filters.searchText || filters.barrios.length > 0) {
        return (
            <div className="text-center text-gray-500 p-10 bg-gray-50 rounded-lg mt-8">
                <p className="font-bold">No se encontraron propiedades</p>
                <p>Intente ajustar sus filtros de búsqueda.</p>
            </div>
        );
    }

    return null;
  };

  const PetAlertModal = () => {
      if (!showPetAlert) return null;
      
      return (
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-start justify-center pt-20 p-4">
            <div className="bg-white p-6 rounded-lg shadow-2xl max-w-md text-center border-l-4 border-yellow-400 relative animate-fade-in-down">
                <div className="flex justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 className="text-xl font-bold text-yellow-600 mb-2">Política de Mascotas</h3>
                <p className="text-gray-700 mb-6 text-sm leading-relaxed font-medium">
                    {ALERT_MASCOTAS_TEXT}
                </p>
                <button
                    onClick={() => setShowPetAlert(false)}
                    className="px-6 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors font-bold w-full"
                >
                    🐾 Entiendo 🐾
                </button>
            </div>
        </div>
      );
  };

  return (
    <div id="__next" className="min-h-screen">
      
      <ContactModal
        isOpen={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
        whatsappMessage={contactPayload.whatsappMessage}
        adminEmailHtml={contactPayload.adminEmailHtml}
        propertyCount={contactPayload.propertyCount}
        filteredProperties={contactPayload.filteredProperties} 
        currentFilters={contactPayload.currentFilters}
      />

      <PetAlertModal />
      
      <div ref={contentRef} className="max-w-7xl mx-auto">
        <main>
          {renderFiltrosActivos()}
          {renderAsistente()} 
          {renderMainContent()}
        </main>
      </div>
    </div>
  );
}