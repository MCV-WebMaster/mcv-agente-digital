import { useState, useEffect, useCallback } from 'react';
import PropertyCard from '@/components/PropertyCard';
import Spinner from '@/components/Spinner';

export default function SearchPage() {
  
  // --- ESTADO DE FILTROS ---
  const [filters, setFilters] = useState({
    operacion: 'venta', // Valor por defecto
    zona: '',
    tipo: '',
    barrio: '',
    pax: '',
    pets: false,
    pool: false,
    bedrooms: '',
    startDate: '',
    endDate: '',
    minPrice: '',
    maxPrice: '',
    minMts: '',
    maxMts: '',
  });

  // --- ESTADO DE RESULTADOS Y LISTAS DE FILTROS ---
  const [results, setResults] = useState([]);
  const [listas, setListas] = useState({ zonas: [], barrios: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- 1. CARGAR LISTAS DE FILTROS (Zonas y Barrios) ---
  useEffect(() => {
    async function loadFilters() {
      try {
        const res = await fetch('/api/get-filters');
        const data = await res.json();
        if (data.status === 'OK') {
          setListas({ zonas: data.zonas, barrios: data.barrios });
        }
      } catch (err) {
        console.error("Error cargando listas de filtros:", err);
      }
    }
    loadFilters();
  }, []); // El array vacío [] asegura que solo se ejecute 1 vez

  // --- 2. LÓGICA DE BÚSQUEDA (se llama con el botón) ---
  const handleSearch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setResults([]); // Limpiar resultados anteriores

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
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
  }, [filters]); // Se ejecuta cuando 'filters' cambia

  // --- 3. MANEJADORES DE EVENTOS ---
  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // --- 4. RENDERIZADO (El HTML) ---
  return (
    <div className="min-h-screen bg-white text-gray-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* --- Encabezado y Logo --- */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-8 pb-4 border-b border-gray-200">
          <img 
            src="/logo_mcv_rectangular.png" 
            alt="Logo MCV Propiedades" 
            className="w-48 md:w-64"
          />
          <div className="text-center md:text-right mt-4 md:mt-0">
            <h1 className="text-3xl font-bold text-mcv-azul">Agente Digital</h1>
            <p className="text-lg text-gray-500">Encuentre su propiedad ideal</p>
          </div>
        </header>

        {/* --- Contenedor Principal: Filtros + Resultados --- */}
        <div className="flex flex-col md:flex-row gap-8">

          {/* --- Columna de Filtros (Izquierda) --- */}
          <aside className="w-full md:w-1/3 lg:w-1/4 p-4 bg-gray-50 border border-gray-200 rounded-lg shadow-sm h-fit">
            
            <h2 className="text-2xl font-bold mb-4 text-mcv-gris">Filtros</h2>
            
            <div className="space-y-4">
              
              {/* --- ¿QUÉ BUSCAS? (Operación) --- */}
              <div>
                <label htmlFor="operacion" className="block text-sm font-bold text-gray-700 mb-1">¿Qué buscás?</label>
                <select
                  id="operacion"
                  name="operacion"
                  value={filters.operacion}
                  onChange={handleFilterChange}
                  className="w-full p-2 rounded-md bg-white border border-gray-300 focus:border-mcv-azul focus:ring-mcv-azul"
                >
                  <option value="venta">Comprar</option>
                  <option value="alquiler_temporal">Alquiler Temporal</option>
                  <option value="alquiler_anual">Alquiler Anual</option>
                </select>
              </div>

              {/* --- ¿DÓNDE BUSCAS? (Zona) --- */}
              <div>
                <label htmlFor="zona" className="block text-sm font-bold text-gray-700 mb-1">¿En qué zona?</label>
                <select
                  id="zona"
                  name="zona"
                  value={filters.zona}
                  onChange={handleFilterChange}
                  className="w-full p-2 rounded-md bg-white border border-gray-300 focus:border-mcv-azul focus:ring-mcv-azul"
                >
                  <option value="">Todas las zonas</option>
                  {listas.zonas.map(z => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>

              <hr className="border-gray-200"/>
              
              <h3 className="text-xl font-bold mb-2 text-mcv-gris">Afiná tu búsqueda</h3>

              {/* --- TIPO DE PROPIEDAD --- */}
              <div>
                <label htmlFor="tipo" className="block text-sm font-medium text-gray-700 mb-1">Tipo de Propiedad</label>
                <select
                  id="tipo"
                  name="tipo"
                  value={filters.tipo}
                  onChange={handleFilterChange}
                  className="w-full p-2 rounded-md bg-white border border-gray-300 focus:border-mcv-azul focus:ring-mcv-azul"
                >
                  <option value="">Cualquiera</option>
                  <option value="casa">Casa</option>
                  <option value="departamento">Departamento</option>
                  {filters.operacion === 'venta' && <option value="lote">Lote</option>}
                </select>
              </div>

              {/* --- BARRIO --- */}
              <div>
                <label htmlFor="barrio" className="block text-sm font-medium text-gray-700 mb-1">Barrio</label>
                <select
                  id="barrio"
                  name="barrio"
                  value={filters.barrio}
                  onChange={handleFilterChange}
                  className="w-full p-2 rounded-md bg-white border border-gray-300 focus:border-mcv-azul focus:ring-mcv-azul"
                >
                  <option value="">Todos los barrios</option>
                  {listas.barrios.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              {/* --- FILTROS DE VIVIENDA (Dormitorios, Mts2) --- */}
              {filters.tipo !== 'lote' && (
                <>
                  <div>
                    <label htmlFor="bedrooms" className="block text-sm font-medium text-gray-700 mb-1">Dormitorios (mínimo)</label>
                    <input
                      type="number"
                      id="bedrooms"
                      name="bedrooms"
                      min="0"
                      value={filters.bedrooms}
                      onChange={handleFilterChange}
                      placeholder="Ej: 3"
                      className="w-full p-2 rounded-md bg-white border border-gray-300"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div>
                      <label htmlFor="minMts" className="block text-sm font-medium text-gray-700">Mts2 (mín)</label>
                      <input 
                        type="number" id="minMts" name="minMts"
                        value={filters.minMts} onChange={handleFilterChange}
                        className="w-full p-2 rounded-md bg-white border border-gray-300"
                      />
                    </div>
                    <div>
                      <label htmlFor="maxMts" className="block text-sm font-medium text-gray-700">Mts2 (máx)</label>
                      <input 
                        type="number" id="maxMts" name="maxMts"
                        value={filters.maxMts} onChange={handleFilterChange}
                        className="w-full p-2 rounded-md bg-white border border-gray-300"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* --- FILTROS DE ALQUILER TEMPORAL (PAX, Fechas) --- */}
              {filters.operacion === 'alquiler_temporal' && (
                <>
                  <hr className="border-gray-200"/>
                  <div>
                    <label htmlFor="pax" className="block text-sm font-bold text-gray-700 mb-1">Personas (mínimo)</label>
                    <input
                      type="number" id="pax" name="pax"
                      value={filters.pax} onChange={handleFilterChange}
                      placeholder="Ej: 6"
                      className="w-full p-2 rounded-md bg-white border border-gray-300"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div>
                      <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">Desde</label>
                      <input 
                        type="date" id="startDate" name="startDate"
                        value={filters.startDate} onChange={handleFilterChange}
                        className="w-full p-2 rounded-md bg-white border border-gray-300"
                      />
                    </div>
                    <div>
                      <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">Hasta</label>
                      <input 
                        type="date" id="endDate" name="endDate"
                        value={filters.endDate} onChange={handleFilterChange}
                        className="w-full p-2 rounded-md bg-white border border-gray-300"
                      />
                    </div>
                  </div>
                  {/* Filtro de Precio para Alquiler Temporal */}
                  <div className="flex gap-2">
                    <div>
                      <label htmlFor="minPrice" className="block text-sm font-medium text-gray-700">Precio (mín)</label>
                      <input 
                        type="number" id="minPrice" name="minPrice"
                        placeholder="Ej: 1000"
                        value={filters.minPrice} onChange={handleFilterChange}
                        className="w-full p-2 rounded-md bg-white border border-gray-300"
                      />
                    </div>
                    <div>
                      <label htmlFor="maxPrice" className="block text-sm font-medium text-gray-700">Precio (máx)</label>
                      <input 
                        type="number" id="maxPrice" name="maxPrice"
                        placeholder="Ej: 5000"
                        value={filters.maxPrice} onChange={handleFilterChange}
                        className="w-full p-2 rounded-md bg-white border border-gray-300"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* --- Checkboxes (Pileta y Mascotas, condicional) --- */}
              {filters.tipo !== 'lote' && (
                <div className="flex flex-col gap-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="pool"
                      checked={filters.pool}
                      onChange={handleFilterChange}
                      className="h-5 w-5 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
                    />
                    <span className="text-gray-700">Con Pileta / Jacuzzi</span>
                  </label>
                  
                  {/* Ocultar mascotas si es 'venta' */}
                  {filters.operacion !== 'venta' && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="pets"
                        checked={filters.pets}
                        onChange={handleFilterChange}
                        className="h-5 w-5 rounded border-gray-300 text-mcv-azul focus:ring-mcv-azul"
                      />
                      <span className="text-gray-700">Acepta Mascotas</span>
                    </label>
                  )}
                </div>
              )}
              
              {/* Botón de Búsqueda */}
              <div className="text-center mt-6">
                <button
                  onClick={handleSearch}
                  disabled={isLoading} // Deshabilitar mientras carga
                  className="w-full p-3 bg-mcv-verde text-white font-bold rounded-lg shadow-lg text-xl hover:bg-opacity-90 disabled:bg-gray-400"
                >
                  {isLoading ? 'Buscando...' : 'Buscar'}
                </button>
              </div>

            </div>
          </aside>

          {/* --- Columna de Resultados (Derecha) --- */}
          <main className="w-full md:w-2/3 lg:w-3/4">
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
    </div>
  );
}