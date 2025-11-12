import { useState, useEffect, useCallback } from 'react';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';
import ActiveFilterTag from '@/components/ActiveFilterTag'; // Usamos el mismo componente

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
  
  // --- ESTADO PRINCIPAL (Sin cambios) ---
  const [filters, setFilters] = useState({
    operacion: 'venta', // Valor por defecto
    zona: null,
    tipo: null,
    barrio: null,
    pax: '',
    pets: false,
    pool: false,
    bedrooms: '',
    minMts: '',
    maxMts: '',
    // (Faltan: startDate, endDate, minPrice, maxPrice - se agregan en Día 8)
  });

  // --- ESTADO DE RESULTADOS Y LISTAS DE FILTROS (Sin cambios) ---
  const [results, setResults] = useState([]);
  const [listas, setListas] = useState({ zonas: [], barrios: {} });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- 1. CARGAR LISTAS DE FILTROS (Sin cambios) ---
  useEffect(() => {
    async function loadFilters() {
      try {
        const res = await fetch('/api/get-filters');
        const data = await res.json();
        if (data.status === 'OK') {
          setListas({ 
            zonas: Object.keys(data.filtros),
            barrios: data.filtros
          });
        }
      } catch (err) {
        console.error("Error cargando listas de filtros:", err);
      }
    }
    loadFilters();
  }, []);

  // --- 2. LÓGICA DE BÚSQUEDA "EN VIVO" (Sin cambios) ---
  const fetchProperties = useCallback(async (currentFilters) => {
    setIsLoading(true);
    setError(null);
    setResults([]); 

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

  useEffect(() => {
    fetchProperties(filters);
  }, [filters, fetchProperties]);

  // --- 3. MANEJADORES DE EVENTOS (Sin cambios) ---
  const handleFilterChange = (name, value) => {
    setFilters(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCheckboxChange = (name) => {
    setFilters(prev => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  const removeFilter = (name) => {
    // Si quitamos 'operacion', reseteamos todo
    if (name === 'operacion') {
      setFilters({
        operacion: null, zona: null, tipo: null, barrio: null,
        pax: '', pets: false, pool: false, bedrooms: '', minMts: '', maxMts: '',
      });
      return;
    }
    // Si quitamos 'zona', también quitamos 'barrio'
    if (name === 'zona') {
      setFilters(prev => ({ ...prev, zona: null, barrio: null }));
    } else {
      setFilters(prev => ({ ...prev, [name]: null }));
    }
  };

  // --- 4. LÓGICA DE RENDERIZADO DEL ASISTENTE (Sin cambios) ---
  
  const renderFiltrosActivos = () => (
    <div className="flex flex-wrap gap-2 items-center min-h-[34px]">
      {filters.operacion && <ActiveFilterTag label={`Operación: ${filters.operacion.replace('_', ' ')}`} onRemove={() => removeFilter('operacion')} />}
      {filters.zona && <ActiveFilterTag label={`Zona: ${filters.zona}`} onRemove={() => removeFilter('zona')} />}
      {filters.tipo && <ActiveFilterTag label={`Tipo: ${filters.tipo}`} onRemove={() => removeFilter('tipo')} />}
      {filters.barrio && <ActiveFilterTag label={`Barrio: ${filters.barrio}`} onRemove={() => removeFilter('barrio')} />}
    </div>
  );

  const renderAsistente = () => {
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
          
          {/* --- Filtro TIPO (Casa, Lote, etc.) --- */}
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

          {/* --- Filtro DORMITORIOS (Solo si no es Lote) --- */}
          {filters.tipo !== 'lote' && (
            <div>
              <label htmlFor="bedrooms" className="block text-sm font-medium text-gray-700 mb-1">Dorm. (mín)</label>
              <input
                type="number" id="bedrooms" name="bedrooms"
                value={filters.bedrooms}
                onChange={(e) => handleFilterChange('bedrooms', e.target.value)}
                placeholder="Ej: 3"
                className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
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
                className="w-full p-2 rounded-md bg-white border border-gray-300 text-sm"
              />
            </div>
          )}

          {/* --- Checkboxes (Pileta y Mascotas) --- */}
          {filters.tipo !== 'lote' && (
            <div className="flex flex-col gap-2 pt-6">
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
          
          {/* (Aquí faltan filtros de Mts2 y Precio, los agregamos en el próximo paso) */}

        </div>
      </div>
    );
  };
  
  // --- 5. RENDERIZADO PRINCIPAL (¡ESTRUCTURA CAMBIADA!) ---
  return (
    <div className="min-h-screen bg-white text-gray-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* --- NUEVO ENCABEZADO DE 3 COLUMNAS --- */}
        <header className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200">
          
          {/* Columna Izquierda (25%) */}
          <div className="w-1/4">
            <img 
              src="/logo_mcv_rectangular.png" 
              alt="Logo MCV Propiedades" 
              className="w-48 md:w-56"
            />
          </div>
          
          {/* Columna Central (50%) - AQUÍ VA EL BUSCADOR */}
          <div className="w-1/2 px-4">
            <div className="mb-4">{renderFiltrosActivos()}</div>
            {renderAsistente()}
          </div>
          
          {/* Columna Derecha (25%) */}
          <div className="w-1/4 text-right">
            <h1 className="text-2xl md:text-3xl font-bold text-mcv-azul">Agente Digital</h1>
            <p className="text-base text-gray-500">Encuentre su propiedad ideal</p>
          </div>
        </header>

        {/* --- Resultados (Abajo) --- */}
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