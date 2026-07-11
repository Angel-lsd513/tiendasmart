// src/components/ModuloAnaqueles.jsx
// Módulo de Inteligencia Visual de Anaqueles — TiendaSmart
// Usa Supabase (tablas + Storage) para memoria persistente.
// Reusa /api/claude (el mismo proxy que ya usa el escáner de Inventario)
// para las llamadas de visión — no hace falta un endpoint nuevo.

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Camera, MapPin, AlertTriangle, CheckCircle2, Package, TrendingDown,
  Layers, Plus, ChevronLeft, Store, Archive, Sparkles, LayoutGrid,
  Boxes, Loader2, RefreshCw, Eye, Clock, Info, UploadCloud,
} from 'lucide-react';

const CATEGORIAS = ['Bebidas', 'Botanas', 'Panadería', 'Abarrotes básicos', 'Lácteos', 'Limpieza', 'Cigarros', 'Otros'];

const ICONO_TIPO = {
  anaquel: Layers, refrigerador: Boxes, congelador: Package,
  mostrador: Store, vitrina: LayoutGrid, bodega: Archive,
};

const ALERTA_META = {
  agotado: { label: 'Agotado', icon: TrendingDown, color: 'rose' },
  espacio_vacio: { label: 'Espacio vacío', icon: Package, color: 'amber' },
  fuera_de_lugar: { label: 'Fuera de lugar', icon: MapPin, color: 'amber' },
  recien_acomodado: { label: 'Recién acomodado', icon: CheckCircle2, color: 'emerald' },
  producto_nuevo: { label: 'Producto nuevo', icon: Sparkles, color: 'orange' },
  posible_perdida: { label: 'Posible pérdida — revisar', icon: AlertTriangle, color: 'rose' },
  error_captura: { label: 'Posible error de captura', icon: Info, color: 'stone' },
};

const COLOR = {
  rose: 'bg-rose-50 border-rose-200 text-rose-700',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  orange: 'bg-orange-50 border-orange-200 text-orange-700',
  stone: 'bg-stone-50 border-stone-200 text-stone-600',
};

const generarId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function redimensionarImagen(file, maxLado = 1024) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxLado) { height = (height * maxLado) / width; width = maxLado; }
        else if (height > maxLado) { width = (width * maxLado) / height; height = maxLado; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    lector.onerror = reject;
    lector.readAsDataURL(file);
  });
}

function dataUrlABlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)[1];
  const binario = atob(base64);
  const arr = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) arr[i] = binario.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function encontrarProducto(nombreDetectado, productos) {
  const n = String(nombreDetectado || '').toLowerCase().trim();
  if (!n) return null;
  return productos.find((p) => {
    const pn = p.nombre.toLowerCase();
    return pn === n || pn.includes(n) || n.includes(pn);
  }) || null;
}

async function llamarClaude(system, contenido) {
  const respuesta = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, system, messages: [{ role: 'user', content: contenido }] }),
  });
  const datos = await respuesta.json();
  const texto = (datos.content || []).map((b) => b.text || '').join('');
  return JSON.parse(texto.replace(/```json|```/g, '').trim());
}

async function analizarZonaConIA(base64, nombreZona, listaProductos) {
  const system = `Eres el sistema de inteligencia visual de TiendaSmart para una tienda de abarrotes mexicana. Analiza esta foto de "${nombreZona}".
La tienda maneja productos como: ${listaProductos || 'productos de abarrotes en general'}. Si reconoces alguno en la foto, usa exactamente ese nombre.
Si ves productos que NO están en esa lista: si es la misma línea de un producto existente pero de otro sabor o tamaño, pon el nombre EXACTO del producto existente en "variante_de"; si es un producto totalmente distinto, deja "variante_de" en null y sugiere una categoría de esta lista: ${CATEGORIAS.join(', ')}.
Devuelve ÚNICAMENTE JSON válido, sin texto extra ni backticks. Estructura exacta:
{"ocupacion": <0-100>, "productos": [{"nombre": "...", "marca": "...", "unidades": <numero>, "confianza": <0-100>}], "espacios_vacios": [{"ubicacion": "...", "severidad": "alta|media|baja"}], "productos_nuevos": [{"nombre": "...", "variante_de": "nombre exacto o null", "categoria_sugerida": "..."}], "observaciones": "..."}
Máximo 12 productos más visibles. Sé honesto con la confianza: si hay oclusión, sombra o no puedes contar bien, baja el número.`;
  const contenido = [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
    { type: 'text', text: `Analiza esta foto de ${nombreZona}. Dime qué productos ves, unidades aproximadas, espacios vacíos, y si hay productos que no reconozcas de mi catálogo.` },
  ];
  return llamarClaude(system, contenido);
}

