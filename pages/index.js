import { useState, useEffect, useCallback } from 'react';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';
import ActiveFilterTag from '@/components/ActiveFilterTag';
import DatePicker, { registerLocale } from 'react-datepicker';
import es from 'date-fns/locale/es';
import Select from 'react-select'; 
import Modal from 'react-modal';
import ContactModal from '@/components/ContactModal';
import FloatingButton from '@/components/FloatingButton';
import WelcomeCarousel from '@/components/WelcomeCarousel';
import Footer from '@/components/Footer';
registerLocale('es', es);

Modal.setAppElement('#__next');

const PERIOD_OPTIONS_2026 = [
  { value: 'Diciembre 2da Quincena', label: 'Diciembre 2da Quincena (15/12 al 31/12)' },
  { value: 'Navidad', label: 'Navidad (19/12 al 26/12)' },
  { value: 'Año Nuevo', label: 'Año Nuevo (26/12 al 02/01)' },
  { value: 'Enero 1ra Quincena', label: 'Enero 1ra Quincena (02/01 al 15/01)' },
  { value: 'Enero 2da Quincena', label: 'Enero 2da Quincena (16/01 al 31/01)' },
  { value: 'Febrero 1ra Quincena', label: 'Febrero 1ra Quincena (01/02 al 17/02)' },
  { value: 'Febrero 2da Quincena', label: 'Febrero 2da Quincena (18/02 al 01/03)' },
];

const EXCLUDE_DATES = [
  { start: new Date('2025-12-19'), end: new Date('2026-03-01') }
];

