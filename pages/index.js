import { useState, useEffect, useCallback } from 'react';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';
import ActiveFilterTag from '@/components/ActiveFilterTag';

export default function SearchPage() {
  
  // --- ESTADO PRINCIPAL ---
  const [filters, setFilters] = useState({
    operacion: null, // Inicia en null
    zona: null,
    tipo: null,
    barrio: null,
    pax: '',
    pets: false,
    pool: false,
    bedrooms: '',
    minMts: '',
    maxMts: '',
    minPrice: '',
    maxPrice: '',
  });

  // --- ESTADO DE LÓGICA ---
  const [results, setResults] = useState([]);
  const [listas, setListas] = useState({ zonas: [], barrios: {} });
  const [isLoading, setIsLoading] = useState(true); // Carga inicial de filtros
  const [isSearching, setIsSearching] = useState(false); // Carga de propiedades
  const [error, setError] = useState(null);
  const [hasLoadedFilters, setHasLoadedFilters] = useState(false); // Controla el flujo

  // Mapeo para placeholders de precio
  const pricePlaceholder = {
    venta: "Ej: 300000",
    alquiler_temporal: "Ej: 1500",
    alquiler_anual: "Ej: 1000"
  };

  // --- 1. CARGAR LISTAS DE FILTROS (Zonas y Barrios) ---
  useEffect(() => {
    async function loadFilters() {
      setIsLoading(true); // Inicia la carga general
      try {
        const res = await fetch('/api/get-filters');
        const data = await res.json();
        if (data.status === 'OK') {
          setListas({ 
            zonas: Object.keys(data.filtros).sort(),
            barrios: data.filtros
          });
          setHasLoadedFilters(true); // ¡Éxito!
        } else {
          throw new Error("Error al cargar los filtros desde la API.");
        }
      } catch (err) {
        console.error("Error cargando listas de filtros:", err);
        setError("No se pudieron cargar los filtros. Intente recargar la página.");
      } finally {
        setIsLoading(false); // Termina la carga general
      }
    }
    loadFilters();
  }, []); // El array vacío [] asegura que solo se ejecute 1 vez

  // --- 2. LÓGICA DE BÚSQUEDA "EN VIVO" ---
  const fetchProperties = useCallback(async (currentFilters) => {
    // No buscar si los filtros principales no están seteados
    if (!currentFilters.operacion || !currentFilters.zona) {
      setResults([]); // Limpiar resultados si se resetea la zona/operación
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    setError(null);

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

  // useEffect "vigila" los filtros. Si cambian, llama a fetchProperties()
  useEffect(() => {
    // Solo buscar si los filtros iniciales (operacion y zona) están listos
    if (hasLoadedFilters && filters.operacion && filters.zona) {
      const handler = setTimeout(() => {
        fetchProperties(filters);
      }, 500); // Espera 500ms después de que el usuario deja de teclear
      return () => clearTimeout(handler);
    } else {
      setResults([]); // Limpiar resultados si no hay operación o zona
    }
  }, [filters, hasLoadedFilters, fetchProperties]);

  // --- 3. MANEJADORES DE EVENTOS ---
  const handleFilterChange = (name, value) => {
    const defaultState = {
      operacion: null, zona: null, tipo: null, barrio: null,
      pax: '', pets: false, pool: false, bedrooms: '',
      minMts: '', maxMts: '', minPrice: '', maxPrice: '',
    };
    
    setFilters(prev => {
      let newState = { ...prev, [name]: value };

      // Lógica de reseteo al cambiar filtros principales
      if (name === 'operacion') {
        return {
          ...defaultState,
          operacion: value, // Mantener solo la nueva operación
        };
      }
      if (name === 'zona') {
        newState.barrio = null; // Resetear barrio al cambiar zona
      }
      return newState;
    });
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
      pax: '', pets: false, pool: false, bedrooms: '',
      minMts: '', maxMts: '', minPrice: '', maxPrice: '',
    };
    
    if (name === 'operacion') {
      setFilters(defaultFilters); // Reseteo total
    } else if (name === 'zona') {
      setFilters(prev => ({ ...prev, zona: null, barrio: null }));
    } else {
      setFilters(prev => ({ ...prev, [name]: defaultFilters[name] }));
    }
  };

  // --- 4. LÓGICA DE RENDERIZADO DEL ASISTENTE ---
  
  const renderFiltrosActivos = () => (
    <div className="flex flex-wrap gap-2 items-center min-h-[34px]">
      {filters.operacion && <ActiveFilterTag label={`${filters.operacion.replace('_', ' ')}`} onRemove={() => removeFilter('operacion')} />}
      {filters.zona && <ActiveFilterTag label={`${filters.zona}`} onRemove={() => removeFilter('zona')} />}
      {filters.tipo && <ActiveFilterTag label={`${filters.tipo}`} onRemove={() => removeFilter('tipo')} />}
      {filters.barrio && <ActiveFilterTag label={`${filters.barrio}`} onRemove={() => removeFilter('barrio')} />}
      {/* (Se pueden añadir más etiquetas para precio, etc.) */}
    </div>
  );

  const renderAsistente = () => {
    // --- ESTADO DE CARGA INICIAL (esperando filtros) ---
    if (isLoading) {
      return <div className="text-center p-10"><Spinner /></div>;
    }
    
    // --- ESTADO DE ERROR (no se cargaron filtros) ---
    if (error && !hasLoadedFilters) {
      return (
         <div className="text-center text-red-600 bg-red-100 p-4 rounded-lg">
           <p className="font-bold">{error}</p>
         </div>
      );
    }
    
    // --- PASOS DEL ASISTENTE ---
    
    // Paso 1: ¿Qué buscas?
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

    // Paso 2: ¿Dónde buscas?
    if (!filters.zona) {
      return (
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">¿En qué zona?</h2>
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
          
          {/* --- Filtro TIPO --- */}
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

          {/* --- Filtro BARRIO (Dinámico) --- */}
          {listas.barrios[filters.zona] && (
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

          {/* --- Filtro DORMITORIOS (Oculto para Lotes) --- */}
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

          {/* --- Filtro PAX (Solo Alquileres) --- */}
          {filters.operacion !== 'venta' && (
            <div>
              <label htmlFor="pax" className="block text-sm font-medium text-gray-700 mb-1">Personas (mín)</label>
              <input
                type="number" id="pax" name="pax" min="0"
                value={filters.pax}
                onChange={(e) => handleFilterChange('pax', e.target.value)}
                placeholder="Ej: 6"
                className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
              />
            </div>
          )}
          
          {/* --- Filtros PRECIO (Mín y Máx) --- */}
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

          {/* --- Filtros MTS2 (Solo Venta/Anual, no Lotes) --- */}
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

          {/* --- Checkboxes (Pileta y Mascotas) --- */}
          {filters.tipo !== 'lote' && (
            <div className="flex flex-col gap-2 pt-6 col-span-2 md:col-span-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" name="pool"
                  checked={filters.pool}
                  onChange={() => handleCheckboxChange('pool')}
                  className="h-4 w-4 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
                />
                <span className="text-sm text-gray-700">Con Pileta / Jacuzzi</span>
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
        
        {/* --- NUEVO ENCABEZADO DE 3 COLUMNAS --- */}
        <header className="flex flex-col md:flex-row items-start justify-between mb-8 pb-4 border-b border-gray-200">
          
          {/* Columna Izquierda (25%) */}
          <div className="w-full md:w-1/4">
            <img 
              src="/logo_mcv_rectangular.png" 
              alt="Logo MCV Propiedades" 
              className="w-48 md:w-56"
            />
          </div>
          
          {/* Columna Central (50%) - AQUÍ VA EL BUSCADOR */}
          <div className="w-full md:w-1/2 px-0 md:px-4 mt-4 md:mt-0">
            <div className="mb-4">{renderFiltrosActivos()}</div>
            {/* El asistente se renderiza aquí */}
            {renderAsistente()} 
          </div>
          
          {/* Columna Derecha (25%) */}
          <div className="w-full md:w-1/4 text-left md:text-right mt-4 md:mt-0">
            <h1 className="text-2xl md:text-3xl font-bold text-mcv-azul">Agente Digital</h1>
            <p className="text-base text-gray-500">Encuentre su propiedad ideal</p>
          </div>
        </header>

        {/* --- Resultados (Abajo) --- */}
        <main>
          {isSearching ? ( // Usar el nuevo estado 'isSearching'
            <Spinner />
          ) : error ? (
            <div className="text-center text-red-600 bg-red-100 p-4 rounded-lg">
              <p className="font-bold">Error al cargar propiedades: {error}</p>
            </div>
          ) : (filters.operacion && filters.zona) ? ( // Solo mostrar si hay una búsqueda activa
            results.length > 0 ? (
              <>
                <h2 className="text-xl font-bold text-mcv-gris mb-4">
                  Resultados ({results.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {results.map(prop => (
                    <PropertyCard key={prop.property_id} property={prop} />
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center text-gray-500 p-10 bg-gray-50 rounded-lg">
                <p className="text-xl font-bold">No se encontraron propiedades</p>
                <p>Intente ajustar sus filtros de búsqueda.</p>
              </div>
            )
          ) : (
             <div className="text-center text-gray-500 p-10">
                <p className="text-xl font-bold">Bienvenido</p>
                <p>Use el asistente de arriba para encontrar su propiedad ideal.</p>
              </div>
          )}
        </main>

      </div>
    </div>
  );
}