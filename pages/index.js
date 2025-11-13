import { useState, useEffect, useCallback } from 'react';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';
import ActiveFilterTag from '@/components/ActiveFilterTag';
import DatePicker, { registerLocale } from 'react-datepicker';
import es from 'date-fns/locale/es';
registerLocale('es', es);

// Fechas de la Temporada 2026
const SEASON_START_DATE = '2025-12-19';

export default function SearchPage() {
  
  // --- ESTADO PRINCIPAL ---
  const [filters, setFilters] = useState({
    operacion: null,
    zona: null,
    tipo: null,
    barrio: null,
    pax: '',
    pax_or_more: false, // ¡NUEVO!
    pets: false,
    pool: false,
    bedrooms: '',
    minMts: '',
    maxMts: '',
    minPrice: '',
    maxPrice: '',
    startDate: null,
    endDate: null,
    sortBy: 'default', // ¡NUEVO!
  });

  const [dateRange, setDateRange] = useState([null, null]);

  // --- ESTADO DE LÓGICA ---
  const [results, setResults] = useState([]);
  const [propertyCount, setPropertyCount] = useState(0); // ¡NUEVO!
  const [listas, setListas] = useState({ zonas: [], barrios: {} });
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  const [hasLoadedFilters, setHasLoadedFilters] = useState(false);

  const pricePlaceholder = {
    venta: "Ej: 300000",
    alquiler_temporal: "Ej: 1500",
    alquiler_anual: "Ej: 1000"
  };

  // --- 1. CARGAR LISTAS DE FILTROS ---
  useEffect(() => {
    async function loadFilters() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/get-filters');
        const data = await res.json();
        if (data.status === 'OK' && Object.keys(data.filtros).length > 0) {
          setListas({ 
            zonas: Object.keys(data.filtros).sort().reverse(), // ¡NUEVO! Z-A
            barrios: data.filtros
          });
          setHasLoadedFilters(true);
        } else {
          throw new Error("No se encontraron filtros. Revise la data.");
        }
      } catch (err) {
        console.error("Error cargando listas de filtros:", err);
        setError("No se pudieron cargar los filtros. Intente recargar la página.");
      } finally {
        setIsLoading(false);
      }
    }
    loadFilters();
  }, []);

  // --- 2. LÓGICA DE BÚSQUEDA "EN VIVO" ---
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
        setPropertyCount(data.count); // ¡NUEVO!
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
    if (hasLoadedFilters) {
      const handler = setTimeout(() => {
        fetchProperties(filters);
      }, 500); 
      return () => clearTimeout(handler);
    }
  }, [filters, hasLoadedFilters, fetchProperties]);

  // --- 3. MANEJADORES DE EVENTOS ---
  const handleFilterChange = (name, value) => {
    const defaultState = {
      operacion: null, zona: null, tipo: null, barrio: null,
      pax: '', pax_or_more: false, pets: false, pool: false, bedrooms: '',
      minMts: '', maxMts: '', minPrice: '', maxPrice: '',
      startDate: null, endDate: null, sortBy: 'default'
    };
    
    setFilters(prev => {
      let newState = { ...prev, [name]: value };
      if (name === 'operacion') {
        newState = { ...defaultState, operacion: value };
        setDateRange([null, null]);
      }
      if (name === 'zona') newState.barrio = null;
      if (name === 'tipo' && value === 'lote') {
        newState = { ...newState,
          bedrooms: '', pax: '', pax_or_more: false, pets: false, pool: false,
          minMts: '', maxMts: '',
        };
      }
      return newState;
    });
  };

  const handleDateChange = (dates) => {
    const [start, end] = dates;
    setDateRange(dates);
    if (start && end) {
      setFilters(prev => ({
        ...prev,
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
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

  const removeFilter = (name) => {
    const defaultFilters = {
      operacion: null, zona: null, tipo: null, barrio: null,
      pax: '', pax_or_more: false, pets: false, pool: false, bedrooms: '',
      minMts: '', maxMts: '', minPrice: '', maxPrice: '',
      startDate: null, endDate: null, sortBy: 'default'
    };
    if (name === 'operacion') {
      setFilters(defaultFilters);
      setDateRange([null, null]);
    } else if (name === 'zona') {
      setFilters(prev => ({ ...prev, zona: null, barrio: null }));
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
      {filters.barrio && <ActiveFilterTag label={`Barrio: ${filters.barrio}`} onRemove={() => removeFilter('barrio')} />}
    </div>
  );

  const renderAsistente = () => {
    if (isLoading) {
      return <div className="text-center p-10"><Spinner /></div>;
    }
    if (error && !hasLoadedFilters) {
      return (
         <div className="text-center text-red-600 bg-red-100 p-4 rounded-lg">
           <p className="font-bold">{error}</p>
         </div>
      );
    }
    
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

    if (!filters.zona) {
      return (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">¿En qué zona?</h2>
          {/* ¡NUEVO! Botones de Zona Ordenados Z-A */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {listas.zonas.map(zona => (
              <button key={zona} onClick={() => handleFilterChange('zona', zona)} className="p-4 bg-gray-100 border border-gray-300 text-mcv-gris rounded-lg shadow-lg hover:bg-gray-200 transition-all text-lg font-bold">
                {zona}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Paso 3: Filtros Específicos
    return (
      <div className="bg-gray-50 p-4 border border-gray-200 rounded-lg">
        <h2 className="text-lg font-bold mb-4 text-mcv-gris">Afiná tu búsqueda:</h2>
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

          {/* ¡CORREGIDO! Ahora 'listas.barrios[filters.zona]' existe */}
          {listas.barrios[filters.zona] && listas.barrios[filters.zona].length > 0 && (
            <div>
              <label htmlFor="barrio" className="block text-sm font-medium text-gray-700 mb-1">Barrio</label>
              <select
                id="barrio" name="barrio"
                value={filters.barrio || ''}
                onChange={(e) => handleFilterChange('barrio', e.target.value)}
                className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
              >
                <option value="">Todos</option>
                {listas.barrios[filters.zona].map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

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

          {/* --- ¡NUEVA LÓGICA DE PAX! --- */}
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
                minDate={new Date()} // No se puede seleccionar antes de hoy
              />
            </div>
          )}

          {filters.tipo !== 'lote' && (
            <div className="flex flex-col gap-2 pt-6 col-span-2 md:col-span-1">
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
  
  // --- 5. RENDERIZADO PRINCIPAL ---
  return (
    <div className="min-h-screen bg-white text-gray-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        
        <header className="flex flex-col md:flex-row items-start justify-between mb-8 pb-4 border-b border-gray-200">
          
          <div className="w-full md:w-1/4">
            <img 
              src="/logo_mcv_rectangular.png" 
              alt="Logo MCV Propiedades" 
              className="w-48 md:w-56"
            />
          </div>
          
          <div className="w-full md:w-1/2 px-0 md:px-4 mt-4 md:mt-0">
            <div className="mb-4">{renderFiltrosActivos()}</div>
            {renderAsistente()} 
          </div>
          
          <div className="w-full md:w-1/4 text-left md:text-right mt-4 md:mt-0">
            <h1 className="text-2xl md:text-3xl font-bold text-mcv-azul">Agente Digital</h1>
            <p className="text-base text-gray-500">Encuentre su propiedad ideal</p>
            {/* --- ¡NUEVO! CONTADOR --- */}
            {!isSearching && hasLoadedFilters && filters.operacion && (
              <h2 className="text-lg font-bold text-mcv-verde mt-2">
                {propertyCount} {propertyCount === 1 ? 'Propiedad Encontrada' : 'Propiedades Encontradas'}
              </h2>
            )}
          </div>
        </header>

        <main>
          {/* --- ¡NUEVO! BOTÓN DE ORDENAR --- */}
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
              <p className="font-bold">Error al cargar propiedades: {error}</p>
            </div>
          ) : (filters.operacion && hasLoadedFilters) ? (
            results.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* ¡NUEVO! Pasamos los 'filters' a la tarjeta */}
                {results.map(prop => (
                  <PropertyCard key={prop.property_id} property={prop} filters={filters} />
                ))}
              </div>
            ) : (
              // No mostrar "0 resultados" si aún no se eligió zona (Paso 2)
              (filters.zona || isSearching) && (
                <div className="text-center text-gray-500 p-10 bg-gray-50 rounded-lg">
                  <p className="text-xl font-bold">No se encontraron propiedades</p>
                  <p>Intente ajustar sus filtros de búsqueda.</p>
                </div>
              )
            )
          ) : (
             !isLoading && (
              <div className="text-center text-gray-500 p-10">
                <p className="text-xl font-bold">Bienvenido</p>
                <p>Use el asistente de arriba para encontrar su propiedad ideal.</p>
              </div>
             )
          )}
        </main>

      </div>
    </div>
  );
}