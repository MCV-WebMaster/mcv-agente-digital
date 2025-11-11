### PROMPT DE RESPALDO: Proyecto "MCV Agente Digital"

**ROL:** Eres mi Project Lead y Desarrollador Senior Full-Stack.

**PROYECTO:** Crear un buscador de propiedades dinámico y un asistente virtual para el sitio de la inmobiliaria MCV Propiedades (`mcvpropiedades.com.ar/vidal`). El nombre del proyecto es "MCV Agente Digital" (slug: `mcv-agente-digital`).

**CONTEXTO:** El sitio actual corre en WordPress con el plugin "Estatik PRO". Tiene +250 propiedades (venta y alquiler). Ya tiene instalado el plugin **WPGraphQL**.

**EL GRAN DESAFÍO (OBJETIVO PRINCIPAL):** El sitio tiene +100 propiedades de alquiler temporal en Costa Esmeralda. Necesitamos crear un buscador dinámico que permita filtrar por **disponibilidad de fechas (Desde/Hasta)**. El buscador debe ser instantáneo (sin recargar la página).

---

### RESTRICCIONES CRÍTICAS (INNEGOCIABLES):

1.  **COSTO CERO:** Toda la arquitectura debe operar exclusivamente en planes gratuitos. Esto incluye:
    * **Hosting:** Vercel (Plan "Hobby").
    * **Base de Datos:** Supabase (Plan "Free").
    * **Envío de Emails:** Resend (Plan "Free").
    * **Código:** GitHub (Plan "Free").
2.  **CERO CAMBIOS EN EL FLUJO DE TRABAJO:** El equipo de agentes inmobiliarios **NO** puede cambiar su forma de trabajar. **NO** harán ninguna carga de datos manual, **NO** aprenderán un nuevo ABM y **NO** instalarán plugins de pago (como ACF Pro). Deben seguir usando la interfaz de Estatik como lo hacen hoy.

---

### EL DESCUBRIMIENTO CLAVE (Análisis de Datos):

Tras analizar el WordPress existente, hemos descubierto la clave del proyecto:

1.  **CALENDARIO (Datos Estructurados):** Los agentes **YA** cargan la disponibilidad en campos `meta` de Estatik. No está en texto libre. El XML de exportación muestra campos como:
    * `es_property_enero-1ra-quincena`
    * `es_property_enero-2da-quincena`
    * `es_property_febrero-1ra-quincena`
    * `es_property_ano-nuevo`
2.  **LÓGICA DE DISPONIBILIDAD:** El *valor* de estos campos indica el estado. La lógica de negocio es:
    * Si el campo contiene `$` o `Disponible` => Está **DISPONIBLE**.
    * Si el campo contiene `Alquilada` o `No disponible` => Está **OCUPADO**.
3.  **PAX (Simplificación):** El filtro complejo de "PAX Adultos/Menores" se **DESCARTA**. Solo implementaremos el filtro `PAX Total` usando el campo existente `es_property_pax`.

---

### LA ARQUITECTURA APROBADA (Plan V4: "El Sincronizador")

Basado en las restricciones y descubrimientos, la arquitectura será "Headless" (desacoplada) con un sincronizador:

1.  **FRONTEND (Vercel):** Una aplicación Next.js (React) que aloja el buscador público y el asistente virtual.
2.  **BACKEND DE CONTENIDO (WordPress):** El sitio actual. Actúa como un "Headless CMS" y es la única fuente de verdad. Expone sus datos (Estatik + campos de quincena) vía **WPGraphQL**.
3.  **BACKEND DE BÚSQUEDA (Supabase):** Una base de datos Postgres gratuita. Almacenará *únicamente* los datos de disponibilidad limpios y estructurados.
4.  **EL "SINCRONIZADOR" (El Cerebro):**
    * Es una **Serverless Function** (ej: `/api/sync`) alojada en Vercel.
    * Se ejecuta automáticamente 1 vez al día (vía un Cron Job de Vercel).
    * **Función:**
        1.  Llama a la API **WPGraphQL** de WordPress y obtiene todas las propiedades de alquiler temporal.
        2.  "Parsea" (interpreta) los campos de quincena (ej: `es_property_enero-1ra-quincena`).
        3.  Aplica la "Lógica de Disponibilidad" (ver arriba).
        4.  Convierte estos datos a un formato limpio (ej: `prop_id: 123`, `start_date: '2026-01-01'`, `end_date: '2026-01-15'`, `status: 'Disponible'`).
        5.  Escribe estos datos limpios en la base de datos de **Supabase**.

---

### EL FLUJO DEL PROYECTO:

1.  **FLUJO DE BÚSQUEDA DEL CLIENTE:**
    * El usuario busca fechas en el frontend de Vercel.
    * El frontend llama a una API en Vercel (ej: `/api/search`).
    * Esta API (`/api/search`) consulta **directamente a Supabase** (que tiene los datos limpios y es ultra-rápida), no a WordPress.
    * La API devuelve las propiedades disponibles.
2.  **OTROS FILTROS:**
    * Para **Venta:** Implementar filtros por Tipo, Valor, Zona, Ambientes.
    * Para **Alquiler Temporal:** Implementar filtros por Rango de Fechas, `PAX Total`, Mascotas, Piscina, Barrio (todos los campos ya existen en Estatik).
3.  **ASISTENTE VIRTUAL (LEAD):**
    * Crear un formulario "wizard" multi-paso que guíe al usuario.
    * Al finalizar, los datos se envían a un agente de MCV vía **Resend** (API `/api/contact`).

---

### PLAN DE TRABAJO:

* El proyecto se ejecutará en un **Sprint de 7 Días**.
* **Mi rol (el cliente)** será configurar las cuentas gratuitas (Vercel, Supabase, Resend, GitHub) y realizar el "copiar y pegar" de los bloques de código completos que me proveas.
* **Tu rol (IA)** será proveer el **100% del código completo** (componentes de React, APIs de Next.js, scripts de Sincronización, scripts SQL para Supabase, consultas WPGraphQL) y la **guía paso a paso** del sprint (Día 1 a Día 7) para que yo pueda ejecutarlo.
