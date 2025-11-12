import { useState, useEffect, useCallback } from 'react';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';
import ActiveFilterTag from '@/components/ActiveFilterTag'; // ¡NUEVO!

// --- Mapeo de IDs (de su lista de Estatik) ---
const CATEGORY_IDS = {
  VENTA: 198,
  ALQUILER_TEMPORAL: 197,
  ALQUILER_ANUAL: [193, 194],
};

const TYPE_IDS = {
  CASA: 162,
  DEPARTAMENTO: 163,
  LOTE: 167,
};

export default function SearchPage() {
  
  // --- ESTADO PRINCIPAL ---
  const [filters, setFilters] = useState({
    operacion: null, // 'venta', 'alquiler_temporal', 'alquiler_anual'
    zona: null,
    tipo: null,
    barrio: null,
    pax: '',
    pets: false,
    pool: false,
    bedrooms: '',
    minMts: '',
    maxMts: '',
    // (Faltan: startDate, endDate, minPrice, maxPrice - se agregan en Día 7/8)
  });

  // --- ESTADO DE RESULTADOS Y LISTAS DE FILTROS ---
  const [results, setResults] = useState([]);
  const [listas, setListas] = useState({ zonas: [], barrios: {} }); // barrios es un objeto
  const [isLoading, setIsLoading] = useState(true); // Empezar cargando
  const [error, setError] = useState(null);

  // --- 1. CARGAR LISTAS DE FILTROS (Zonas y Barrios) ---
  useEffect(() => {
    async function loadFilters() {
      try {
        const res = await fetch('/api/get-filters');
        const data = await res.json();
        if (data.status === 'OK') {
          setListas({ 
            zonas: Object.keys(data.filtros), // ["GBA Sur", "Costa Esmeralda"]
            barrios: data.filtros // {"GBA Sur": ["Quilmes", ...], "Costa Esmeralda": ["Maritimo", ...]}
          });
        }
      } catch (err) {
        console.error("Error cargando listas de filtros:", err);
      }
    }
    loadFilters();
  }, []); // El array vacío [] asegura que solo se ejecute 1 vez

  // --- 2. LÓGICA DE BÚSQUEDA "EN VIVO" ---
  const fetchProperties = useCallback(async (currentFilters) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentFilters),
      });

      if (!response.ok) throw new Error('La respuesta de la red no fue OK');
      
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
      setIsLoading(false);
    }
  }, []);

  // useEffect "vigila" los filtros. Si cambian, llama a fetchProperties()
  useEffect(() => {
    // Llamar a la API cada vez que los filtros cambien
    fetchProperties(filters);
  }, [filters, fetchProperties]);

  // --- 3. MANEJADORES DE EVENTOS ---
  const handleFilterChange = (name, value) => {
    setFilters(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCheckboxChange = (name) => {
    setFilters(prev => ({
      ...prev,
      [name]: !prev[name], // Invertir el valor booleano
    }));
  };

  // Resetea un filtro específico (al hacer clic en la X de la etiqueta)
  const removeFilter = (name) => {
    // Si quitamos 'zona', también quitamos 'barrio'
    if (name === 'zona') {
      setFilters(prev => ({ ...prev, zona: null, barrio: null }));
    } else {
      setFilters(prev => ({ ...prev, [name]: null }));
    }
  };

  // --- 4. LÓGICA DE RENDERIZADO DEL ASISTENTE ---
  
  const renderFiltrosActivos = () => (
    <div className="flex flex-wrap gap-2 items-center min-h-[34px]">
      {filters.operacion && <ActiveFilterTag label={`Operación: ${filters.operacion.replace('_', ' ')}`} onRemove={() => setFilters({})} />}
      {filters.zona && <ActiveFilterTag label={`Zona: ${filters.zona}`} onRemove={() => removeFilter('zona')} />}
      {filters.tipo && <ActiveFilterTag label={`Tipo: ${filters.tipo}`} onRemove={() => removeFilter('tipo')} />}
      {filters.barrio && <ActiveFilterTag label={`Barrio: ${filters.barrio}`} onRemove={() => removeFilter('barrio')} />}
      {/* (Aquí se añadirán más etiquetas para PAX, Pileta, etc.) */}
    </div>
  );

  const renderAsistente = () => {
    // Paso 1: ¿Qué buscas?
    if (!filters.operacion) {
      return (
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">¿Qué buscás?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button onClick={() => handleFilterChange('operacion', 'venta')} className="p-6 bg-mcv-azul text-white rounded-lg shadow-lg hover:bg-opacity-80 transition-all text-xl font-bold">
              Comprar
            </button>
            <button onClick={() => handleFilterChange('operacion', 'alquiler_temporal')} className="p-6 bg-mcv-verde text-white rounded-lg shadow-lg hover:bg-opacity-80 transition-all text-xl font-bold">
              Alquiler Temporal
            </button>
            <button onClick={() => handleFilterChange('operacion', 'alquiler_anual')} className="p-6 bg-mcv-gris text-white rounded-lg shadow-lg hover:bg-opacity-80 transition-all text-xl font-bold">
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
          <h2 className="text-2xl font-bold mb-4">¿En qué zona?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {listas.zonas.map(zona => (
              <button key={zona} onClick={() => handleFilterChange('zona', zona)} className="p-6 bg-gray-100 border border-gray-300 text-mcv-gris rounded-lg shadow-lg hover:bg-gray-200 transition-all text-xl font-bold">
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
        <h2 className="text-xl font-bold mb-4 text-mcv-gris">Afiná tu búsqueda:</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          
          {/* --- Filtro TIPO (Casa, Lote, etc.) --- */}
          <div>
            <label htmlFor="tipo" className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              id="tipo" name="tipo"
              value={filters.tipo || ''}
              onChange={(e) => handleFilterChange('tipo', e.target.value)}
              className="w-full p-2 rounded-md bg-white border border-gray-300"
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
                className="w-full p-2 rounded-md bg-white border border-gray-300"
              >
                <option value="">Todos</option>
                {listas.barrios[filters.zona].map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

          {/* --- Filtro DORMITORIOS (Solo si no es Lote) --- */}
          {filters.tipo !== 'lote' && (
            <div>
              <label htmlFor="bedrooms" className="block text-sm font-medium text-gray-700 mb-1">Dormitorios (mín)</label>
              <input
                type="number" id="bedrooms" name="bedrooms"
                value={filters.bedrooms}
                onChange={(e) => handleFilterChange('bedrooms', e.target.value)}
                placeholder="Ej: 3"
                className="w-full p-2 rounded-md bg-white border border-gray-300"
              />
            </div>
          )}

          {/* --- Filtro PAX (Solo Alquiler) --- */}
          {filters.operacion !== 'venta' && (
            <div>
              <label htmlFor="pax" className="block text-sm font-medium text-gray-700 mb-1">Personas (mín)</label>
              <input
                type="number" id="pax" name="pax"
                value={filters.pax}
                onChange={(e) => handleFilterChange('pax', e.target.value)}
                placeholder="Ej: 6"
                className="w-full p-2 rounded-md bg-white border border-gray-300"
              />
            </div>
          )}

          {/* --- Filtros MTS2 (Solo Venta) --- */}
          {filters.operacion === 'venta' && (
            <>
              <div>
                <label htmlFor="minMts" className="block text-sm font-medium text-gray-700">Mts2 (mín)</label>
                <input 
                  type="number" id="minMts" name="minMts"
                  value={filters.minMts} onChange={(e) => handleFilterChange('minMts', e.target.value)}
                  className="w-full p-2 rounded-md bg-white border border-gray-300"
                />
              </div>
              <div>
                <label htmlFor="maxMts" className="block text-sm font-medium text-gray-700">Mts2 (máx)</label>
                <input 
                  type="number" id="maxMts" name="maxMts"
                  value={filters.maxMts} onChange={(e) => handleFilterChange('maxMts', e.target.value)}
                  className="w-full p-2 rounded-md bg-white border border-gray-300"
                />
              </div>
            </>
          )}

          {/* --- Checkboxes (Pileta y Mascotas) --- */}
          {filters.tipo !== 'lote' && (
            <div className="flex flex-col gap-2 pt-6 col-span-full md:col-span-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" name="pool"
                  checked={filters.pool}
                  onChange={() => handleCheckboxChange('pool')}
                  className="h-5 w-5 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
                />
                <span className="text-gray-700">Con Pileta / Jacuzzi</span>
              </label>
              
              {filters.operacion !== 'venta' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox" name="pets"
                    checked={filters.pets}
                    onChange={() => handleCheckboxChange('pets')}
                    className="h-5 w-5 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
                  />
                  <span className="text-gray-700">Acepta Mascotas</span>
                </label>
              )}
            </div>
          )}

        </div>
      </div>
    );
  };
  
  // --- RENDERIZADO PRINCIPAL DE LA PÁGINA ---
  return (
    <div className="min-h-screen bg-white text-gray-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* --- Encabezado --- */}
        <header className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200">
          <img 
            src="/logo_mcv_rectangular.png" 
            alt="Logo MCV Propiedades" 
            className="w-40 md:w-56"
          />
          <div className="text-right">
            <h1 className="text-2xl md:text-3xl font-bold text-mcv-azul">Agente Digital</h1>
            <p className="text-base text-gray-500">Encuentre su propiedad ideal</p>
          </div>
        </header>

        {/* --- Panel del Asistente y Filtros Activos --- */}
        <div className="mb-8">
          <div className="mb-4">{renderFiltrosActivos()}</div>
          {renderAsistente()}
        </div>

        {/* --- Resultados --- */}
        <main>
          {isLoading ? (
            <Spinner />
          ) : error ? (
            <div className="text-center text-red-600 bg-red-100 p-4 rounded-lg">
              <p className="font-bold">Error al cargar propiedades</p>
              <p>{error}</p>
            </div>
          ) : results.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map(prop => (
                <PropertyCard key={prop.property_id} property={prop} />
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 p-10 bg-gray-50 rounded-lg">
              <p className="text-xl font-bold">No se encontraron propiedades</p>
              <p>Intente ajustar sus filtros de búsqueda.</p>
            </div>
          )}
        </main>

      </div>
    </div>
  );
}