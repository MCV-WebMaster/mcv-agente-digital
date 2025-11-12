import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';

// (Helper para "debounce": evita que la API se llame 100 veces
// si el usuario escribe rápido en un campo de texto)
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}


export default function SearchPage() {
  // --- 1. ESTADO DE LOS FILTROS ---
  // Guardamos lo que el usuario selecciona
  const [filters, setFilters] = useState({
    type: 'Alquiler Temporal', // Valor inicial: Alquiler Temporal
    startDate: '',
    endDate: '',
    pax: '',
    pets: false,
    pool: false,
    barrio: '',
  });

  // --- 2. ESTADO DE LOS RESULTADOS ---
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Usamos el "debouncer" para el campo PAX
  const debouncedPax = useDebounce(filters.pax, 500);

  // --- 3. LÓGICA DE BÚSQUEDA ---
  // Esta función se ejecuta cada vez que un filtro cambia
  const fetchProperties = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // Construir la URL de la API con los filtros
    const params = new URLSearchParams();
    
    // Solo añadimos los filtros si tienen valor
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (debouncedPax) params.append('pax', debouncedPax);
    if (filters.pets) params.append('pets', 'true');
    if (filters.pool) params.append('pool', 'true');
    if (filters.barrio) params.append('barrio', filters.barrio);

    // (Aquí iría la lógica para 'Venta': if (filters.type === 'Venta')...)

    try {
      // Llamar a nuestra API del Día 3
      const response = await fetch(`/api/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error('La respuesta de la red no fue OK');
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
      setIsLoading(false);
    }
  }, [filters.startDate, filters.endDate, debouncedPax, filters.pets, filters.pool, filters.barrio]);

  // useEffect "vigila" los filtros. Si cambian, llama a fetchProperties()
  useEffect(() => {
    if (filters.type === 'Alquiler Temporal') {
      fetchProperties();
    } else {
      // Si el tipo es "Venta", limpiamos los resultados (a implementar)
      setResults([]);
    }
  }, [fetchProperties, filters.type]);

  // --- 4. MANEJADORES DE EVENTOS ---
  // Funciones que actualizan el estado de los filtros
  
  const handleTypeChange = (e) => {
    setFilters(prev => ({ ...prev, type: e.target.value, pax: '', pets: false, pool: false, barrio: '', startDate: '', endDate: '' }));
  };

  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // --- 5. RENDERIZADO (El HTML) ---
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* --- Encabezado y Logo --- */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-8">
          <img 
            src="/logo_mcv_rectangular.png" 
            alt="Logo MCV Propiedades" 
            className="w-48 md:w-64"
          />
          <div className="text-center md:text-right mt-4 md:mt-0">
            <h1 className="text-3xl font-bold text-mcv-azul">Agente Digital</h1>
            <p className="text-lg text-gray-300">Encuentre su propiedad ideal</p>
          </div>
        </header>

        {/* --- Contenedor Principal: Filtros + Resultados --- */}
        <div className="flex flex-col md:flex-row gap-8">

          {/* --- Columna de Filtros (Izquierda) --- */}
          <aside className="w-full md:w-1/4 p-4 bg-gray-800 rounded-lg shadow-lg h-fit">
            
            {/* Filtro: Tipo de Operación */}
            <div className="mb-4">
              <label htmlFor="type" className="block text-sm font-medium text-gray-300 mb-1">Tipo de Operación</label>
              <select
                id="type"
                name="type"
                value={filters.type}
                onChange={handleTypeChange}
                className="w-full p-2 rounded-md bg-gray-700 border-mcv-gris focus:border-mcv-azul focus:ring-mcv-azul"
              >
                <option value="Alquiler Temporal">Alquiler Temporal</option>
                <option value="Venta">Venta (próximamente)</option>
                <option value="Alquiler">Alquiler (próximamente)</option>
              </select>
            </div>

            {/* --- Filtros de Alquiler Temporal --- */}
            {filters.type === 'Alquiler Temporal' && (
              <div className="space-y-4">
                
                {/* Filtro: Fechas (Placeholder) */}
                <div className="flex gap-2">
                  <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-300">Desde</label>
                    <input 
                      type="date"
                      id="startDate"
                      name="startDate"
                      value={filters.startDate}
                      onChange={handleFilterChange}
                      className="w-full p-2 rounded-md bg-gray-700 border-mcv-gris text-gray-300"
                    />
                  </div>
                  <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-300">Hasta</label>
                    <input 
                      type="date"
                      id="endDate"
                      name="endDate"
                      value={filters.endDate}
                      onChange={handleFilterChange}
                      className="w-full p-2 rounded-md bg-gray-700 border-mcv-gris text-gray-300"
                    />
                  </div>
                </div>

                {/* Filtro: PAX */}
                <div>
                  <label htmlFor="pax" className="block text-sm font-medium text-gray-300">Mínimo de Personas (PAX)</label>
                  <input
                    type="number"
                    id="pax"
                    name="pax"
                    value={filters.pax}
                    onChange={handleFilterChange}
                    placeholder="Ej: 6"
                    className="w-full p-2 rounded-md bg-gray-700 border-mcv-gris focus:border-mcv-azul focus:ring-mcv-azul"
                  />
                </div>

                {/* Filtro: Checkboxes (Mascotas y Pileta) */}
                <div className="flex flex-col gap-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="pets"
                      checked={filters.pets}
                      onChange={handleFilterChange}
                      className="h-5 w-5 rounded bg-gray-700 border-mcv-gris text-mcv-azul focus:ring-mcv-azul"
                    />
                    <span className="text-gray-300">Acepta Mascotas</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="pool"
                      checked={filters.pool}
                      onChange={handleFilterChange}
                      className="h-5 w-5 rounded bg-gray-700 border-mcv-gris text-mcv-azul focus:ring-mcv-azul"
                    />
                    <span className="text-gray-300">Con Pileta</span>
                  </label>
                </div>

                {/* (Aquí iría el filtro de Barrios, pero es más complejo 
                   porque requiere cargar la lista de barrios desde la API) */}

              </div>
            )}
          </aside>

          {/* --- Columna de Resultados (Derecha) --- */}
          <main className="w-full md:w-3/4">
            {isLoading ? (
              // Si está cargando, mostrar el Spinner
              <Spinner />
            ) : error ? (
              // Si hay un error
              <div className="text-center text-red-500 bg-red-900 p-4 rounded-lg">
                <p className="font-bold">Error al cargar propiedades</p>
                <p>{error}</p>
              </div>
            ) : results.length > 0 ? (
              // Si hay resultados, mostrar la grilla
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {results.map(prop => (
                  <PropertyCard key={prop.property_id} property={prop} />
                ))}
              </div>
            ) : (
              // Si no hay resultados
              <div className="text-center text-gray-400 p-10 bg-gray-800 rounded-lg">
                <p className="text-xl">No se encontraron propiedades.</p>
                <p>Intente ajustar sus filtros de búsqueda.</p>
              </div>
            )}
          </main>
        </div>

      </div>
    </div>
  );
}