export default function SearchPage() {
  
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
    propertyCount: 0
  });
  const [results, setResults] = useState([]);
  const [propertyCount, setPropertyCount] = useState(0);
  const [listas, setListas] = useState({ zonas: [], barrios: {} });
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);

  const pricePlaceholder = {
    venta: "Ej: 300000",
    alquiler_temporal: "Ej: 1500",
    alquiler_anual: "Ej: 1000"
  };

  useEffect(() => {
    async function loadFilters() {
      if (!filters.operacion) {
        setListas({ zonas: [], barrios: {} });
        return;
      }
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

  const fetchProperties = useCallback(async (currentFilters) => {
    if (!currentFilters.operacion) {
      setResults([]); 
      setPropertyCount(0);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setError(null);
    setResults([]);
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentFilters),
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
      console.error('Error al buscar propiedades:', err);
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchProperties(filters);
    }, 500); 
    return () => clearTimeout(handler);
  }, [filters, fetchProperties]);

  // --- 3. MANEJADORES DE EVENTOS ---
  
  // Contacto General (Botón Grande)
  const generateContactMessages = () => {
    let whatsappMessage, adminEmailHtml;
    const greeting = "Hola...! Te escribo porque vi una propiedad que me interesa en https://mcvpropiedades.com.ar";

    if (results.length > 0 && results.length <= 10) {
      const propsListWsp = results.map(p => `${p.title}\n${p.url}\n`).join('\n');
      const propsListHtml = results.map(p => `<li><strong>${p.title}</strong><br><a href="${p.url}">${p.url}</a></li>`).join('');
      
      whatsappMessage = `Hola...! Te escribo porque vi estas propiedades que me interesan en https://mcvpropiedades.com.ar:\n\n${propsListWsp}`;
      adminEmailHtml = `<ul>${propsListHtml}</ul>`;
      
    } else if (results.length > 10) {
      whatsappMessage = `${greeting}, me podes dar mas informacion sobre mi búsqueda? (encontré ${propertyCount} propiedades).`;
      adminEmailHtml = `<p>El cliente realizó una búsqueda que arrojó ${propertyCount} propiedades.</p>`;
    } else {
      whatsappMessage = `${greeting}, me podes dar mas informacion?`;
      adminEmailHtml = `<p>El cliente hizo una consulta general (sin propiedades específicas en el filtro).</p>`;
    }
    
    setContactPayload({
      whatsappMessage,
      adminEmailHtml,
      propertyCount: results.length
    });
    setIsModalOpen(true);
  };

  // ¡NUEVO! Contacto Individual (Botón de Tarjeta)
  const handleContactSingleProperty = (property) => {
    const whatsappMessage = `Hola...! Te escribo porque vi esta propiedad que me interesa en https://mcvpropiedades.com.ar:\n\n${property.title}\n${property.url}`;
    const adminEmailHtml = `<ul><li><strong>${property.title}</strong><br><a href="${property.url}">${property.url}</a></li></ul>`;

    setContactPayload({
      whatsappMessage,
      adminEmailHtml,
      propertyCount: 1
    });
    setIsModalOpen(true);
  };
  
  const handleFilterChange = (name, value) => {
    const defaultState = {
      operacion: null, zona: null, tipo: null, barrios: [],
      pax: '', pax_or_more: false, pets: false, pool: false, bedrooms: '',
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
      if (name === 'selectedPeriod') {
        newState.startDate = null;
        newState.endDate = null;
        setDateRange([null, null]);
      }
      return newState;
    });
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

  const handleCheckboxChange = (name) => {
    setFilters(prev => ({
      ...prev,
      [name]: !prev[name],
    }));
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

  // --- 4. RENDERIZADO DEL ASISTENTE ---
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
      return <div className="text-center p-10"><Spinner /></div>;
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

    return (
      <div className="bg-gray-50 p-4 border border-gray-200 rounded-lg">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-mcv-gris">Afiná tu búsqueda:</h2>
          <div className="w-full md:w-1/2 mt-2 md:mt-0">
            <input
              type="text"
              name="searchText"
              value={filters.searchText}
              onChange={(e) => handleFilterChange('searchText', e.target.value)}
              placeholder="Buscar por palabra clave (ej. quincho, polo)"
              className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
            />
          </div>
        </div>
        
        {barrioOptions.length > 0 && (
          <div className="mb-4">
            <label htmlFor="barrio" className="block text-sm font-medium text-gray-700 mb-1">Barrio(s)</label>
            <Select
              id="barrio"
              instanceId="barrio-select"
              isMulti
              options={barrioOptions}
              value={selectedBarrios}
              onChange={handleMultiBarrioChange}
              placeholder="Seleccione uno o varios barrios..."
              className="text-sm"
            />
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          
          <div>
            <label htmlFor="tipo" className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              id="tipo" name="tipo"
              value={filters.tipo || ''}
              onChange={(e) => handleFilterChange('tipo', e.target.value)}
              className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
            >
              <option value="">Cualquiera</option>
              <option value="casa">Casa</option>
              <option value="departamento">Departamento</option>
              {filters.operacion === 'venta' && <option value="lote">Lote</option>}
            </select>
          </div>

          {filters.tipo !== 'lote' && (
            <div>
              <label htmlFor="bedrooms" className="block text-sm font-medium text-gray-700 mb-1">Dorm. (mín)</label>
              <input
                type="number" id="bedrooms" name="bedrooms" min="0"
                value={filters.bedrooms}
                onChange={(e) => handleFilterChange('bedrooms', e.target.value)}
                placeholder="Ej: 3"
                className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
              />
            </div>
          )}

          {filters.operacion !== 'venta' && filters.tipo !== 'lote' && (
            <div className="col-span-2 md:col-span-1">
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
          
          <div>
            <label htmlFor="minPrice" className="block text-sm font-medium text-gray-700 mb-1">Precio (mín)</label>
            <input 
              type="number" id="minPrice" name="minPrice"
              placeholder={pricePlaceholder[filters.operacion] || 'Ej: 1000'}
              value={filters.minPrice} onChange={(e) => handleFilterChange('minPrice', e.target.value)}
              className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
            />
          </div>
          <div>
            <label htmlFor="maxPrice" className="block text-sm font-medium text-gray-700 mb-1">Precio (máx)</label>
            <input 
              type="number" id="maxPrice" name="maxPrice"
              placeholder="Sin límite"
              value={filters.maxPrice} onChange={(e) => handleFilterChange('maxPrice', e.target.value)}
              className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
            />
          </div>

          {filters.operacion !== 'alquiler_temporal' && filters.tipo !== 'lote' && (
            <>
              <div>
                <label htmlFor="minMts" className="block text-sm font-medium text-gray-700 mb-1">Mts² (mín)</label>
                <input 
                  type="number" id="minMts" name="minMts"
                  value={filters.minMts} onChange={(e) => handleFilterChange('minMts', e.target.value)}
                  className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
                />
              </div>
              <div>
                <label htmlFor="maxMts" className="block text-sm font-medium text-gray-700 mb-1">Mts² (máx)</label>
                <input 
                  type="number" id="maxMts" name="maxMts"
                  value={filters.maxMts} onChange={(e) => handleFilterChange('maxMts', e.target.value)}
                  className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
                />
              </div>
            </>
          )}

          {filters.operacion === 'alquiler_temporal' && (
            <>
              <div className="col-span-2">
                <label htmlFor="selectedPeriod" className="block text-sm font-medium text-gray-700 mb-1">Temporada 2026</label>
                <select
                  id="selectedPeriod" name="selectedPeriod"
                  value={filters.selectedPeriod}
                  onChange={(e) => handleFilterChange('selectedPeriod', e.target.value)}
                  disabled={showOtherDates}
                  className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
                >
                  <option value="">Todas (Temporada 2026)</option>
                  {PERIOD_OPTIONS_2026.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2 flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox" name="showOtherDates"
                    checked={showOtherDates}
                    onChange={handleShowOtherDates}
                    className="h-4 w-4 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
                  />
                  <span className="text-sm text-gray-700">Otras fechas (Fuera de temporada)</span>
                </label>
              </div>

              {showOtherDates && (
                <div className="col-span-2">
                  <label htmlFor="dateRange" className="block text-sm font-medium text-gray-700 mb-1">Rango de Fechas</label>
                  <DatePicker
                    id="dateRange"
                    selectsRange={true}
                    startDate={dateRange[0]}
                    endDate={dateRange[1]}
                    onChange={handleDateChange}
                    locale="es"
                    dateFormat="dd/MM/yyyy"
                    placeholderText="Seleccione un rango"
                    className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
                    isClearable={true}
                    minDate={new Date()}
                    excludeDateIntervals={EXCLUDE_DATES}
                  />
                </div>
              )}
            </>
          )}

          {filters.tipo !== 'lote' && (
            <div className="col-span-2 flex flex-row gap-4 pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" name="pool"
                  checked={filters.pool}
                  onChange={() => handleCheckboxChange('pool')}
                  className="h-4 w-4 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
                />
                <span className="text-sm text-gray-700">Con Pileta</span>
              </label>
              
              {filters.operacion !== 'venta' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox" name="pets"
                    checked={filters.pets}
                    onChange={() => handleCheckboxChange('pets')}
                    className="h-4 w-4 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
                  />
                  <span className="text-sm text-gray-700">Acepta Mascotas</span>
                </label>
              )}
            </div>
          )}

        </div>
      </div>
    );
  };
  
  return (
    <div id="__next">
      <div className="min-h-screen bg-white text-gray-800">
        
        <ContactModal
          isOpen={isModalOpen}
          onRequestClose={() => setIsModalOpen(false)}
          whatsappMessage={contactPayload.whatsappMessage}
          adminEmailHtml={contactPayload.adminEmailHtml}
          propertyCount={contactPayload.propertyCount}
        />
        
        <FloatingButton onClick={generateContactMessages} />
        
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          
          <header className="flex flex-col md:flex-row items-start justify-between mb-8 pb-4 border-b border-gray-200">
            
            <div className="w-full md:w-1/4">
              <a href="/" aria-label="Ir al inicio">
                <img 
                  src="/logo_mcv_rectangular.png" 
                  alt="Logo MCV Propiedades" 
                  className="w-48 md:w-56"
                />
              </a>
            </div>
            
            <div className="w-full md:w-1/2 px-0 md:px-4 mt-4 md:mt-0">
              <div className="mb-4">{renderFiltrosActivos()}</div>
              {renderAsistente()} 
            </div>
            
            <div className="w-full md:w-1/4 text-left md:text-right mt-4 md:mt-0">
              <h1 className="text-2xl md:text-3xl font-bold text-mcv-azul">Asistente Digital</h1>
              <p className="text-base text-gray-500">Encuentre su propiedad ideal</p>
              {!isSearching && filters.operacion && (
                <h2 className="text-lg font-bold text-mcv-verde mt-2">
                  {propertyCount} {propertyCount === 1 ? 'Propiedad Encontrada' : 'Propiedades Encontradas'}
                </h2>
              )}
              {!isSearching && results.length > 0 && (
                <button
                  onClick={generateContactMessages}
                  className="mt-4 px-4 py-2 bg-mcv-verde text-white font-bold rounded-lg shadow-lg hover:bg-opacity-80 transition-all"
                >
                  Contactar con un Agente
                </button>
              )}
            </div>
          </header>

          <main>
            {!isSearching && results.length > 1 && (
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

            {isSearching ? (
              <Spinner />
            ) : error ? (
              <div className="text-center text-red-600 bg-red-100 p-4 rounded-lg">
                <p className="font-bold">Error al cargar: {error}</p>
              </div>
            ) : (filters.operacion) ? (
              results.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {results.map(prop => (
                    <PropertyCard key={prop.property_id} property={prop} filters={filters} onContact={handleContactSingleProperty} /> // ¡AQUÍ PASAMOS LA PROP!
                  ))}
                </div>
              ) : (
                (filters.zona || isSearching || filters.searchText) && (
                  <div className="text-center text-gray-500 p-10 bg-gray-50 rounded-lg">
                    <p className="text-xl font-bold">No se encontraron propiedades</p>
                    <p>Intente ajustar sus filtros de búsqueda.</p>
                  </div>
                )
              )
            ) : (
               !isLoadingFilters && !isSearching && (
                <div className="text-center text-gray-500 p-10">
                  <p className="text-xl font-bold">Bienvenido</p>
                  <p className="mb-8">Use el asistente de arriba para encontrar su propiedad ideal.</p>
                  <WelcomeCarousel />
                </div>
               )
            )}
          </main>

        </div>
        
        <Footer />
      </div>
    </div>
  );
}