async function compararConBaseline(baselineAnalisis, analisisActual, nombreZona) {
  const system = `Compara dos análisis visuales de "${nombreZona}" en una tienda de abarrotes mexicana.
LÍNEA BASE: ${JSON.stringify(baselineAnalisis)}
ANÁLISIS ACTUAL: ${JSON.stringify(analisisActual)}
Devuelve ÚNICAMENTE JSON válido sin backticks:
{"resumen": "...", "cambios": [{"tipo": "...", "descripcion": "..."}], "alertas": [{"tipo": "agotado|espacio_vacio|fuera_de_lugar|recien_acomodado|producto_nuevo|posible_perdida|error_captura", "severidad": "alta|media|baja", "evidencia": "...", "recomendacion": "..."}]}
Reglas: cada alerta debe justificarse con evidencia observable. Para "posible_perdida" NUNCA afirmes robo como un hecho — solo sugiere revisar, porque pudo venderse, estar en bodega o fuera del encuadre. Máximo 5 alertas, prioriza las más importantes.`;
  return llamarClaude(system, 'Compara ambos análisis y dame los cambios y alertas correspondientes.');
}

function fechaCorta(ts) {
  return new Date(ts).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function colorConfianza(c) {
  if (c >= 75) return 'text-emerald-700 bg-emerald-50';
  if (c >= 50) return 'text-amber-700 bg-amber-50';
  return 'text-rose-700 bg-rose-50';
}

export default function ModuloAnaqueles() {
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState('mapa');
  const [zonas, setZonas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [zonasConBaseline, setZonasConBaseline] = useState(new Set());
  const [alertasGlobales, setAlertasGlobales] = useState([]);
  const [zonaId, setZonaId] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [imagenPreview, setImagenPreview] = useState(null);
  const [fotoUrlPendiente, setFotoUrlPendiente] = useState(null);
  const [analisisActual, setAnalisisActual] = useState(null);
  const [comparacionActual, setComparacionActual] = useState(null);
  const [estadoProceso, setEstadoProceso] = useState('idle');
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');
  const [nuevaZonaNombre, setNuevaZonaNombre] = useState('');
  const [necesitaMigracion, setNecesitaMigracion] = useState(0);
  const [migrando, setMigrando] = useState(false);
  const inputRef = useRef(null);
  const modoRef = useRef('baseline');

  useEffect(() => { cargarInicial(); }, []);
  useEffect(() => { if (zonaId) cargarDetalleZona(zonaId); }, [zonaId]);

  const cargarInicial = async () => {
    try {
      const { count } = await supabase.from('productos').select('*', { count: 'exact', head: true });
      if ((count || 0) === 0) {
        const raw = localStorage.getItem('tiendasmart:productos');
        if (raw) {
          try {
            const local = JSON.parse(raw);
            if (Array.isArray(local) && local.length > 0) setNecesitaMigracion(local.length);
          } catch { /* ignorar */ }
        }
      } else {
        setNecesitaMigracion(0);
      }
      const [{ data: zonasData }, { data: productosData }, { data: baselinesData }, { data: alertasData }] = await Promise.all([
        supabase.from('zonas').select('*').order('orden'),
        supabase.from('productos').select('id, nombre, categoria, costo, precio, stock_minimo, unidad, proveedor, iva_exento'),
        supabase.from('baseline_zona').select('zona_id'),
        supabase.from('alertas_visuales').select('*, zonas(nombre)').eq('resuelta', false).order('creado_en', { ascending: false }).limit(30),
      ]);
      setZonas(zonasData || []);
      setProductos(productosData || []);
      setZonasConBaseline(new Set((baselinesData || []).map((b) => b.zona_id)));
      setAlertasGlobales(alertasData || []);
    } catch (e) {
      console.error(e);
      setError('No se pudo conectar con Supabase. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
    } finally {
      setCargando(false);
    }
  };

  const ejecutarMigracion = async () => {
    setMigrando(true);
    try {
      const raw = localStorage.getItem('tiendasmart:productos');
      const local = JSON.parse(raw || '[]');
      const filas = local.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria || null,
        costo: p.costo || 0,
        precio: p.precio || 0,
        stock: p.stock || 0,
        stock_minimo: p.stockMinimo || 0,
        unidad: p.unidad || 'pieza',
        proveedor: p.proveedor || null,
        iva_exento: Boolean(p.ivaExento),
        monitoreado: Boolean(p.monitoreado),
        venta_semanal_estimada: p.ventaSemanalEstimada || null,
        creado_en: p.creadoEn || new Date().toISOString().slice(0, 10),
        stock_fecha: p.stockFecha || new Date().toISOString().slice(0, 10),
        ultimo_conteo: p.ultimoConteo || null,
      }));
      const { error: errorMigracion } = await supabase.from('productos').upsert(filas, { onConflict: 'id' });
      if (errorMigracion) throw errorMigracion;
      setMensajeExito(`${filas.length} productos migrados a Supabase.`);
      setTimeout(() => setMensajeExito(''), 4000);
      await cargarInicial();
    } catch (e) {
      console.error(e);
      setError('No se pudo migrar. Revisa la consola del navegador para más detalle.');
    } finally {
      setMigrando(false);
    }
  };

  const cargarDetalleZona = async (id) => {
    const { data: baselineData } = await supabase.from('baseline_zona').select('*').eq('zona_id', id).order('creado_en', { ascending: false }).limit(1).maybeSingle();
    setBaseline(baselineData || null);
  };

  const zonaActual = zonas.find((z) => z.id === zonaId);
  const procesando = estadoProceso !== 'idle';

  const abrirZona = (id) => {
    setZonaId(id); setVista('zona');
    setImagenPreview(null); setAnalisisActual(null); setComparacionActual(null); setFotoUrlPendiente(null); setError('');
  };
  const volverAlMapa = () => { setVista('mapa'); setZonaId(null); };
  const dispararInput = (modo) => { modoRef.current = modo; inputRef.current?.click(); };

  const manejarArchivo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = null;
    if (!file || !zonaId) return;
    await procesarFoto(file, modoRef.current);
  };

  const actualizarUbicaciones = async (idZona, productosDetectados) => {
    for (const item of productosDetectados || []) {
      if ((item.confianza || 0) < 55) continue;
      const real = encontrarProducto(item.nombre, productos);
      if (!real) continue;
      const { data: existentes } = await supabase.from('producto_ubicacion').select('*').eq('producto_id', real.id);
      const aqui = (existentes || []).find((u) => u.zona_id === idZona);
      if (aqui) {
        await supabase.from('producto_ubicacion').update({ confianza: Math.min(100, aqui.confianza + 8), ultima_confirmacion: new Date().toISOString() }).eq('id', aqui.id);
      } else {
        await supabase.from('producto_ubicacion').insert({ producto_id: real.id, zona_id: idZona, confianza: 50 });
        const otraFuerte = (existentes || []).find((u) => u.zona_id !== idZona && u.confianza >= 70);
        if (otraFuerte) {
          const nombreOtraZona = zonas.find((z) => z.id === otraFuerte.zona_id)?.nombre || 'otra zona';
          await supabase.from('alertas_visuales').insert({
            zona_id: idZona, tipo: 'fuera_de_lugar', severidad: 'media',
            evidencia: `${real.nombre} normalmente está en ${nombreOtraZona}, pero se detectó aquí.`,
            recomendacion: `Confirma si ${real.nombre} cambió de lugar o si es una unidad suelta.`,
          });
        }
      }
    }
  };

  const procesarFoto = async (file, modo) => {
    setError(''); setAnalisisActual(null); setComparacionActual(null);
    try {
      const dataUrl = await redimensionarImagen(file);
      setImagenPreview(dataUrl);
      setEstadoProceso('subiendo');
      const blob = dataUrlABlob(dataUrl);
      const ruta = `${zonaId}/${Date.now()}.jpg`;
      const { error: errorSubida } = await supabase.storage.from('fotos-anaqueles').upload(ruta, blob, { contentType: 'image/jpeg' });
      if (errorSubida) throw errorSubida;
      const { data: urlData } = supabase.storage.from('fotos-anaqueles').getPublicUrl(ruta);
      setFotoUrlPendiente(urlData.publicUrl);

      setEstadoProceso('analizando');
      const listaNombres = productos.map((p) => p.nombre).join(', ');
      const analisis = await analizarZonaConIA(dataUrl.split(',')[1], zonaActual.nombre, listaNombres);
      setAnalisisActual(analisis);
      await actualizarUbicaciones(zonaId, analisis.productos);

      if (modo === 'comparar' && baseline) {
        setEstadoProceso('comparando');
        const comparacion = await compararConBaseline(baseline.analisis, analisis, zonaActual.nombre);
        setComparacionActual(comparacion);
        await supabase.from('fotos_zona').insert({ zona_id: zonaId, foto_url: urlData.publicUrl, analisis, comparacion });
        if (comparacion.alertas?.length) {
          await supabase.from('alertas_visuales').insert(
            comparacion.alertas.map((a) => ({ zona_id: zonaId, tipo: a.tipo, severidad: a.severidad, evidencia: a.evidencia, recomendacion: a.recomendacion }))
          );
        }
        const { data: alertasData } = await supabase.from('alertas_visuales').select('*, zonas(nombre)').eq('resuelta', false).order('creado_en', { ascending: false }).limit(30);
        setAlertasGlobales(alertasData || []);
      }
      setEstadoProceso('idle');
    } catch (e) {
      console.error(e);
      setError('No se pudo procesar la foto. Revisa tu conexión o intenta con otra imagen.');
      setEstadoProceso('idle');
    }
  };

  const guardarBaseline = async () => {
    if (!analisisActual || !fotoUrlPendiente) return;
    await supabase.from('baseline_zona').insert({ zona_id: zonaId, foto_url: fotoUrlPendiente, analisis: analisisActual });
    setZonasConBaseline((prev) => new Set(prev).add(zonaId));
    await cargarDetalleZona(zonaId);
    setImagenPreview(null); setAnalisisActual(null); setComparacionActual(null); setFotoUrlPendiente(null);
    setMensajeExito('Línea base guardada.');
    setTimeout(() => setMensajeExito(''), 3000);
  };

  const agregarZona = async () => {
    const nombre = nuevaZonaNombre.trim();
    if (!nombre) return;
    const { data, error: errorZona } = await supabase.from('zonas').insert({ nombre, tipo: 'anaquel', orden: zonas.length + 1 }).select().single();
    if (!errorZona && data) { setZonas((z) => [...z, data]); setNuevaZonaNombre(''); }
  };

  const agregarProductoDetectado = async (item) => {
    const variante = item.variante_de ? productos.find((p) => p.nombre.toLowerCase() === String(item.variante_de).toLowerCase()) : null;
    const nuevo = {
      id: generarId(),
      nombre: item.nombre,
      categoria: variante ? variante.categoria : (CATEGORIAS.includes(item.categoria_sugerida) ? item.categoria_sugerida : CATEGORIAS[0]),
      costo: variante ? variante.costo : 0,
      precio: variante ? variante.precio : 0,
      stock: 0,
      stock_minimo: variante ? variante.stock_minimo : 5,
      unidad: variante ? variante.unidad : 'pieza',
      proveedor: variante ? variante.proveedor : null,
      iva_exento: variante ? variante.iva_exento : false,
      monitoreado: false,
    };
    const { error: errorInsert } = await supabase.from('productos').insert(nuevo);
    if (!errorInsert) setProductos((p) => [...p, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
  };

  const alertasCriticas = alertasGlobales.filter((a) => a.severidad === 'alta').length;

  const estadoZona = (id) => {
    const alertasZona = alertasGlobales.filter((a) => a.zona_id === id);
    if (!zonasConBaseline.has(id)) return { txt: 'Sin registrar', cls: 'bg-stone-100 text-stone-500' };
    if (alertasZona.length > 0) return { txt: `${alertasZona.length} ${alertasZona.length === 1 ? 'alerta' : 'alertas'}`, cls: 'bg-amber-100 text-amber-700' };
    return { txt: 'Línea base ✓', cls: 'bg-emerald-100 text-emerald-700' };
  };

  if (cargando) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-emerald-700 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4 pb-4">
      <input ref={inputRef} type="file" accept="image/*" onClick={(e) => { e.currentTarget.value = null; }} onChange={manejarArchivo} className="hidden" />

      {error && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2.5 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}
      {mensajeExito && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">{mensajeExito}</p>}

      {necesitaMigracion > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <UploadCloud size={16} className="text-orange-600" />
            <p className="font-display font-semibold text-orange-900 text-sm">Migra tus productos a Supabase</p>
          </div>
          <p className="text-xs text-orange-800 mb-3">Encontré {necesitaMigracion} producto{necesitaMigracion === 1 ? '' : 's'} guardados en este navegador. Migralos para que el módulo pueda relacionar fotos con tu catálogo real.</p>
          <button onClick={ejecutarMigracion} disabled={migrando} className="bg-orange-600 text-white rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-60">
            {migrando ? (<><Loader2 size={15} className="animate-spin" /> Migrando…</>) : (<><UploadCloud size={15} /> Migrar ahora</>)}
          </button>
        </div>
      )}

      {vista === 'mapa' && (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white rounded-xl p-3 border border-stone-200">
              <p className="font-mono-num text-2xl font-bold text-stone-800">{zonas.filter((z) => zonasConBaseline.has(z.id)).length}<span className="text-stone-300 text-lg">/{zonas.length}</span></p>
              <p className="text-2xs text-stone-500 mt-0.5">Zonas registradas</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-stone-200">
              <p className="font-mono-num text-2xl font-bold text-amber-600">{alertasGlobales.length}</p>
              <p className="text-2xs text-stone-500 mt-0.5">Alertas activas</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-stone-200">
              <p className="font-mono-num text-2xl font-bold text-rose-600">{alertasCriticas}</p>
              <p className="text-2xs text-stone-500 mt-0.5">Prioridad alta</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <MapPin size={16} className="text-emerald-700" />
            <p className="font-display font-semibold text-stone-800 text-sm">Mapa de la tienda</p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {zonas.map((z) => {
              const Icono = ICONO_TIPO[z.tipo] || Layers;
              const est = estadoZona(z.id);
              const critica = alertasGlobales.some((a) => a.zona_id === z.id && a.severidad === 'alta');
              return (
                <button key={z.id} onClick={() => abrirZona(z.id)} className="bg-white rounded-xl p-3 border border-stone-200 text-left active:bg-stone-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="bg-stone-100 rounded-lg p-1.5"><Icono size={16} className="text-stone-600" /></div>
                    {critica && <span className="w-2 h-2 rounded-full bg-rose-500" />}
                  </div>
                  <p className="font-medium text-sm text-stone-800">{z.nombre}</p>
                  <span className={`inline-block mt-1.5 text-2xs px-2 py-0.5 rounded-full font-medium ${est.cls}`}>{est.txt}</span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <input value={nuevaZonaNombre} onChange={(e) => setNuevaZonaNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregarZona()}
              placeholder="Nueva zona (ej. Vitrina de dulces)" className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600" />
            <button onClick={agregarZona} className="bg-emerald-700 text-white rounded-xl px-3 flex items-center"><Plus size={16} /></button>
          </div>

          {alertasGlobales.length > 0 && (
            <>
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={16} className="text-amber-600" />
                <p className="font-display font-semibold text-stone-800 text-sm">Alertas inteligentes</p>
              </div>
              <div className="space-y-2">
                {alertasGlobales.map((a) => {
                  const meta = ALERTA_META[a.tipo] || ALERTA_META.error_captura;
                  const Icono = meta.icon;
                  return (
                    <div key={a.id} className={`rounded-xl border p-3 ${COLOR[meta.color]}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icono size={16} />
                        <span className="font-semibold text-sm">{meta.label}</span>
                        <span className="ml-auto text-2xs font-medium bg-white/60 px-1.5 py-0.5 rounded">{a.zonas?.nombre}</span>
                      </div>
                      <p className="text-xs opacity-90 mb-1.5"><span className="font-medium">Evidencia:</span> {a.evidencia}</p>
                      <p className="text-xs bg-white/50 rounded-lg px-2 py-1.5">💡 {a.recomendacion}</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="flex items-start gap-2 text-2xs text-stone-400 pt-2 border-t border-stone-200">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>El conteo por foto es una estimación. Úsalo para detectar cambios y espacios vacíos; cruza con tu inventario para cifras exactas.</span>
          </div>
        </>
      )}

      {vista === 'zona' && zonaActual && (
        <>
          <button onClick={volverAlMapa} className="flex items-center gap-1 text-sm text-emerald-700 font-medium">
            <ChevronLeft size={16} /> Mapa de la tienda
          </button>

          <div className="flex items-center gap-2">
            {(() => { const I = ICONO_TIPO[zonaActual.tipo] || Layers; return <div className="bg-emerald-100 rounded-xl p-2"><I size={20} className="text-emerald-700" /></div>; })()}
            <div>
              <p className="font-display font-bold text-lg text-stone-800">{zonaActual.nombre}</p>
              {baseline ? (
                <p className="text-xs text-stone-500 flex items-center gap-1"><Clock size={12} /> Línea base: {fechaCorta(baseline.creado_en)}</p>
              ) : (
                <p className="text-xs text-amber-600">Sin línea base registrada</p>
              )}
            </div>
          </div>

          {!baseline && !analisisActual && (
            <div className="bg-white rounded-2xl border-2 border-dashed border-stone-200 p-6 text-center">
              <div className="bg-emerald-50 rounded-full w-14 h-14 flex items-center justify-center mx-auto mb-3">
                <Camera size={24} className="text-emerald-700" />
              </div>
              <p className="font-medium text-stone-800 mb-1">Registra la línea base</p>
              <p className="text-sm text-stone-500 mb-4">Fotografía esta zona para crear el inventario visual de referencia.</p>
              <button onClick={() => dispararInput('baseline')} disabled={procesando}
                className="bg-emerald-700 text-white rounded-xl px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
                <Camera size={16} /> Tomar / subir foto
              </button>
            </div>
          )}

          {baseline && !imagenPreview && (
            <div className="grid grid-cols-2 gap-2.5">
              <button onClick={() => dispararInput('comparar')} disabled={procesando}
                className="bg-emerald-700 text-white rounded-xl px-3 py-3 text-sm font-medium flex flex-col items-center gap-1 disabled:opacity-50">
                <RefreshCw size={20} /> Actualizar y comparar
              </button>
              <button onClick={() => dispararInput('baseline')} disabled={procesando}
                className="bg-white border border-stone-200 text-stone-600 rounded-xl px-3 py-3 text-sm font-medium flex flex-col items-center gap-1 disabled:opacity-50">
                <Camera size={20} /> Nueva línea base
              </button>
            </div>
          )}

          {imagenPreview && (
            <div className="rounded-2xl overflow-hidden border border-stone-200 relative">
              <img src={imagenPreview} alt="captura de zona" className="w-full h-48 object-cover" />
              {procesando && (
                <div className="absolute inset-0 bg-stone-900/60 flex flex-col items-center justify-center text-white">
                  <Loader2 size={28} className="animate-spin mb-2" />
                  <p className="text-sm font-medium">
                    {estadoProceso === 'subiendo' ? 'Subiendo foto…' : estadoProceso === 'analizando' ? 'Analizando anaquel…' : 'Comparando con línea base…'}
                  </p>
                </div>
              )}
            </div>
          )}

          {analisisActual && !procesando && (
            <div className="bg-white rounded-2xl border border-stone-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5"><Eye size={16} className="text-emerald-700" /><p className="font-display font-semibold text-sm">Análisis visual</p></div>
                <span className="text-xs text-stone-500">Ocupación: <b className="font-mono-num text-stone-700">{analisisActual.ocupacion}%</b></span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2 mb-3">
                <div className="bg-emerald-600 h-2 rounded-full" style={{ width: `${analisisActual.ocupacion}%` }} />
              </div>
              <div className="space-y-1.5 mb-3">
                {(analisisActual.productos || []).map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Package size={14} className="text-stone-400 shrink-0" />
                    <span className="flex-1 truncate">{p.nombre}{p.marca && p.marca !== p.nombre ? ` · ${p.marca}` : ''}</span>
                    <span className="font-mono-num text-stone-500">{p.unidades}u</span>
                    <span className={`text-2xs px-1.5 py-0.5 rounded font-medium ${colorConfianza(p.confianza)}`}>{p.confianza}%</span>
                  </div>
                ))}
              </div>
              {(analisisActual.espacios_vacios || []).length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2 mb-2">
                  <b>Espacios vacíos:</b> {analisisActual.espacios_vacios.map((e) => e.ubicacion).join(', ')}
                </div>
              )}
              {(analisisActual.productos_nuevos || []).length > 0 && (
                <div className="space-y-1.5 mb-2">
                  <p className="text-2xs font-medium text-stone-500">Productos nuevos detectados</p>
                  {analisisActual.productos_nuevos.map((item, i) => (
                    <div key={i} className="flex items-center justify-between border border-stone-100 rounded-xl p-2.5">
                      <span className="text-sm text-stone-700 truncate">{item.nombre}</span>
                      <button onClick={() => agregarProductoDetectado(item)} className="text-xs font-medium bg-emerald-700 text-white rounded-lg px-2.5 py-1 flex items-center gap-1 shrink-0 ml-2">
                        <Plus size={12} /> Agregar
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {analisisActual.observaciones && <p className="text-xs text-stone-500 italic">{analisisActual.observaciones}</p>}
              <button onClick={guardarBaseline} className="mt-3 w-full bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2">
                <CheckCircle2 size={16} /> {baseline ? 'Actualizar línea base a esta foto' : 'Guardar como línea base'}
              </button>
            </div>
          )}

          {comparacionActual && !procesando && (
            <>
              <div className="bg-white rounded-2xl border border-stone-200 p-4">
                <div className="flex items-center gap-1.5 mb-2"><Sparkles size={16} className="text-orange-600" /><p className="font-display font-semibold text-sm">Comparación con línea base</p></div>
                <p className="text-sm text-stone-600">{comparacionActual.resumen}</p>
              </div>
              {(comparacionActual.alertas || []).length > 0 && (
                <div className="space-y-2">
                  {comparacionActual.alertas.map((a, i) => {
                    const meta = ALERTA_META[a.tipo] || ALERTA_META.error_captura;
                    const Icono = meta.icon;
                    return (
                      <div key={i} className={`rounded-xl border p-3 ${COLOR[meta.color]}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icono size={16} /><span className="font-semibold text-sm">{meta.label}</span>
                          <span className="ml-auto text-2xs uppercase font-bold opacity-60">{a.severidad}</span>
                        </div>
                        <p className="text-xs opacity-90 mb-1.5"><span className="font-medium">Evidencia:</span> {a.evidencia}</p>
                        <p className="text-xs bg-white/50 rounded-lg px-2 py-1.5">💡 {a.recomendacion}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {baseline && !imagenPreview && (
            <div className="bg-stone-50 rounded-2xl border border-stone-200 p-4">
              <p className="text-2xs font-medium text-stone-500 mb-2">Inventario de referencia actual</p>
              <div className="space-y-1">
                {(baseline.analisis.productos || []).slice(0, 8).map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-stone-600">
                    <span className="w-1 h-1 rounded-full bg-stone-300" />
                    <span className="flex-1 truncate">{p.nombre}</span>
                    <span className="font-mono-num text-stone-400 text-xs">{p.unidades}u</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
