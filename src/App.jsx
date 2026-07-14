import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ModuloAnaqueles from './components/ModuloAnaqueles';
import {
  Home, Package, DollarSign, Calculator, ShoppingCart, Camera, Sparkles, Loader2,
  Plus, Minus, X, Settings, AlertTriangle, TrendingUp, TrendingDown, Check, Trash2, Copy, Wallet,
  MapPin, FileText, Users, PackageX, ClipboardList, Send, Printer, Download, RefreshCw, BookOpen,
} from 'lucide-react';

/* ======================= Helpers ======================= */

const generarId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const formatoMoneda = (v) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(v || 0);

const formatoFechaCorta = (fechaISO) => {
  const f = new Date(fechaISO + 'T12:00:00');
  return f.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
};

const hoyISO = () => new Date().toISOString().split('T')[0];

const inicioMes = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const finMes = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
};

const enRango = (fechaStr, inicio, fin) => {
  const f = new Date(fechaStr + 'T12:00:00');
  return f >= inicio && f <= fin;
};

const sumarDias = (fechaISO, n) => {
  const d = new Date(fechaISO + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

const diasEntre = (fechaA, fechaB) => {
  const a = new Date(fechaA + 'T12:00:00');
  const b = new Date(fechaB + 'T12:00:00');
  return Math.round((b - a) / 86400000);
};

const listaFechasEnRango = (inicio, fin) => {
  const fechas = [];
  let cursor = inicio;
  let guard = 0;
  while (cursor <= fin && guard < 40) {
    fechas.push(cursor);
    cursor = sumarDias(cursor, 1);
    guard++;
  }
  return fechas;
};

function calcularPrecio({ costo, modoMargen, margenPct, ivaPct }) {
  const c = parseFloat(costo) || 0;
  const m = Math.min(parseFloat(margenPct) || 0, 95);
  const iva = parseFloat(ivaPct) || 0;
  let precioSinIva;
  if (modoMargen === 'costo') {
    precioSinIva = c * (1 + m / 100);
  } else {
    precioSinIva = c / (1 - m / 100);
  }
  const precioConIva = precioSinIva * (1 + iva / 100);
  const utilidadUnitaria = precioSinIva - c;
  const margenSobreVenta = precioSinIva > 0 ? (utilidadUnitaria / precioSinIva) * 100 : 0;
  const margenSobreCosto = c > 0 ? (utilidadUnitaria / c) * 100 : 0;
  return { precioSinIva, precioConIva, utilidadUnitaria, margenSobreVenta, margenSobreCosto };
}

function calcularPrediccionProducto(producto, ventasProducto) {
  const hoy = new Date();
  const hace28 = new Date(hoy);
  hace28.setDate(hoy.getDate() - 28);
  const registros = ventasProducto.filter(
    (v) => v.productoId === producto.id && new Date(v.fechaFin + 'T12:00:00') >= hace28
  );

  const semanas = [0, 0, 0, 0];
  registros.forEach((v) => {
    const dias = Math.floor((hoy - new Date(v.fechaFin + 'T12:00:00')) / 86400000);
    const idx = Math.min(3, Math.max(0, Math.floor(dias / 7)));
    semanas[idx] += v.cantidad;
  });

  const promedioAnterior = (semanas[1] + semanas[2] + semanas[3]) / 3;
  const ultimaSemana = semanas[0];
  const promedioGeneral = semanas.reduce((a, b) => a + b, 0) / 4;

  let tendencia = 'estable';
  if (promedioAnterior > 0) {
    const cambio = (ultimaSemana - promedioAnterior) / promedioAnterior;
    if (cambio > 0.15) tendencia = 'subiendo';
    else if (cambio < -0.15) tendencia = 'bajando';
  } else if (ultimaSemana > 0) {
    tendencia = 'subiendo';
  }

  const demandaSemanal = promedioGeneral > 0 ? promedioGeneral : producto.stockMinimo / 2;
  const sugerido = Math.max(0, Math.ceil(demandaSemanal * 1.15 - producto.stock));

  return { promedioGeneral: Math.round(demandaSemanal * 10) / 10, tendencia, sugerido, ultimaSemana };
}

// Calcula los totales financieros de un periodo. Acepta inicio/fin como objetos Date
// o como strings ISO (los normaliza internamente), para poder usarse tanto con
// rangos de mes calendario (Date) como con ventanas móviles de 7 días (strings).
function calcularTotalesPeriodo(datos, inicioRaw, finRaw) {
  const inicio = inicioRaw instanceof Date ? inicioRaw : new Date(inicioRaw + 'T00:00:00');
  const fin = finRaw instanceof Date ? finRaw : new Date(finRaw + 'T23:59:59');
  const { ventasDiarias, ventasProducto, gastos, compras, fiados, mermas } = datos;

  const vdPeriodo = ventasDiarias.filter((v) => enRango(v.fecha, inicio, fin));
  const ingresos = vdPeriodo.reduce((s, v) => s + v.monto, 0);

  const vpPeriodo = ventasProducto.filter((v) => enRango(v.fechaFin, inicio, fin));
  const ingresoTop = vpPeriodo.reduce((s, v) => s + v.cantidad * v.precioUnitario, 0);
  const costoTop = vpPeriodo.reduce((s, v) => s + v.cantidad * v.costoUnitario, 0);
  const margenTop = ingresoTop > 0 ? (ingresoTop - costoTop) / ingresoTop : 0.28;
  const ingresoResto = Math.max(0, ingresos - ingresoTop);
  const costoResto = ingresoResto * (1 - margenTop);
  const costoVentasEstimado = costoTop + costoResto;

  const gastosPeriodo = gastos.filter((g) => enRango(g.fecha, inicio, fin));
  const gastosOperativos = gastosPeriodo.reduce((s, g) => s + g.monto, 0);

  const comprasPeriodo = compras.filter((c) => enRango(c.fecha, inicio, fin));
  const totalCompras = comprasPeriodo.reduce((s, c) => s + c.total, 0);

  const mermasPeriodo = mermas.filter((m) => enRango(m.fecha, inicio, fin));
  const totalMerma = mermasPeriodo.reduce((s, m) => s + m.valorEstimado, 0);

  const fiadoOtorgado = fiados.filter((f) => enRango(f.fecha, inicio, fin)).reduce((s, f) => s + f.monto, 0);
  const fiadoCobrado = fiados.filter((f) => f.cobrado && f.fechaCobro && enRango(f.fechaCobro, inicio, fin)).reduce((s, f) => s + f.monto, 0);
  const fiadoPendienteTotal = fiados.filter((f) => !f.cobrado).reduce((s, f) => s + f.monto, 0);

  const utilidadBruta = ingresos - costoVentasEstimado;
  const utilidadNeta = utilidadBruta - gastosOperativos - totalMerma;
  const flujoEfectivo = ingresos - fiadoOtorgado + fiadoCobrado - gastosOperativos - totalCompras;

  return {
    ingresos, costoVentasEstimado, utilidadBruta, gastosOperativos, totalMerma, utilidadNeta,
    totalCompras, fiadoOtorgado, fiadoCobrado, fiadoPendienteTotal, flujoEfectivo,
    vdPeriodo, vpPeriodo, gastosPeriodo, comprasPeriodo, mermasPeriodo, margenTop,
  };
}

/* ======================= Constantes ======================= */

/* ======================= Motor de recomendación (funciones puras + configuración) ======================= */

const MOTOR_CONFIG = Object.freeze({
  version: 1,
  velocidad: { ventanaCorta: 14, ventanaLarga: 28, minLapsosCorta: 2 },
  tendencia: { alza: 1.3, baja: 0.7, rangoEstable: [0.6, 1.6] },
  margenSeguridad: { factor: 0.25, minDias: 1 },
  quincena: { dias: [13, 14, 15, 28, 29, 30, 31], multiplicador: 1.15 },
  cicloDefecto: 7,
  prioridadRojo: { coberturaMax: 1, ventanaSurtido: 1.5 },
  confianza: {
    pesos: { frescura: 30, historial: 25, consistencia: 20, precio: 15, anclaje: 10 },
    frescuraDiasMax: 14, historialLapsosPleno: 6, historialVentanaDias: 60,
    precioDiasPleno: 7, precioDiasMax: 30, anclajeDias: 14,
    penalizacionCambioBrusco: 15, minLapsosConsistencia: 3, consistenciaNeutral: 0.5,
    umbralAlta: 85, umbralMedia: 60,
  },
  icd: {
    pesos: { recenciaCorte: 30, recenciaTicket: 20, coberturaVentas: 20, monitoreadosAlDia: 15, cierreLoop: 15 },
    ventanaCobertura: 14, ticketDiasPleno: 7, ticketDiasCero: 30,
    monitoreadoVentanaDias: 7, cierreLoopDias: 14, cambioMinExplicar: 5,
    cadenciaDefecto: 3,
  },
  umbralEstado: { excelente: 85, buena: 65, regular: 40 },
  salud: { pesoICD: 0.6, pesoVolumen: 0.2, pesoCatalogo: 0.2, cortesPleno: 8, monitoreadosPleno: 6 },
  conservador: { icdMin: 40, factorCadencia: 2, capConfianza: 55, percentilVelocidad: 0.25, factorSinLapsos: 0.75 },
  arranque: { pseudoDias: 7, graduacionLapsos: 3, graduacionDias: 14, diasProductoNuevo: 28 },
  duplicados: {
    ventanaDias: 7, umbral: 0.6, minSenales: 2,
    pesos: { proveedor: 0.35, fecha: 0.25, total: 0.2, productos: 0.2 },
    fechaMaxDias: 3, totalTolerancia: 0.15, jaccardMin: 0.35,
  },
  ajustePersonal: { minMuestras: 3, umbralDesvio: 0.2, rango: [0.5, 1.5] },
  bitacora: { maxEntradas: 104, cambioCostoMin: 0.05, topMovimientos: 2 },
});

const mediana = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/* --- Velocidad de venta por unión de intervalos, con prorrateo en los bordes --- */
function velocidadEnVentana(lapsos, hoy, ventanaDias) {
  const inicioVentana = sumarDias(hoy, -(ventanaDias - 1));
  let cantidad = 0;
  const intervalos = [];
  lapsos.forEach((l) => {
    const ini = l.fechaInicio > inicioVentana ? l.fechaInicio : inicioVentana;
    const fin = l.fechaFin < hoy ? l.fechaFin : hoy;
    if (ini > fin) return;
    const diasTotales = diasEntre(l.fechaInicio, l.fechaFin) + 1;
    const diasDentro = diasEntre(ini, fin) + 1;
    cantidad += (l.cantidad || 0) * (diasDentro / Math.max(1, diasTotales));
    intervalos.push([ini, fin]);
  });
  intervalos.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let diasCubiertos = 0;
  let cursorFin = null;
  intervalos.forEach(([ini, fin]) => {
    if (cursorFin === null || ini > cursorFin) {
      diasCubiertos += diasEntre(ini, fin) + 1;
      cursorFin = fin;
    } else if (fin > cursorFin) {
      diasCubiertos += diasEntre(cursorFin, fin);
      cursorFin = fin;
    }
  });
  return { cantidad, diasCubiertos, v: diasCubiertos > 0 ? cantidad / diasCubiertos : 0 };
}

function analizarVentasProducto(productoId, ventasProducto, hoy, config) {
  const cfg = config.velocidad;
  const lapsos = ventasProducto.filter((v) => v.productoId === productoId);
  const enLarga = lapsos.filter((l) => l.fechaFin >= sumarDias(hoy, -(cfg.ventanaLarga - 1)));
  const larga = velocidadEnVentana(lapsos, hoy, cfg.ventanaLarga);
  const corta = velocidadEnVentana(lapsos, hoy, cfg.ventanaCorta);
  const lapsosCorta = lapsos.filter((l) => l.fechaFin >= sumarDias(hoy, -(cfg.ventanaCorta - 1))).length;
  const vObservada = lapsosCorta >= cfg.minLapsosCorta ? corta.v : larga.v;
  const r = larga.v > 0 ? corta.v / larga.v : 1;
  const velocidadesLapso = enLarga.map((l) => (l.cantidad || 0) / Math.max(1, diasEntre(l.fechaInicio, l.fechaFin) + 1));
  let consistencia = null;
  if (velocidadesLapso.length >= config.confianza.minLapsosConsistencia) {
    const prom = velocidadesLapso.reduce((s, x) => s + x, 0) / velocidadesLapso.length;
    if (prom > 0) {
      const varianza = velocidadesLapso.reduce((s, x) => s + (x - prom) ** 2, 0) / velocidadesLapso.length;
      consistencia = clamp(1 - Math.sqrt(varianza) / prom, 0, 1);
    } else consistencia = 0;
  }
  const ultimoLapso = lapsos.reduce((max, l) => (!max || l.fechaFin > max.fechaFin ? l : max), null);
  return {
    vObservada, r, consistencia, velocidadesLapso,
    lapsosEnVentana: enLarga.length, diasCubiertos: larga.diasCubiertos,
    diasDesdeUltimoLapso: ultimoLapso ? diasEntre(ultimoLapso.fechaFin, hoy) : null,
    tieneHistorial: lapsos.length > 0,
  };
}

/* --- Arranque en frío: prior jerárquico solo con productos graduados --- */
function calcularPrior(producto, contextos, config) {
  if (producto.ventaSemanalEstimada > 0) return { v: producto.ventaSemanalEstimada / 7, fuente: 'dueño' };
  const deCategoria = contextos.porCategoria[producto.categoria];
  if (deCategoria && deCategoria.length) return { v: mediana(deCategoria), fuente: 'categoría' };
  const deProveedor = producto.proveedor ? contextos.porProveedor[producto.proveedor] : null;
  if (deProveedor && deProveedor.length) return { v: mediana(deProveedor), fuente: 'proveedor' };
  if (contextos.globales.length) return { v: mediana(contextos.globales), fuente: 'general' };
  return { v: 0, fuente: null };
}

function esGraduado(analisis, config) {
  return analisis.lapsosEnVentana >= config.arranque.graduacionLapsos && analisis.diasCubiertos >= config.arranque.graduacionDias;
}

function esProductoNuevo(producto, analisis, hoy, config) {
  if (analisis.tieneHistorial) return false;
  if (producto.ventaSemanalEstimada > 0) return true;
  return Boolean(producto.creadoEn && diasEntre(producto.creadoEn, hoy) <= config.arranque.diasProductoNuevo);
}

/* --- Ciclo de surtido y días al próximo pedido --- */
function calcularCiclo(productoId, compras, cortes, config) {
  const fechas = [...new Set(compras.filter((c) => c.productoId === productoId).map((c) => c.fecha))].sort();
  if (fechas.length >= 2) {
    const gaps = [];
    for (let i = 1; i < fechas.length; i++) gaps.push(diasEntre(fechas[i - 1], fechas[i]));
    const m = mediana(gaps);
    if (m > 0) return m;
  }
  const fechasCorte = cortes.map((c) => c.fechaFin).sort();
  if (fechasCorte.length >= 2) {
    const gaps = [];
    for (let i = 1; i < fechasCorte.length; i++) gaps.push(diasEntre(fechasCorte[i - 1], fechasCorte[i]));
    const m = mediana(gaps);
    if (m > 0) return m;
  }
  return config.cicloDefecto;
}

function diasProximoSurtido(productoId, compras, ciclo, hoy, diaPedidoSemanal) {
  if (diaPedidoSemanal != null && diaPedidoSemanal !== '') {
    const objetivo = parseInt(diaPedidoSemanal);
    const hoyDia = new Date(hoy + 'T12:00:00').getDay();
    let delta = (objetivo - hoyDia + 7) % 7;
    return delta;
  }
  const ultima = compras.filter((c) => c.productoId === productoId).reduce((max, c) => (!max || c.fecha > max ? c.fecha : max), null);
  if (!ultima) return Math.round(ciclo / 2);
  return Math.max(0, diasEntre(hoy, sumarDias(ultima, Math.round(ciclo))));
}

/* --- Stock proyectado desde el último sello --- */
function proyectarStock(producto, v, hoy) {
  const ancla = producto.stockFecha || hoy;
  const dias = Math.max(0, diasEntre(ancla, hoy));
  return Math.max(0, (producto.stock || 0) - v * dias);
}

/* --- Prioridad: 0 rojo · 1 naranja · 2 amarillo · 3 verde --- */
function calcularNivelPrioridad({ S, v, T, C, M, r }, config) {
  if (v <= 0) return 3;
  const D = S / v;
  let nivel;
  if ((S <= 0) || D <= config.prioridadRojo.coberturaMax || (D <= T && T <= config.prioridadRojo.ventanaSurtido)) nivel = 0;
  else if (D <= T + M) nivel = 1;
  else if (D <= T + C) nivel = 2;
  else nivel = 3;
  if (r >= config.tendencia.alza && nivel > 0) nivel -= 1;
  if (r <= config.tendencia.baja && nivel > 0 && nivel < 3) nivel += 1;
  return nivel;
}

/* --- Factor de quincena ponderado sobre la ventana de cobertura --- */
function factorQuincena(hoy, diasVentana, config) {
  if (diasVentana <= 0) return 1;
  let normales = 0, especiales = 0;
  for (let i = 0; i < Math.min(diasVentana, 45); i++) {
    const dia = new Date(sumarDias(hoy, i) + 'T12:00:00').getDate();
    if (config.quincena.dias.includes(dia)) especiales++;
    else normales++;
  }
  const total = normales + especiales;
  return (normales + especiales * config.quincena.multiplicador) / total;
}

/* --- Confianza por producto: componentes medibles + acción de mayor recuperación --- */
function calcularConfianza(analisis, producto, compras, hoy, config, esNuevo) {
  const c = config.confianza;
  if (esNuevo) {
    return { puntos: 30, etiqueta: 'Estimación', componentes: [], accion: 'Confírmalo en tu próximo corte para empezar a medirlo de verdad.' };
  }
  const comp = [];
  const fres = analisis.diasDesdeUltimoLapso == null ? 0 : clamp(1 - analisis.diasDesdeUltimoLapso / c.frescuraDiasMax, 0, 1);
  comp.push({ clave: 'frescura', obtenido: fres * c.pesos.frescura, max: c.pesos.frescura, accion: 'Inclúyelo en tu próximo corte para refrescar su ritmo de venta.' });
  const hist = clamp(analisis.lapsosEnVentana / c.historialLapsosPleno, 0, 1);
  comp.push({ clave: 'historial', obtenido: hist * c.pesos.historial, max: c.pesos.historial, accion: 'Con un par de cortes más su historial será sólido.' });
  const cons = analisis.consistencia == null ? c.consistenciaNeutral : analisis.consistencia;
  comp.push({ clave: 'consistencia', obtenido: cons * c.pesos.consistencia, max: c.pesos.consistencia, accion: 'Sus ventas varían mucho entre cortes; registra sus cantidades con cuidado.' });
  const ultimaCompra = compras.filter((x) => x.productoId === producto.id).reduce((max, x) => (!max || x.fecha > max ? x.fecha : max), null);
  const diasPrecio = ultimaCompra ? diasEntre(ultimaCompra, hoy) : null;
  const prec = diasPrecio == null ? 0 : diasPrecio <= c.precioDiasPleno ? 1 : clamp(1 - (diasPrecio - c.precioDiasPleno) / (c.precioDiasMax - c.precioDiasPleno), 0, 1);
  comp.push({ clave: 'precio', obtenido: prec * c.pesos.precio, max: c.pesos.precio, accion: 'Sube el ticket de tu última compra para actualizar su costo.' });
  const anc = producto.ultimoConteo && diasEntre(producto.ultimoConteo, hoy) <= c.anclajeDias ? 1 : 0;
  comp.push({ clave: 'anclaje', obtenido: anc * c.pesos.anclaje, max: c.pesos.anclaje, accion: 'Cuenta su existencia física en tu próximo corte.' });
  let puntos = comp.reduce((s, x) => s + x.obtenido, 0);
  const cambioBrusco = analisis.r < config.tendencia.rangoEstable[0] || analisis.r > config.tendencia.rangoEstable[1];
  if (cambioBrusco && analisis.tieneHistorial) puntos -= c.penalizacionCambioBrusco;
  puntos = clamp(Math.round(puntos), 0, 100);
  const peor = comp.reduce((max, x) => ((x.max - x.obtenido) > (max.max - max.obtenido) ? x : max), comp[0]);
  const etiqueta = puntos >= c.umbralAlta ? 'Alta precisión' : puntos >= c.umbralMedia ? 'Aproximada' : 'Estimación';
  return { puntos, etiqueta, componentes: comp, accion: peor.accion, cambioBrusco };
}

/* --- Índice de Calidad de Datos --- */
function calcularICD(datos, hoy, config) {
  const c = config.icd;
  const { cortes, compras, ventasDiarias, productos, pedidos } = datos;
  const fechasCorte = cortes.map((x) => x.fechaFin).sort();
  const gaps = [];
  for (let i = 1; i < fechasCorte.length; i++) gaps.push(diasEntre(fechasCorte[i - 1], fechasCorte[i]));
  const cadencia = gaps.length ? Math.max(1, mediana(gaps)) : c.cadenciaDefecto;
  const diasSinCorte = fechasCorte.length ? diasEntre(fechasCorte[fechasCorte.length - 1], hoy) : 999;
  const comp = [];
  const rc = clamp(1 - Math.max(0, diasSinCorte - cadencia) / (2 * cadencia), 0, 1);
  comp.push({ clave: 'recenciaCorte', texto: 'Registrar tu corte', obtenido: rc * c.pesos.recenciaCorte, max: c.pesos.recenciaCorte });
  const ultTicket = compras.reduce((max, x) => (!max || x.fecha > max ? x.fecha : max), null);
  const dTicket = ultTicket ? diasEntre(ultTicket, hoy) : 999;
  const rt = dTicket <= c.ticketDiasPleno ? 1 : clamp(1 - (dTicket - c.ticketDiasPleno) / (c.ticketDiasCero - c.ticketDiasPleno), 0, 1);
  comp.push({ clave: 'recenciaTicket', texto: 'Subir el ticket de tu último surtido', obtenido: rt * c.pesos.recenciaTicket, max: c.pesos.recenciaTicket });
  const diasConVenta = new Set(ventasDiarias.filter((v) => diasEntre(v.fecha, hoy) < c.ventanaCobertura && v.fecha <= hoy).map((v) => v.fecha)).size;
  comp.push({ clave: 'coberturaVentas', texto: 'Capturar tus ventas de cada día', obtenido: (diasConVenta / c.ventanaCobertura) * c.pesos.coberturaVentas, max: c.pesos.coberturaVentas });
  const monitoreados = productos.filter((p) => p.monitoreado);
  let alDia = 0;
  monitoreados.forEach((p) => {
    const tiene = datos.ventasProducto.some((v) => v.productoId === p.id && diasEntre(v.fechaFin, hoy) <= c.monitoreadoVentanaDias);
    if (tiene) alDia++;
  });
  const rm = monitoreados.length ? alDia / monitoreados.length : 0.5;
  comp.push({ clave: 'monitoreadosAlDia', texto: 'Actualizar tus productos monitoreados en el corte', obtenido: rm * c.pesos.monitoreadosAlDia, max: c.pesos.monitoreadosAlDia });
  const conteoReciente = productos.some((p) => p.ultimoConteo && diasEntre(p.ultimoConteo, hoy) <= c.cierreLoopDias);
  const pedidoReciente = (pedidos || []).some((p) => p.fechaRecibido && diasEntre(p.fechaRecibido, hoy) <= c.cierreLoopDias);
  comp.push({ clave: 'cierreLoop', texto: 'Confirmar un pedido o contar un producto', obtenido: (conteoReciente || pedidoReciente ? 1 : 0) * c.pesos.cierreLoop, max: c.pesos.cierreLoop });
  const puntos = clamp(Math.round(comp.reduce((s, x) => s + x.obtenido, 0)), 0, 100);
  return { puntos, componentes: comp, cadencia, diasSinCorte };
}

function etiquetaEstado(puntos, config) {
  const u = config.umbralEstado;
  if (puntos >= u.excelente) return { texto: 'Excelente', color: 'emerald' };
  if (puntos >= u.buena) return { texto: 'Buena', color: 'lime' };
  if (puntos >= u.regular) return { texto: 'Necesita actualización', color: 'amber' };
  return { texto: 'Información insuficiente', color: 'rose' };
}

/* --- Estado de Salud de la Tienda --- */
function calcularSalud(icd, datos, config) {
  const s = config.salud;
  const volumen = clamp(datos.cortes.length / s.cortesPleno, 0, 1);
  const catalogo = clamp(datos.productos.filter((p) => p.monitoreado).length / s.monitoreadosPleno, 0, 1);
  const puntos = clamp(Math.round(icd.puntos * s.pesoICD + volumen * 100 * s.pesoVolumen + catalogo * 100 * s.pesoCatalogo), 0, 100);
  const acciones = [];
  const deficitICD = [...icd.componentes].sort((a, b) => (b.max - b.obtenido) - (a.max - a.obtenido));
  deficitICD.slice(0, 2).forEach((d) => {
    const gana = Math.round((d.max - d.obtenido) * s.pesoICD);
    if (gana >= 3) acciones.push({ texto: d.texto, gana });
  });
  if (volumen < 1 && acciones.length < 2) acciones.push({ texto: 'Sigue registrando cortes; con más semanas el análisis mejora solo', gana: Math.round((1 - volumen) * 100 * s.pesoVolumen) });
  if (catalogo < 1 && acciones.length < 2) acciones.push({ texto: 'Monitorea tus productos más vendidos', gana: Math.round((1 - catalogo) * 100 * s.pesoCatalogo) });
  return { puntos, acciones: acciones.slice(0, 2), volumen, catalogo };
}

/* --- Detector de duplicados por puntaje --- */
const normalizarNombre = (n) => String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();

function detectarDuplicado(candidato, lotesPrevios, hoy, config) {
  const c = config.duplicados;
  let mejor = null;
  lotesPrevios.forEach((lote) => {
    if (diasEntre(lote.fecha, hoy) > c.ventanaDias) return;
    let score = 0, senales = 0;
    if (candidato.proveedor && lote.proveedor && normalizarNombre(candidato.proveedor) === normalizarNombre(lote.proveedor)) { score += c.pesos.proveedor; senales++; }
    const dFecha = Math.abs(diasEntre(lote.fecha, candidato.fecha));
    if (dFecha <= c.fechaMaxDias) { score += c.pesos.fecha * (1 - dFecha / (c.fechaMaxDias + 1)); senales++; }
    if (candidato.total > 0 && lote.total > 0) {
      const dif = Math.abs(candidato.total - lote.total) / Math.max(candidato.total, lote.total);
      if (dif <= c.totalTolerancia) { score += c.pesos.total * (1 - dif / c.totalTolerancia); senales++; }
    }
    const setA = new Set(candidato.nombres.map(normalizarNombre));
    const setB = new Set(lote.nombres.map(normalizarNombre));
    if (setA.size && setB.size) {
      let inter = 0;
      setA.forEach((n) => { if (setB.has(n)) inter++; });
      const jac = inter / (setA.size + setB.size - inter);
      if (jac >= c.jaccardMin) { score += c.pesos.productos * jac; senales++; }
    }
    if (senales >= c.minSenales && score >= c.umbral && (!mejor || score > mejor.score)) mejor = { score, lote };
  });
  return mejor;
}

function agruparLotesCompras(compras, pedidos, hoy, config) {
  const lotes = {};
  compras.forEach((cp) => {
    if (diasEntre(cp.fecha, hoy) > config.duplicados.ventanaDias) return;
    const clave = cp.loteId || cp.origenPedidoId || 'fecha-' + cp.fecha;
    if (!lotes[clave]) lotes[clave] = { fecha: cp.fecha, total: 0, nombres: [], proveedor: cp.proveedor || null, descripcion: 'compras del ' + formatoFechaCorta(cp.fecha) };
    lotes[clave].total += cp.total || 0;
    lotes[clave].nombres.push(cp.productoNombre);
    if (cp.proveedor && !lotes[clave].proveedor) lotes[clave].proveedor = cp.proveedor;
  });
  const lista = Object.values(lotes);
  (pedidos || []).forEach((pd) => {
    if (!pd.fechaRecibido || diasEntre(pd.fechaRecibido, hoy) > config.duplicados.ventanaDias) return;
    lista.push({ fecha: pd.fechaRecibido, total: pd.totalRecibido || pd.totalEstimado || 0, nombres: pd.items.map((i) => i.nombre), proveedor: pd.proveedor, descripcion: 'pedido a ' + pd.proveedor + ' del ' + formatoFechaCorta(pd.fechaRecibido) });
  });
  return lista;
}

/* --- Ajuste personal aprendido de pedidos confirmados --- */
function calcularFactorPersonal(muestras, config) {
  const a = config.ajustePersonal;
  if (!muestras || muestras.length < a.minMuestras) return 1;
  const ultimas = muestras.slice(-a.minMuestras);
  const todasArriba = ultimas.every((m) => m > 1 + a.umbralDesvio);
  const todasAbajo = ultimas.every((m) => m < 1 - a.umbralDesvio);
  if (!todasArriba && !todasAbajo) return 1;
  return clamp(mediana(ultimas), a.rango[0], a.rango[1]);
}

/* --- Bitácora: entrada semanal local por plantillas --- */
function generarEntradaBitacora(datos, fechaInicio, fechaFin, config, saludActual) {
  const inicioD = new Date(fechaInicio + 'T00:00:00');
  const finD = new Date(fechaFin + 'T23:59:59');
  const prevInicio = sumarDias(fechaInicio, -7);
  const prevFin = sumarDias(fechaInicio, -1);
  const t = calcularTotalesPeriodo(datos, inicioD, finD);
  const tPrev = calcularTotalesPeriodo(datos, new Date(prevInicio + 'T00:00:00'), new Date(prevFin + 'T23:59:59'));
  const hayRegistros = t.ingresos > 0 || t.vpPeriodo.length > 0 || datos.compras.some((c) => c.fecha >= fechaInicio && c.fecha <= fechaFin);
  if (!hayRegistros) {
    return { id: generarId(), tipo: 'vacio', fechaInicio, fechaFin, texto: 'Sin registros del ' + formatoFechaCorta(fechaInicio) + ' al ' + formatoFechaCorta(fechaFin) + '.', snapshot: null, generadoEn: hoyISO() };
  }
  const frases = [];
  if (tPrev.ingresos > 0) {
    const delta = ((t.ingresos - tPrev.ingresos) / tPrev.ingresos) * 100;
    const dir = delta >= 1 ? 'un ' + Math.abs(delta).toFixed(0) + '% más que la semana anterior' : delta <= -1 ? 'un ' + Math.abs(delta).toFixed(0) + '% menos que la semana anterior' : 'casi igual que la semana anterior';
    frases.push('Vendiste ' + formatoMoneda(t.ingresos) + ' esta semana, ' + dir + '.');
  } else {
    frases.push('Vendiste ' + formatoMoneda(t.ingresos) + ' esta semana.');
  }
  frases.push('Tu utilidad estimada fue ' + formatoMoneda(t.utilidadNeta) + (tPrev.ingresos > 0 ? (t.utilidadNeta >= tPrev.utilidadNeta ? ' (mejor que la anterior)' : ' (menor que la anterior)') : '') + '.');
  const velSemana = {}, velPrev = {};
  datos.ventasProducto.forEach((v) => {
    const dur = Math.max(1, diasEntre(v.fechaInicio, v.fechaFin) + 1);
    if (v.fechaFin >= fechaInicio && v.fechaFin <= fechaFin) velSemana[v.productoNombre] = (velSemana[v.productoNombre] || 0) + v.cantidad / dur;
    if (v.fechaFin >= prevInicio && v.fechaFin <= prevFin) velPrev[v.productoNombre] = (velPrev[v.productoNombre] || 0) + v.cantidad / dur;
  });
  const subieron = [], bajaron = [];
  Object.keys(velSemana).forEach((n) => {
    if (velPrev[n] > 0) {
      const ratio = velSemana[n] / velPrev[n];
      if (ratio >= 1.25) subieron.push({ n, ratio });
      if (ratio <= 0.75) bajaron.push({ n, ratio });
    }
  });
  subieron.sort((a, b) => b.ratio - a.ratio);
  bajaron.sort((a, b) => a.ratio - b.ratio);
  if (subieron.length) frases.push('Se movieron más: ' + subieron.slice(0, config.bitacora.topMovimientos).map((x) => x.n).join(', ') + '.');
  if (bajaron.length) frases.push('Se enfriaron: ' + bajaron.slice(0, config.bitacora.topMovimientos).map((x) => x.n).join(', ') + '.');
  const costosPrevios = {};
  datos.compras.filter((c) => c.fecha < fechaInicio).forEach((c) => { if (!costosPrevios[c.productoNombre] || c.fecha > costosPrevios[c.productoNombre].fecha) costosPrevios[c.productoNombre] = c; });
  const alzasCosto = [];
  datos.compras.filter((c) => c.fecha >= fechaInicio && c.fecha <= fechaFin).forEach((c) => {
    const prev = costosPrevios[c.productoNombre];
    if (prev && prev.costoUnitario > 0 && c.costoUnitario > prev.costoUnitario * (1 + config.bitacora.cambioCostoMin)) {
      alzasCosto.push(c.productoNombre + ' subió ' + Math.round(((c.costoUnitario - prev.costoUnitario) / prev.costoUnitario) * 100) + '%');
    }
  });
  if (alzasCosto.length) frases.push('Ojo con costos: ' + alzasCosto.slice(0, 2).join('; ') + '.');
  if (t.totalMerma > 0) frases.push('Perdiste ' + formatoMoneda(t.totalMerma) + ' en mermas.');
  if (t.fiadoOtorgado > 0 || t.fiadoCobrado > 0) frases.push('Fiado: prestaste ' + formatoMoneda(t.fiadoOtorgado) + ' y cobraste ' + formatoMoneda(t.fiadoCobrado) + '.');
  return {
    id: generarId(), tipo: 'semana', fechaInicio, fechaFin,
    texto: frases.join(' '),
    snapshot: { ventas: +t.ingresos.toFixed(2), utilidad: +t.utilidadNeta.toFixed(2), merma: +t.totalMerma.toFixed(2), fiadoNeto: +(t.fiadoOtorgado - t.fiadoCobrado).toFixed(2), salud: saludActual != null ? saludActual : null },
    generadoEn: hoyISO(),
  };
}

function generarBitacoraFaltante(datos, bitacoraActual, hoy, config, saludActual) {
  const nuevas = [];
  const ayer = sumarDias(hoy, -1);
  let cursor;
  const conFecha = bitacoraActual.filter((b) => b.fechaFin);
  if (conFecha.length) {
    const ultima = conFecha.reduce((max, b) => (b.fechaFin > max ? b.fechaFin : max), conFecha[0].fechaFin);
    cursor = sumarDias(ultima, 1);
  } else {
    cursor = sumarDias(hoy, -7);
  }
  let guard = 0;
  while (diasEntre(cursor, ayer) >= 6 && guard < 12) {
    const fin = sumarDias(cursor, 6);
    nuevas.push(generarEntradaBitacora(datos, cursor, fin, config, saludActual));
    cursor = sumarDias(fin, 1);
    guard++;
  }
  return nuevas;
}

/* --- Cadencia y día de hábito del usuario --- */
function habitosDeCortes(cortes, hoy) {
  const fechas = cortes.map((c) => c.fechaRegistro || c.fechaFin).sort();
  const gaps = [];
  for (let i = 1; i < fechas.length; i++) gaps.push(diasEntre(fechas[i - 1], fechas[i]));
  const cadencia = gaps.length ? Math.max(1, mediana(gaps)) : MOTOR_CONFIG.icd.cadenciaDefecto;
  const cuentaDias = {};
  fechas.forEach((f) => { const d = new Date(f + 'T12:00:00').getDay(); cuentaDias[d] = (cuentaDias[d] || 0) + 1; });
  let diaModal = null, maxC = 0;
  Object.entries(cuentaDias).forEach(([d, n]) => { if (n > maxC && n >= 2) { maxC = n; diaModal = parseInt(d); } });
  const diasSinCorte = fechas.length ? diasEntre(fechas[fechas.length - 1], hoy) : null;
  return { cadencia, diaModal, diasSinCorte };
}

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/* --- Migraciones de datos al cargar --- */
function migrarProductos(productos, cortes, hoy) {
  const ancla = cortes && cortes.length ? cortes[0].fechaFin : hoy;
  let cambio = false;
  const migrados = productos.map((p) => {
    if (p.stockFecha !== undefined && p.creadoEn !== undefined && p.ultimoConteo !== undefined && p.ventaSemanalEstimada !== undefined) return p;
    cambio = true;
    return { ...p, stockFecha: p.stockFecha || ancla, creadoEn: p.creadoEn !== undefined ? p.creadoEn : null, ultimoConteo: p.ultimoConteo !== undefined ? p.ultimoConteo : null, ventaSemanalEstimada: p.ventaSemanalEstimada !== undefined ? p.ventaSemanalEstimada : null };
  });
  return { migrados, cambio };
}

const CATEGORIAS_PRODUCTO = ['Bebidas', 'Botanas', 'Panadería', 'Abarrotes básicos', 'Lácteos', 'Limpieza', 'Cigarros', 'Otros'];
const CATEGORIAS_GASTO = ['Renta', 'Servicios', 'Sueldos', 'Transporte', 'Mercancía extra', 'Otros'];
const UNIDADES = ['pieza', 'kg', 'litro', 'paquete', 'caja', 'cajetilla'];

/* ======================= Datos de ejemplo ======================= */

const PRODUCTOS_SEED = [
  { id: 'p1', nombre: 'Coca-Cola 600ml', categoria: 'Bebidas', costo: 14, precio: 20, stock: 24, stockMinimo: 12, unidad: 'pieza', proveedor: 'Distribuidora FEMSA', ivaExento: false, monitoreado: true },
  { id: 'p2', nombre: 'Agua Ciel 1L', categoria: 'Bebidas', costo: 8, precio: 13, stock: 30, stockMinimo: 15, unidad: 'pieza', proveedor: 'Distribuidora FEMSA', ivaExento: true, monitoreado: false },
  { id: 'p3', nombre: 'Sabritas Original 45g', categoria: 'Botanas', costo: 9, precio: 15, stock: 20, stockMinimo: 15, unidad: 'pieza', proveedor: 'Grupo PepsiCo', ivaExento: false, monitoreado: true },
  { id: 'p4', nombre: 'Doritos Nacho 62g', categoria: 'Botanas', costo: 12, precio: 19, stock: 15, stockMinimo: 12, unidad: 'pieza', proveedor: 'Grupo PepsiCo', ivaExento: false, monitoreado: false },
  { id: 'p5', nombre: 'Pan Blanco Grande', categoria: 'Panadería', costo: 32, precio: 42, stock: 8, stockMinimo: 6, unidad: 'pieza', proveedor: 'Bimbo', ivaExento: true, monitoreado: true },
  { id: 'p6', nombre: 'Pastelito Gansito', categoria: 'Panadería', costo: 10, precio: 15, stock: 18, stockMinimo: 12, unidad: 'pieza', proveedor: 'Bimbo', ivaExento: false, monitoreado: false },
  { id: 'p7', nombre: 'Maseca 1kg', categoria: 'Abarrotes básicos', costo: 16, precio: 22, stock: 25, stockMinimo: 10, unidad: 'pieza', proveedor: 'Grupo Gruma', ivaExento: true, monitoreado: false },
  { id: 'p8', nombre: 'Arroz 1kg', categoria: 'Abarrotes básicos', costo: 18, precio: 24, stock: 20, stockMinimo: 10, unidad: 'pieza', proveedor: 'Distribuidora Local', ivaExento: true, monitoreado: false },
  { id: 'p9', nombre: 'Frijol Negro 1kg', categoria: 'Abarrotes básicos', costo: 22, precio: 28, stock: 15, stockMinimo: 8, unidad: 'pieza', proveedor: 'Distribuidora Local', ivaExento: true, monitoreado: false },
  { id: 'p10', nombre: 'Aceite 1L', categoria: 'Abarrotes básicos', costo: 28, precio: 36, stock: 12, stockMinimo: 8, unidad: 'pieza', proveedor: 'Distribuidora Local', ivaExento: true, monitoreado: false },
  { id: 'p11', nombre: 'Azúcar Estándar 1kg', categoria: 'Abarrotes básicos', costo: 19, precio: 25, stock: 3, stockMinimo: 10, unidad: 'pieza', proveedor: 'Distribuidora Local', ivaExento: true, monitoreado: true },
  { id: 'p12', nombre: 'Leche Entera 1L', categoria: 'Lácteos', costo: 20, precio: 26, stock: 10, stockMinimo: 12, unidad: 'pieza', proveedor: 'Lala', ivaExento: true, monitoreado: true },
  { id: 'p13', nombre: 'Huevo 18pz', categoria: 'Lácteos', costo: 48, precio: 58, stock: 6, stockMinimo: 8, unidad: 'paquete', proveedor: 'Distribuidora Local', ivaExento: true, monitoreado: true },
  { id: 'p14', nombre: 'Jabón de Tocador 400g', categoria: 'Limpieza', costo: 12, precio: 18, stock: 14, stockMinimo: 10, unidad: 'pieza', proveedor: 'Grupo Roma', ivaExento: false, monitoreado: false },
  { id: 'p15', nombre: 'Cloro 1L', categoria: 'Limpieza', costo: 15, precio: 22, stock: 16, stockMinimo: 10, unidad: 'pieza', proveedor: 'Grupo Roma', ivaExento: false, monitoreado: false },
  { id: 'p16', nombre: 'Cigarros (cajetilla)', categoria: 'Cigarros', costo: 42, precio: 55, stock: 20, stockMinimo: 15, unidad: 'cajetilla', proveedor: 'Distribuidora Local', ivaExento: false, monitoreado: false },
];

function generarVentasDiariasIniciales() {
  const ventas = [];
  for (let d = 42; d >= 3; d--) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - d);
    const finde = [0, 6].includes(fecha.getDay());
    const fechaISO = fecha.toISOString().split('T')[0];
    let base = 900 + Math.random() * 500;
    if (finde) base *= 1.3;
    ventas.push({ id: generarId(), fecha: fechaISO, monto: Math.round(base) });
  }
  return ventas;
}

function generarVentasProductoIniciales(productosSeed) {
  const monitoreados = productosSeed.filter((p) => p.monitoreado);
  const registros = [];
  const cortesGenerados = [];
  let cursor = sumarDias(hoyISO(), -42);
  const limite = sumarDias(hoyISO(), -3);
  while (cursor <= limite) {
    const largoLapso = 2 + Math.floor(Math.random() * 2);
    const fechaInicioLapso = cursor;
    let fechaFinLapso = sumarDias(cursor, largoLapso - 1);
    if (fechaFinLapso > limite) fechaFinLapso = limite;
    monitoreados.forEach((p) => {
      if (Math.random() < 0.85) {
        const cantidad = Math.max(1, Math.round(3 + Math.random() * 8));
        registros.push({
          id: generarId(), fechaInicio: fechaInicioLapso, fechaFin: fechaFinLapso,
          productoId: p.id, productoNombre: p.nombre, cantidad,
          precioUnitario: p.precio, costoUnitario: p.costo,
        });
      }
    });
    cortesGenerados.push({ id: generarId(), fechaInicio: fechaInicioLapso, fechaFin: fechaFinLapso, fechaRegistro: fechaFinLapso });
    cursor = sumarDias(fechaFinLapso, 1);
  }
  return { registros, cortes: cortesGenerados };
}

function generarComprasIniciales(productosSeed) {
  const monitoreados = productosSeed.filter((p) => p.monitoreado);
  const compras = [];
  let cursor = sumarDias(hoyISO(), -38);
  const limite = sumarDias(hoyISO(), -4);
  while (cursor <= limite) {
    monitoreados.forEach((p) => {
      if (Math.random() < 0.3) {
        const cantidad = Math.max(4, Math.round(8 + Math.random() * 10));
        compras.push({
          id: generarId(), fecha: cursor, productoId: p.id, productoNombre: p.nombre,
          cantidad, costoUnitario: p.costo, total: +(cantidad * p.costo).toFixed(2),
        });
      }
    });
    cursor = sumarDias(cursor, 4 + Math.floor(Math.random() * 3));
  }
  return compras;
}

function generarGastosIniciales() {
  const gastos = [];
  [0, -1].forEach((offset) => {
    const base = inicioMes(offset);
    const mes = base.getMonth(), anio = base.getFullYear();
    const items = [
      { categoria: 'Renta', descripcion: 'Renta del local', monto: 4500, dia: 1 },
      { categoria: 'Servicios', descripcion: 'CFE (luz)', monto: 850 + Math.round(Math.random() * 300), dia: 5 },
      { categoria: 'Servicios', descripcion: 'Agua', monto: 180 + Math.round(Math.random() * 80), dia: 6 },
      { categoria: 'Servicios', descripcion: 'Internet y teléfono', monto: 399, dia: 10 },
      { categoria: 'Sueldos', descripcion: 'Ayudante de tienda', monto: 3500, dia: 15 },
      { categoria: 'Transporte', descripcion: 'Gasolina para surtir', monto: 400 + Math.round(Math.random() * 300), dia: 12 },
      { categoria: 'Otros', descripcion: 'Bolsas y empaque', monto: 150 + Math.round(Math.random() * 100), dia: 20 },
    ];
    items.forEach((it) => {
      const fecha = new Date(anio, mes, it.dia);
      if (fecha <= new Date()) {
        gastos.push({ id: generarId(), fecha: fecha.toISOString().split('T')[0], categoria: it.categoria, descripcion: it.descripcion, monto: it.monto });
      }
    });
  });
  return gastos;
}

function generarFiadosIniciales() {
  return [
    { id: generarId(), fecha: sumarDias(hoyISO(), -10), cliente: 'Doña Carmen', monto: 150, cobrado: true, fechaCobro: sumarDias(hoyISO(), -4) },
    { id: generarId(), fecha: sumarDias(hoyISO(), -3), cliente: 'Don Refugio', monto: 220, cobrado: false, fechaCobro: null },
  ];
}

function generarMermasIniciales() {
  return [
    { id: generarId(), fecha: sumarDias(hoyISO(), -15), productoNombre: 'Pan Blanco Grande', motivo: 'Caducó, no se vendió a tiempo', valorEstimado: 64 },
  ];
}

function generarInformeSemanalInicial() {
  return [{
    id: generarId(),
    fechaInicio: sumarDias(hoyISO(), -14),
    fechaFin: sumarDias(hoyISO(), -7),
    texto: 'Esta semana vendiste alrededor de $7,200, con una utilidad neta cercana a $1,850. Lo que más te dejó fue Coca-Cola y Huevo. Ojo: el Pan Blanco se te echó a perder una vez, revisa cuánto pides de ese producto. La Azúcar sigue bajando de existencia rápido, conviene subir tu stock mínimo. En general la semana estuvo sana y tu flujo de efectivo fue positivo.',
    generadoEn: sumarDias(hoyISO(), -7),
  }];
}

/* ======================= Almacenamiento ======================= */

const STORAGE_PREFIX = 'tiendasmart:';

async function cargarTodo() {
  const claves = ['productos', 'ventasDiarias', 'ventasProducto', 'gastos', 'compras', 'fiados', 'mermas', 'cortes', 'informes', 'oportunidadesZona', 'config', 'pedidos', 'bitacora', 'ajustesPersonales', 'icdSnapshot'];
  const resultado = {};
  claves.forEach((c) => { resultado[c] = null; });
  claves.forEach((clave) => {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + clave);
      if (raw != null) resultado[clave] = JSON.parse(raw);
    } catch (e) { /* aún no existe o dato corrupto */ }
  });
  return resultado;
}

async function guardar(clave, valor) {
  try {
    localStorage.setItem(STORAGE_PREFIX + clave, JSON.stringify(valor));
  } catch (e) {
    console.error('Error guardando ' + clave, e);
  }
}

/* ======================= Piezas de UI ======================= */

const claseInput = 'w-full border border-stone-200 rounded-xl px-3 py-2.5 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent';

function Campo({ etiqueta, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-stone-500 mb-1">{etiqueta}</span>
      {children}
    </label>
  );
}

function Modal({ titulo, onCerrar, children }) {
  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-stone-900">{titulo}</h3>
          <button onClick={onCerrar} className="p-1 text-stone-400"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FilaRecibo({ etiqueta, valor, tono }) {
  const color = tono === 'positivo' ? 'text-emerald-700' : tono === 'negativo' ? 'text-rose-600' : 'text-stone-900';
  return (
    <div className="flex items-baseline mb-1.5">
      <span className="text-sm text-stone-500">{etiqueta}</span>
      <span className="flex-1 border-b border-dotted border-stone-300 mx-2 mb-1"></span>
      <span className={`font-mono-num text-sm font-semibold ${color} shrink-0`}>{valor}</span>
    </div>
  );
}

function Encabezado({ nombreNegocio, onConfig }) {
  return (
    <header className="bg-emerald-800 text-white">
      <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center justify-between">
        <div>
          <p className="text-emerald-200 text-2xs tracking-widest uppercase font-medium">TiendaSmart</p>
          <h1 className="font-display font-bold text-lg leading-tight">{nombreNegocio}</h1>
        </div>
        <button onClick={onConfig} className="p-2 rounded-full bg-emerald-700/60 text-emerald-100">
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}

function NavInferior({ tab, setTab, alertasCompras }) {
  const items = [
    { id: 'inicio', icono: Home, etiqueta: 'Inicio' },
    { id: 'inventario', icono: Package, etiqueta: 'Stock' },
    { id: 'finanzas', icono: DollarSign, etiqueta: 'Finanzas' },
    { id: 'precios', icono: Calculator, etiqueta: 'Precios' },
    { id: 'compras', icono: ShoppingCart, etiqueta: 'Compras' },
    { id: 'zona', icono: MapPin, etiqueta: 'Zona' },
    { id: 'anaqueles', icono: Camera, etiqueta: 'Anaqueles' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-40">
      <div className="max-w-lg mx-auto grid grid-cols-7">
        {items.map((it) => {
          const activo = tab === it.id;
          const Icono = it.icono;
          return (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 ${activo ? 'text-emerald-700' : 'text-stone-400'}`}
            >
              <Icono size={18} strokeWidth={activo ? 2.5 : 2} />
              <span className="text-2xs font-medium">{it.etiqueta}</span>
              {it.id === 'compras' && alertasCompras > 0 && (
                <span className="absolute top-1 right-3 w-2 h-2 bg-orange-600 rounded-full"></span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ======================= Tab: Inicio ======================= */

function TabInicio({ productos, ventasDiarias, ventasProducto, gastos, compras, fiados, mermas, cortes, bitacora, onRegistrarCorte, onRegistrarGasto, onIrAFinanzas }) {
  const hoy = hoyISO();
  const ventaHoyEntry = ventasDiarias.find((v) => v.fecha === hoy);
  const datos = { ventasDiarias, ventasProducto, gastos, compras, fiados, mermas };
  const totalesMes = calcularTotalesPeriodo(datos, inicioMes(0), finMes(0));

  const dias = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    const entrada = ventasDiarias.find((v) => v.fecha === iso);
    dias.push({ fecha: formatoFechaCorta(iso), total: entrada ? entrada.monto : 0 });
  }

  const ingresosPorProducto = {};
  totalesMes.vpPeriodo.forEach((v) => {
    ingresosPorProducto[v.productoNombre] = (ingresosPorProducto[v.productoNombre] || 0) + v.cantidad * v.precioUnitario;
  });
  const topProductos = Object.entries(ingresosPorProducto)
    .map(([nombre, ingresos]) => ({ nombre, ingresos }))
    .sort((a, b) => b.ingresos - a.ingresos)
    .slice(0, 5);

  const productosBajoStock = productos.filter((p) => p.stock <= p.stockMinimo);

  const ultimoCorte = cortes[0];
  const diasDesdeCorte = ultimoCorte ? diasEntre(ultimoCorte.fechaFin, hoy) : null;
  const habitos = habitosDeCortes(cortes, hoy);
  const corteVencido = diasDesdeCorte === null || diasDesdeCorte >= 3;
  const hoyDiaSemana = new Date(hoy + 'T12:00:00').getDay();
  const sinCorteHoy = !cortes.some((c) => (c.fechaRegistro || c.fechaFin) === hoy);
  const esDiaDeHabito = habitos.diaModal != null && habitos.diaModal === hoyDiaSemana && sinCorteHoy && (habitos.diasSinCorte == null || habitos.diasSinCorte >= habitos.cadencia);
  const ultimaEntradaBit = (bitacora || []).find((b) => b.tipo === 'semana' || b.tipo === 'informe-legado');
  const bitacoraNueva = ultimaEntradaBit && diasEntre(ultimaEntradaBit.fechaFin, hoy) <= 8;

  return (
    <div className="space-y-4 pb-4">
      <div className="bg-white rounded-xl shadow-sm border-t-4 border-dashed border-emerald-700 px-5 pt-4 pb-3">
        <p className="font-display text-center text-2xs tracking-widest text-stone-400 uppercase mb-3">Corte de caja · Hoy</p>
        <FilaRecibo etiqueta="Ventas de hoy" valor={ventaHoyEntry ? formatoMoneda(ventaHoyEntry.monto) : 'Sin registrar'} />
        <FilaRecibo etiqueta="Ventas del mes" valor={formatoMoneda(totalesMes.ingresos)} />
        <FilaRecibo etiqueta="Utilidad neta del mes" valor={formatoMoneda(totalesMes.utilidadNeta)} tono={totalesMes.utilidadNeta >= 0 ? 'positivo' : 'negativo'} />
        <FilaRecibo etiqueta="Flujo de efectivo del mes" valor={formatoMoneda(totalesMes.flujoEfectivo)} tono={totalesMes.flujoEfectivo >= 0 ? 'positivo' : 'negativo'} />
        <p className="text-center text-2xs text-stone-300 mt-3 border-t border-dashed border-stone-200 pt-2">
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onRegistrarCorte} className="bg-emerald-700 text-white rounded-xl py-3 font-medium flex items-center justify-center gap-2 active:bg-emerald-800">
          <ClipboardList size={18} /> Registrar corte
        </button>
        <button onClick={onRegistrarGasto} className="bg-white border border-stone-200 text-stone-700 rounded-xl py-3 font-medium flex items-center justify-center gap-2 active:bg-stone-50">
          <Minus size={18} /> Registrar gasto
        </button>
      </div>

      {(corteVencido || esDiaDeHabito) && (
        <button onClick={onRegistrarCorte} className="w-full bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-left active:bg-amber-100">
          <ClipboardList size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            {esDiaDeHabito
              ? `Sueles registrar los ${NOMBRES_DIA[habitos.diaModal]}. Capturar hoy mantiene la precisión de tus recomendaciones.`
              : `${ultimoCorte ? `Han pasado ${diasDesdeCorte} días desde tu último corte.` : 'Aún no has registrado ningún corte.'} Toca para registrar ahora.`}
          </p>
        </button>
      )}

      {bitacoraNueva && (
        <button onClick={onIrAFinanzas} className="w-full bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-start gap-2 text-left active:bg-orange-100">
          <BookOpen size={18} className="text-orange-600 mt-0.5 shrink-0" />
          <p className="text-sm text-orange-800">Tu bitácora tiene una nueva entrada de esta semana. Léela en Finanzas.</p>
        </button>
      )}

      {productosBajoStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            {productosBajoStock.length} producto{productosBajoStock.length > 1 ? 's' : ''} con stock bajo. Revisa la pestaña Compras.
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <p className="font-display font-semibold text-stone-800 mb-2 text-sm">Ventas · últimos 14 días</p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={dias}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
            <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#78716c' }} interval={2} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#78716c' }} width={36} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => formatoMoneda(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Line type="monotone" dataKey="total" stroke="#047857" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {topProductos.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="font-display font-semibold text-stone-800 mb-2 text-sm">Más vendidos · este mes (monitoreados)</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={topProductos} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="nombre" width={100} tick={{ fontSize: 10, fill: '#44403c' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => formatoMoneda(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="ingresos" fill="#ea580c" radius={[0, 6, 6, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ======================= Tab: Inventario ======================= */

function TabInventario({ productos, onNuevoProducto, onEditarProducto, onMarcarReabastecer, onAgregarDesdeEscaneo }) {
  const [busqueda, setBusqueda] = useState('');
  const [imagenPreview, setImagenPreview] = useState(null);
  const [imagenBase64, setImagenBase64] = useState(null);
  const [imagenMediaType, setImagenMediaType] = useState(null);
  const [analizando, setAnalizando] = useState(false);
  const [resultadoScanner, setResultadoScanner] = useState(null);
  const [errorScanner, setErrorScanner] = useState(null);
  const inputFotoRef = useRef(null);

  const productosFiltrados = productos.filter((p) => p.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  const construirDraftNuevo = (item) => {
    const nombreVariante = item.variante_de ? String(item.variante_de).toLowerCase().trim() : null;
    const hermano = nombreVariante ? productos.find((p) => p.nombre.toLowerCase() === nombreVariante) : null;
    const categoriaSugerida = CATEGORIAS_PRODUCTO.includes(item.categoria_sugerida) ? item.categoria_sugerida : CATEGORIAS_PRODUCTO[0];
    return {
      nombre: item.nombre || 'Producto nuevo',
      categoria: hermano ? hermano.categoria : categoriaSugerida,
      costo: hermano ? hermano.costo : '',
      precio: hermano ? hermano.precio : '',
      stock: 0,
      stockMinimo: hermano ? hermano.stockMinimo : 5,
      unidad: hermano ? hermano.unidad : 'pieza',
      proveedor: hermano ? hermano.proveedor : '',
      ivaExento: hermano ? hermano.ivaExento : false,
      monitoreado: hermano ? hermano.monitoreado : false,
      _varianteDe: hermano ? hermano.nombre : null,
    };
  };

  const manejarSeleccionFoto = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setErrorScanner(null);
    setResultadoScanner(null);
    const lector = new FileReader();
    lector.onload = () => {
      setImagenPreview(lector.result);
      setImagenBase64(String(lector.result).split(',')[1]);
      setImagenMediaType(file.type);
    };
    lector.readAsDataURL(file);
  };

  const analizarFoto = async () => {
    if (!imagenBase64) return;
    setAnalizando(true);
    setErrorScanner(null);
    try {
      const listaProductos = productos.map((p) => p.nombre).join(', ');
      const respuesta = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: `Eres un experto en control de inventario para tiendas de abarrotes en México. Analizas fotos de anaqueles y detectas qué productos están bien surtidos, cuáles están bajos de existencia y cuáles parecen agotados o con huecos vacíos en el estante. La tienda suele manejar productos como: ${listaProductos || 'productos de abarrotes en general'}. Si reconoces alguno de estos productos en la foto, usa exactamente ese nombre. Además, identifica productos visibles que NO estén en esa lista: para cada uno, decide si es la misma línea de producto que uno ya existente pero de otro sabor, tamaño o presentación (ejemplo: si ya existe "Sabritas Original 45g" y ves "Sabritas Flamin Hot 45g", es una variante) — en ese caso pon el nombre EXACTO del producto existente en "variante_de"; si es un producto totalmente distinto, deja "variante_de" en null y sugiere una categoría de esta lista: ${CATEGORIAS_PRODUCTO.join(', ')}. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin explicaciones, sin bloques de código markdown, con esta estructura exacta: {"productos_detectados": [{"nombre": "nombre del producto", "estado": "bien_surtido o bajo o agotado"}], "huecos_vacios": numero, "recomendaciones": ["texto breve", "texto breve"], "productos_nuevos": [{"nombre": "nombre del producto nuevo", "variante_de": "nombre exacto o null", "categoria_sugerida": "una categoría de la lista o null"}]}`,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: imagenMediaType, data: imagenBase64 } },
              { type: 'text', text: 'Analiza esta foto del anaquel de mi tienda. Dime qué productos ves, en qué estado están, qué me recomiendas reabastecer, y si hay productos que no tengo en mi catálogo.' },
            ],
          }],
        }),
      });
      const datos = await respuesta.json();
      const texto = (datos.content || []).map((b) => b.text || '').join('');
      const limpio = texto.replace(/```json|```/g, '').trim();
      const parseado = JSON.parse(limpio);
      setResultadoScanner(parseado);
    } catch (e) {
      console.error('Error al analizar foto de anaquel', e);
      setErrorScanner('No se pudo analizar la foto. Intenta de nuevo con mejor luz o más de cerca.');
    } finally {
      setAnalizando(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={16} className="text-orange-600" />
          <p className="font-display font-semibold text-stone-800 text-sm">Escáner de anaquel con IA</p>
        </div>
        <p className="text-xs text-stone-500 mb-3">Toma una foto de tu estante y la IA te dice qué te está faltando.</p>

        {!imagenPreview ? (
          <label htmlFor="foto-anaquel" className="w-full border-2 border-dashed border-stone-300 rounded-xl py-6 flex flex-col items-center gap-2 text-stone-500 active:bg-stone-50 cursor-pointer">
            <Camera size={26} />
            <span className="text-sm font-medium">Tomar o subir foto</span>
          </label>
        ) : (
          <div className="space-y-3">
            <img src={imagenPreview} alt="Anaquel de la tienda" className="w-full rounded-xl max-h-56 object-cover" />
            <div className="flex gap-2">
              <label htmlFor="foto-anaquel" className="flex-1 border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 text-center cursor-pointer">
                Cambiar foto
              </label>
              <button onClick={analizarFoto} disabled={analizando} className="flex-1 bg-orange-600 text-white rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60">
                {analizando ? (<><Loader2 size={16} className="animate-spin" /> Analizando…</>) : (<><Sparkles size={16} /> Analizar con IA</>)}
              </button>
            </div>
          </div>
        )}
        <input id="foto-anaquel" ref={inputFotoRef} type="file" accept="image/*" onClick={(e) => { e.currentTarget.value = null; }} onChange={manejarSeleccionFoto} className="hidden" />

        {errorScanner && <p className="text-sm text-rose-600 mt-3">{errorScanner}</p>}

        {resultadoScanner && (
          <div className="mt-4 space-y-3 border-t border-stone-100 pt-3">
            {resultadoScanner.huecos_vacios > 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                Se ven {resultadoScanner.huecos_vacios} espacio(s) vacío(s) en el anaquel.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {(resultadoScanner.productos_detectados || []).map((p, i) => (
                <div key={i} className={`text-xs px-2.5 py-1.5 rounded-full border flex items-center gap-1.5 ${
                  p.estado === 'agotado' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                  p.estado === 'bajo' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                  'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}>
                  {p.nombre}
                  {p.estado !== 'bien_surtido' && (
                    <button onClick={() => onMarcarReabastecer(p.nombre)} className="underline font-semibold">marcar</button>
                  )}
                </div>
              ))}
            </div>
            {(resultadoScanner.recomendaciones || []).length > 0 && (
              <ul className="text-sm text-stone-600 space-y-1 list-disc list-inside">
                {resultadoScanner.recomendaciones.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
            {(resultadoScanner.productos_nuevos || []).length > 0 && (
              <div className="pt-1">
                <p className="text-xs font-medium text-stone-500 mb-2">Productos nuevos detectados (no están en tu catálogo)</p>
                <div className="space-y-2">
                  {resultadoScanner.productos_nuevos.map((item, i) => {
                    const draft = construirDraftNuevo(item);
                    return (
                      <div key={i} className="flex items-center justify-between border border-stone-100 rounded-xl p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-800 truncate">{draft.nombre}</p>
                          <p className="text-2xs text-stone-400">
                            {draft._varianteDe ? `Mismo precio que ${draft._varianteDe} — se agrega automático` : 'Precio nuevo, lo agregas tú'}
                          </p>
                        </div>
                        <button onClick={() => onAgregarDesdeEscaneo(draft)} className="shrink-0 ml-2 text-xs font-medium bg-emerald-700 text-white rounded-lg px-3 py-1.5 flex items-center gap-1">
                          <Plus size={12} /> Agregar
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="font-display font-semibold text-stone-800 text-sm">Catálogo · {productos.length} productos</p>
        <button onClick={onNuevoProducto} className="text-sm font-medium text-emerald-700 flex items-center gap-1">
          <Plus size={16} /> Nuevo
        </button>
      </div>
      <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto…" className={claseInput} />

      <div className="space-y-2">
        {productosFiltrados.map((p) => {
          const bajo = p.stock <= p.stockMinimo;
          return (
            <button key={p.id} onClick={() => onEditarProducto(p)} className="w-full bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between text-left active:bg-stone-50">
              <div className="min-w-0">
                <p className="font-medium text-stone-800 text-sm truncate">{p.nombre}</p>
                <p className="text-xs text-stone-400">{p.categoria} · {formatoMoneda(p.precio)}</p>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className={`font-mono-num text-sm font-semibold ${bajo ? 'text-rose-600' : 'text-stone-700'}`}>{p.stock} {p.unidad}</p>
                {bajo && <p className="text-2xs text-rose-500">stock bajo</p>}
                {!bajo && p.monitoreado && <p className="text-2xs text-emerald-600">monitoreado</p>}
              </div>
            </button>
          );
        })}
        {productosFiltrados.length === 0 && <p className="text-center text-sm text-stone-400 py-6">No se encontraron productos.</p>}
      </div>
    </div>
  );
}

/* ======================= Tab: Finanzas ======================= */

function TabFinanzas({ productos, ventasDiarias, ventasProducto, gastos, compras, fiados, mermas, bitacora, onActualizarBitacora, nombreNegocio }) {
  const [periodo, setPeriodo] = useState('actual');
  const offset = periodo === 'actual' ? 0 : -1;
  const datos = { ventasDiarias, ventasProducto, gastos, compras, fiados, mermas };
  const totales = calcularTotalesPeriodo(datos, inicioMes(offset), finMes(offset));

  const [ampliandoId, setAmpliandoId] = useState(null);
  const [errorAmpliar, setErrorAmpliar] = useState(null);

  const rentabilidad = productos
    .map((p) => {
      const vp = totales.vpPeriodo.filter((v) => v.productoId === p.id);
      const unidades = vp.reduce((s, v) => s + v.cantidad, 0);
      const ingresos = vp.reduce((s, v) => s + v.cantidad * v.precioUnitario, 0);
      const costo = vp.reduce((s, v) => s + v.cantidad * v.costoUnitario, 0);
      const utilidad = ingresos - costo;
      const margenPct = ingresos > 0 ? (utilidad / ingresos) * 100 : 0;
      return { id: p.id, nombre: p.nombre, unidades, ingresos, utilidad, margenPct };
    })
    .filter((p) => p.unidades > 0)
    .sort((a, b) => b.utilidad - a.utilidad);

  const masRentables = rentabilidad.slice(0, 3);
  const menosRentables = [...rentabilidad].sort((a, b) => a.utilidad - b.utilidad).slice(0, 3).filter((p) => p.margenPct < 15);

  const estancados = productos
    .filter((p) => p.monitoreado)
    .map((p) => ({ ...p, valorStock: p.stock * p.costo }))
    .filter((p) => p.stock > p.stockMinimo * 2 && !totales.vpPeriodo.some((v) => v.productoId === p.id))
    .sort((a, b) => b.valorStock - a.valorStock)
    .slice(0, 4);

  const gastosPorCategoria = CATEGORIAS_GASTO
    .map((cat) => ({ categoria: cat, monto: totales.gastosPeriodo.filter((g) => g.categoria === cat).reduce((s, g) => s + g.monto, 0) }))
    .filter((c) => c.monto > 0)
    .sort((a, b) => b.monto - a.monto);

  const entradas = (bitacora || []).filter((b) => b.tipo !== 'vacio' || true).sort((a, b) => (a.fechaFin < b.fechaFin ? 1 : -1));
  const entradaReciente = entradas.find((e) => e.tipo === 'semana' || e.tipo === 'informe-legado');

  const ampliarConIA = async (entrada) => {
    setAmpliandoId(entrada.id);
    setErrorAmpliar(null);
    try {
      const contexto = { resumen: entrada.texto, datos: entrada.snapshot || null, negocio: nombreNegocio || 'la tienda' };
      const respuesta = await fetch('/api/claude', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 1000,
          system: 'Eres el asesor de negocios de una tienda de abarrotes mexicana. Con el resumen de la semana que te doy, escribe un análisis más profundo (máximo 130 palabras), en español llano y cálido, sin markdown ni listas. Explica qué significa lo que pasó y da una recomendación concreta para la próxima semana.',
          messages: [{ role: 'user', content: JSON.stringify(contexto) }],
        }),
      });
      const datosResp = await respuesta.json();
      const textoIA = (datosResp.content || []).map((b) => b.text || '').join('').trim();
      if (textoIA) await onActualizarBitacora({ ...entrada, textoIA });
    } catch (e) {
      setErrorAmpliar('No se pudo ampliar. Intenta de nuevo.');
    } finally {
      setAmpliandoId(null);
    }
  };

  const enviarEntradaPorWhatsApp = (entrada) => {
    const negocio = nombreNegocio || 'Mi tienda';
    const encabezado = `*Bitácora — ${negocio}*\n${formatoFechaCorta(entrada.fechaInicio)} al ${formatoFechaCorta(entrada.fechaFin)}\n\n`;
    const cuerpo = entrada.texto + (entrada.textoIA ? '\n\n' + entrada.textoIA : '');
    const mensaje = encabezado + cuerpo + '\n\n_Generado con TiendaSmart_';
    window.open('https://wa.me/?text=' + encodeURIComponent(mensaje), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex bg-stone-100 rounded-xl p-1">
        <button onClick={() => setPeriodo('actual')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${periodo === 'actual' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'}`}>Este mes</button>
        <button onClick={() => setPeriodo('anterior')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${periodo === 'anterior' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500'}`}>Mes anterior</button>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <p className="font-display font-semibold text-stone-800 text-sm mb-3">¿Cuánto gané realmente?</p>
        <FilaRecibo etiqueta="Ingresos por ventas" valor={formatoMoneda(totales.ingresos)} />
        <FilaRecibo etiqueta="Costo de mercancía vendida" valor={'- ' + formatoMoneda(totales.costoVentasEstimado)} />
        <FilaRecibo etiqueta="Utilidad bruta" valor={formatoMoneda(totales.utilidadBruta)} />
        <FilaRecibo etiqueta="Gastos operativos" valor={'- ' + formatoMoneda(totales.gastosOperativos)} />
        <FilaRecibo etiqueta="Mermas y pérdidas" valor={'- ' + formatoMoneda(totales.totalMerma)} />
        <div className="border-t border-stone-200 mt-2 pt-2">
          <FilaRecibo etiqueta="Utilidad neta" valor={formatoMoneda(totales.utilidadNeta)} tono={totales.utilidadNeta >= 0 ? 'positivo' : 'negativo'} />
        </div>
        <p className="text-2xs text-stone-400 mt-2">*El costo de mercancía vendida es una estimación: exacta para tus productos monitoreados, calculada con su margen observado para el resto.</p>
      </div>

      <div className="bg-stone-900 rounded-xl p-4 text-white">
        <div className="flex items-center gap-2 mb-1">
          <Wallet size={16} className="text-emerald-400" />
          <p className="font-display font-semibold text-sm">Flujo de efectivo</p>
        </div>
        <p className="font-mono-num text-2xl font-bold">{formatoMoneda(totales.flujoEfectivo)}</p>
        <p className="text-xs text-stone-400 mt-1">
          Dinero real que entró y salió de tu caja: ventas de contado y fiado cobrado, menos gastos y compras de mercancía.
        </p>
        {totales.fiadoPendienteTotal > 0 && (
          <p className="text-xs text-amber-400 mt-2 pt-2 border-t border-white/10">Fiado pendiente de cobro (acumulado): {formatoMoneda(totales.fiadoPendienteTotal)}</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen size={16} className="text-orange-600" />
          <p className="font-display font-semibold text-stone-800 text-sm">Bitácora del negocio</p>
        </div>
        <p className="text-xs text-stone-500 mb-3">La evolución de tu tienda, semana a semana. Se escribe sola cada semana con tus datos.</p>
        {entradas.length === 0 ? (
          <p className="text-sm text-stone-500 bg-stone-50 rounded-lg px-3 py-3">Aún no hay semanas registradas. En cuanto captures ventas y cortes, tu primera entrada aparecerá aquí.</p>
        ) : (
          <div className="space-y-2.5">
            {entradas.slice(0, 12).map((entrada, idx) => {
              const esReciente = entrada.id === (entradaReciente && entradaReciente.id);
              if (entrada.tipo === 'vacio') {
                return <p key={entrada.id} className="text-xs text-stone-400 italic border-l-2 border-stone-100 pl-3 py-0.5">{entrada.texto}</p>;
              }
              return (
                <div key={entrada.id} className={`rounded-xl p-3 ${esReciente ? 'bg-orange-50 border border-orange-100' : 'border border-stone-100'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-2xs font-medium text-stone-500">{formatoFechaCorta(entrada.fechaInicio)} – {formatoFechaCorta(entrada.fechaFin)}</p>
                    {entrada.tipo === 'informe-legado' && <span className="text-2xs text-stone-400">informe anterior</span>}
                  </div>
                  <p className="text-sm text-stone-700 leading-relaxed">{entrada.texto}</p>
                  {entrada.textoIA && <p className="text-sm text-orange-800 leading-relaxed mt-2 pt-2 border-t border-orange-100 whitespace-pre-line">{entrada.textoIA}</p>}
                  {entrada.snapshot && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-2xs text-stone-400">
                      <span>Ventas {formatoMoneda(entrada.snapshot.ventas)}</span>
                      <span>Utilidad {formatoMoneda(entrada.snapshot.utilidad)}</span>
                      {entrada.snapshot.merma > 0 && <span>Merma {formatoMoneda(entrada.snapshot.merma)}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <button onClick={() => enviarEntradaPorWhatsApp(entrada)} className="text-xs font-medium flex items-center gap-1.5" style={{ color: '#128C7E' }}>
                      <Send size={13} /> WhatsApp
                    </button>
                    {!entrada.textoIA && (
                      <button onClick={() => ampliarConIA(entrada)} disabled={ampliandoId === entrada.id} className="text-xs font-medium text-orange-600 flex items-center gap-1.5 disabled:opacity-60">
                        {ampliandoId === entrada.id ? (<><Loader2 size={13} className="animate-spin" /> Ampliando…</>) : (<><Sparkles size={13} /> Ampliar con IA</>)}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {errorAmpliar && <p className="text-sm text-rose-600 mt-2">{errorAmpliar}</p>}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <p className="font-display font-semibold text-stone-800 text-sm mb-3">¿Qué productos dejan más utilidad?</p>
        {masRentables.length === 0 && <p className="text-sm text-stone-400">Aún no hay suficientes productos monitoreados con ventas este periodo.</p>}
        <div className="space-y-2">
          {masRentables.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span className="text-stone-700 truncate mr-2">{p.nombre}</span>
              <span className="font-mono-num text-emerald-700 font-semibold shrink-0">{formatoMoneda(p.utilidad)}</span>
            </div>
          ))}
        </div>
      </div>

      {(menosRentables.length > 0 || estancados.length > 0) && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <p className="font-display font-semibold text-rose-800 text-sm mb-3">¿En qué estoy perdiendo dinero?</p>
          {menosRentables.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-rose-700 truncate mr-2">{p.nombre} · margen {p.margenPct.toFixed(0)}%</span>
              <span className="font-mono-num text-rose-700 font-semibold shrink-0">{formatoMoneda(p.utilidad)}</span>
            </div>
          ))}
          {estancados.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-rose-700 truncate mr-2">{p.nombre} · sin ventas este mes</span>
              <span className="font-mono-num text-rose-700 font-semibold shrink-0">{formatoMoneda(p.valorStock)} parados</span>
            </div>
          ))}
        </div>
      )}

      {gastosPorCategoria.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="font-display font-semibold text-stone-800 text-sm mb-2">Gastos por categoría</p>
          <ResponsiveContainer width="100%" height={Math.max(120, gastosPorCategoria.length * 32)}>
            <BarChart data={gastosPorCategoria} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="categoria" width={90} tick={{ fontSize: 10, fill: '#44403c' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => formatoMoneda(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="monto" fill="#e11d48" radius={[0, 6, 6, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ======================= Tab: Precios ======================= */

function TabPrecios({ ivaDefault, onUsarEnInventario }) {
  const [costo, setCosto] = useState('');
  const [modoMargen, setModoMargen] = useState('venta');
  const [margenPct, setMargenPct] = useState('30');
  const [exento, setExento] = useState(false);

  const ivaPct = exento ? 0 : ivaDefault;
  const c = parseFloat(costo) || 0;
  const resultado = calcularPrecio({ costo: c, modoMargen, margenPct, ivaPct });
  const referencias = [20, 30, 40, 50].map((m) => ({ margen: m, ...calcularPrecio({ costo: c, modoMargen, margenPct: m, ivaPct }) }));

  return (
    <div className="space-y-4 pb-4">
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <p className="font-display font-semibold text-stone-800 text-sm mb-3">Calculadora de precios</p>

        <Campo etiqueta="Costo unitario (lo que te cuesta)">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">$</span>
            <input type="number" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0.00" className={claseInput + ' pl-7 font-mono-num'} />
          </div>
        </Campo>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={() => setModoMargen('venta')} className={`py-2 rounded-lg text-xs font-medium border ${modoMargen === 'venta' ? 'bg-emerald-700 text-white border-emerald-700' : 'border-stone-200 text-stone-500'}`}>Margen sobre venta</button>
          <button onClick={() => setModoMargen('costo')} className={`py-2 rounded-lg text-xs font-medium border ${modoMargen === 'costo' ? 'bg-emerald-700 text-white border-emerald-700' : 'border-stone-200 text-stone-500'}`}>Margen sobre costo</button>
        </div>

        <Campo etiqueta="Margen deseado (%)">
          <input type="number" inputMode="decimal" value={margenPct} onChange={(e) => setMargenPct(e.target.value)} className={claseInput + ' font-mono-num'} />
        </Campo>

        <label className="flex items-center gap-2 mb-1 text-sm text-stone-600">
          <input type="checkbox" checked={exento} onChange={(e) => setExento(e.target.checked)} className="rounded border-stone-300" />
          Producto exento de IVA (canasta básica)
        </label>
        <p className="text-xs text-stone-400 mb-4">Muchos alimentos básicos tienen IVA de 0% en México. Confírmalo con tu contador si no estás seguro.</p>

        <div className="bg-emerald-50 rounded-xl p-4 space-y-1.5">
          <FilaRecibo etiqueta="Precio sin IVA" valor={formatoMoneda(resultado.precioSinIva)} />
          <FilaRecibo etiqueta={`IVA (${ivaPct}%)`} valor={formatoMoneda(resultado.precioConIva - resultado.precioSinIva)} />
          <div className="border-t border-emerald-200 pt-1.5">
            <FilaRecibo etiqueta="Precio recomendado" valor={formatoMoneda(resultado.precioConIva)} tono="positivo" />
          </div>
          <FilaRecibo etiqueta="Ganancia por unidad" valor={formatoMoneda(resultado.utilidadUnitaria)} tono="positivo" />
          <p className="text-xs text-stone-500 pt-1">
            Margen sobre venta: {resultado.margenSobreVenta.toFixed(1)}% · Markup sobre costo: {resultado.margenSobreCosto.toFixed(1)}%
          </p>
        </div>

        {c > 0 && (
          <button onClick={() => onUsarEnInventario(c, resultado.precioConIva)} className="w-full mt-3 border border-emerald-700 text-emerald-700 rounded-xl py-2.5 text-sm font-medium">
            Guardar como producto nuevo
          </button>
        )}
      </div>

      {c > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="font-display font-semibold text-stone-800 text-sm mb-3">Tabla rápida de referencia</p>
          <div className="space-y-1">
            {referencias.map((r) => (
              <div key={r.margen} className="flex items-center justify-between text-sm py-1 border-b border-stone-100 last:border-0">
                <span className="text-stone-500">Margen {r.margen}%</span>
                <span className="font-mono-num text-stone-800 font-medium">{formatoMoneda(r.precioConIva)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ======================= Tab: Compras (predicción + pedido) ======================= */

function TabCompras({ productos, ventasProducto, ventasDiarias, compras, cortes, pedidos, config, ajustesPersonales, icdSnapshot, onConfirmarPedido, onPonerseAlDia }) {
  const hoy = hoyISO();
  const CFG = MOTOR_CONFIG;
  const [cantidades, setCantidades] = useState({});
  const [flujo, setFlujo] = useState(null);
  const [exito, setExito] = useState(null);
  const [copiado, setCopiado] = useState(null);
  const [analisisIA, setAnalisisIA] = useState(null);
  const [generandoIA, setGenerandoIA] = useState(false);

  const icd = useMemo(() => calcularICD({ cortes, compras, ventasDiarias, productos, ventasProducto, pedidos }, hoy, CFG), [cortes, compras, ventasDiarias, productos, ventasProducto, pedidos, hoy]);
  const salud = useMemo(() => calcularSalud(icd, { cortes, productos }, CFG), [icd, cortes, productos]);
  const conservador = icd.puntos < CFG.conservador.icdMin || icd.diasSinCorte > CFG.conservador.factorCadencia * icd.cadencia;

  const motor = useMemo(() => {
    const contextos = { porCategoria: {}, porProveedor: {}, globales: [] };
    const preliminar = productos.map((p) => {
      const analisis = analizarVentasProducto(p.id, ventasProducto, hoy, CFG);
      const graduado = esGraduado(analisis, CFG);
      if (graduado && analisis.vObservada > 0) {
        contextos.globales.push(analisis.vObservada);
        (contextos.porCategoria[p.categoria] = contextos.porCategoria[p.categoria] || []).push(analisis.vObservada);
        if (p.proveedor) (contextos.porProveedor[p.proveedor] = contextos.porProveedor[p.proveedor] || []).push(analisis.vObservada);
      }
      return { p, analisis, graduado };
    });
    const filas = [];
    const basicas = [];
    let verdes = 0;
    preliminar.forEach(({ p, analisis, graduado }) => {
      const nuevo = esProductoNuevo(p, analisis, hoy, CFG);
      const dormido = analisis.tieneHistorial && (analisis.diasDesdeUltimoLapso == null || analisis.diasDesdeUltimoLapso > CFG.velocidad.ventanaLarga);
      if (!analisis.tieneHistorial && !nuevo) {
        const faltan = Math.max(0, (p.stockMinimo || 0) - (p.stock || 0));
        if (faltan > 0) basicas.push({ p, faltan });
        return;
      }
      if (dormido) return;
      let v, fuentePrior = null;
      if (graduado) {
        v = analisis.vObservada;
      } else {
        const prior = calcularPrior(p, contextos, CFG);
        fuentePrior = prior.fuente;
        const d = analisis.diasCubiertos;
        v = (CFG.arranque.pseudoDias * prior.v + d * analisis.vObservada) / (CFG.arranque.pseudoDias + d);
      }
      if (v <= 0) { verdes++; return; }
      let vCantidad = v;
      if (conservador) {
        if (analisis.velocidadesLapso.length >= 2) {
          const orden = [...analisis.velocidadesLapso].sort((a, b) => a - b);
          vCantidad = orden[Math.floor(CFG.conservador.percentilVelocidad * (orden.length - 1))];
        } else vCantidad = v * CFG.conservador.factorSinLapsos;
      }
      const S = proyectarStock(p, v, hoy);
      const C = calcularCiclo(p.id, compras, cortes, CFG);
      const M = Math.max(CFG.margenSeguridad.minDias, CFG.margenSeguridad.factor * C);
      const T = diasProximoSurtido(p.id, compras, C, hoy, config.diaPedidoSemanal);
      const nivel = calcularNivelPrioridad({ S, v, T, C, M, r: analisis.r }, CFG);
      let confianza = calcularConfianza(analisis, p, compras, hoy, CFG, nuevo);
      if (conservador && confianza.puntos > CFG.conservador.capConfianza) {
        confianza = { ...confianza, puntos: CFG.conservador.capConfianza, etiqueta: 'Aproximada' };
      }
      const ultimaCompra = compras.filter((x) => x.productoId === p.id).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
      const deltaCosto = ultimaCompra.length >= 2 && ultimaCompra[1].costoUnitario > 0
        ? (ultimaCompra[0].costoUnitario - ultimaCompra[1].costoUnitario) / ultimaCompra[1].costoUnitario : null;
      if (nivel === 3) { verdes++; return; }
      filas.push({ p, v, vCantidad, S, C, M, T, nivel, r: analisis.r, confianza, nuevo, fuentePrior, ultimaCompra: ultimaCompra[0] || null, deltaCosto, factorPersonal: calcularFactorPersonal((ajustesPersonales || {})[p.id], CFG) });
    });
    filas.sort((a, b) => a.nivel - b.nivel || (a.S / Math.max(0.01, a.v)) - (b.S / Math.max(0.01, b.v)));
    const grupos = {};
    filas.forEach((f) => {
      const prov = f.p.proveedor || 'Sin proveedor asignado';
      (grupos[prov] = grupos[prov] || []).push(f);
    });
    const pedidosSugeridos = Object.entries(grupos).map(([prov, items]) => {
      const contieneRojo = items.some((i) => i.nivel === 0);
      const minT = Math.min(...items.map((i) => i.T));
      const diasHastaPedido = contieneRojo ? 0 : Math.max(0, minT - 1);
      const itemsConQ = items.map((f) => {
        const ventana = diasHastaPedido + f.C + f.M;
        const fq = factorQuincena(hoy, Math.ceil(ventana), CFG);
        let q = Math.ceil(f.vCantidad * fq * ventana - f.S);
        q = Math.max(f.nivel <= 1 ? 1 : 0, Math.round(q * f.factorPersonal));
        return { ...f, sugerido: q };
      }).filter((f) => f.sugerido > 0);
      return { proveedor: prov, items: itemsConQ, diasHastaPedido, fechaPedido: sumarDias(hoy, diasHastaPedido), contieneRojo };
    }).filter((g) => g.items.length > 0);
    return { filas, basicas, verdes, pedidosSugeridos };
  }, [productos, ventasProducto, compras, cortes, pedidos, config.diaPedidoSemanal, ajustesPersonales, conservador, hoy]);

  const qtyDe = (f) => cantidades[f.p.id] != null ? cantidades[f.p.id] : f.sugerido;
  const cambiarQty = (id, delta, base) => setCantidades((c) => ({ ...c, [id]: Math.max(0, (c[id] != null ? c[id] : base) + delta) }));

  const resumen = useMemo(() => {
    const suma = (ini, fin) => ventasDiarias.filter((v) => v.fecha >= ini && v.fecha <= fin).reduce((s, v) => s + v.monto, 0);
    const v7 = suma(sumarDias(hoy, -6), hoy);
    const vPrev = suma(sumarDias(hoy, -13), sumarDias(hoy, -7));
    const rojos = motor.filas.filter((f) => f.nivel === 0);
    const naranjas = motor.filas.filter((f) => f.nivel === 1);
    const total = motor.pedidosSugeridos.reduce((s, g) => s + g.items.reduce((si, f) => si + qtyDe(f) * (f.p.costo || 0), 0), 0);
    const frases = [];
    if (v7 > 0 && vPrev > 0) {
      const d = ((v7 - vPrev) / vPrev) * 100;
      frases.push(d >= 1 ? `Tus ventas de la semana van ${d.toFixed(0)}% arriba.` : d <= -1 ? `Tus ventas de la semana van ${Math.abs(d).toFixed(0)}% abajo.` : 'Tus ventas van parejas con la semana pasada.');
    }
    if (rojos.length) frases.push(`${rojos.length} producto${rojos.length > 1 ? 's' : ''} en riesgo de agotarse: compra hoy.`);
    else if (naranjas.length) frases.push(`${naranjas.length} producto${naranjas.length > 1 ? 's' : ''} para comprar pronto.`);
    else if (motor.filas.length === 0) frases.push('Tu inventario está en buen nivel.');
    if (total > 0) frases.push(`Invertirías ${formatoMoneda(total)} si pides lo sugerido.`);
    const riesgo = rojos[0] || naranjas[0];
    if (riesgo) frases.push(`El más urgente es ${riesgo.p.nombre}: le quedan ~${Math.ceil(riesgo.S / Math.max(0.01, riesgo.v))} día${Math.ceil(riesgo.S / Math.max(0.01, riesgo.v)) === 1 ? '' : 's'} de venta.`);
    return { v7, vPrev, rojos: rojos.length, naranjas: naranjas.length, total, frases };
  }, [ventasDiarias, motor, cantidades, hoy]);

  const analizarConIA = async () => {
    setGenerandoIA(true);
    try {
      const contexto = { resumen: resumen.frases.join(' '), salud: etiquetaEstado(salud.puntos, CFG).texto, urgentes: motor.filas.filter((f) => f.nivel <= 1).slice(0, 6).map((f) => `${f.p.nombre}: quedan ~${f.S.toFixed(0)}, vende ~${(f.v * 7).toFixed(1)}/sem`) };
      const respuesta = await fetch('/api/claude', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 1000,
          system: 'Eres el asesor de negocios de una tienda de abarrotes mexicana. Con los datos que te doy, escribe un análisis breve (máximo 90 palabras), en español llano y cálido, con una recomendación concreta y accionable para esta semana. Sin tecnicismos, sin listas, solo texto corrido.',
          messages: [{ role: 'user', content: JSON.stringify(contexto) }],
        }),
      });
      const datos = await respuesta.json();
      setAnalisisIA((datos.content || []).map((b) => b.text || '').join('').trim() || null);
    } catch (e) { setAnalisisIA('No se pudo generar el análisis. Intenta de nuevo.'); }
    finally { setGenerandoIA(false); }
  };

  const estadoSalud = etiquetaEstado(salud.puntos, CFG);
  const estadoICD = etiquetaEstado(icd.puntos, CFG);
  const previo = icdSnapshot && icdSnapshot.previo ? icdSnapshot.previo : null;
  const cambioICD = previo != null ? icd.puntos - previo.puntos : 0;
  let explicacionCambio = null;
  if (previo && Math.abs(cambioICD) >= CFG.icd.cambioMinExplicar && previo.componentes) {
    let mayor = null;
    icd.componentes.forEach((c) => {
      const antes = previo.componentes.find((x) => x.clave === c.clave);
      if (!antes) return;
      const d = c.obtenido - antes.obtenido;
      if (!mayor || Math.abs(d) > Math.abs(mayor.d)) mayor = { c, d };
    });
    if (mayor) {
      const de = etiquetaEstado(previo.puntos, CFG).texto, a = estadoICD.texto;
      explicacionCambio = de !== a
        ? `Pasó de ${de} a ${a}, sobre todo por: ${mayor.c.texto.toLowerCase()}.`
        : `${cambioICD > 0 ? 'Mejoró' : 'Bajó'} sobre todo por: ${mayor.c.texto.toLowerCase()}.`;
    }
  }

  const colorNivel = ['bg-rose-500', 'bg-orange-500', 'bg-yellow-400', 'bg-emerald-500'];
  const textoNivel = ['Comprar hoy', 'Comprar pronto', 'Puede esperar', 'Stock suficiente'];
  const chipNivel = ['bg-rose-50 text-rose-700 border-rose-200', 'bg-orange-50 text-orange-700 border-orange-200', 'bg-yellow-50 text-yellow-700 border-yellow-300', 'bg-emerald-50 text-emerald-700 border-emerald-200'];

  const textoPedido = (g) => {
    let t = `Pedido — ${config.nombreNegocio}\nProveedor: ${g.proveedor}\nFecha sugerida: ${g.diasHastaPedido === 0 ? 'hoy' : formatoFechaCorta(g.fechaPedido)}\n\n`;
    g.items.forEach((f) => { t += `- ${f.p.nombre}: ${qtyDe(f)} ${f.p.unidad}\n`; });
    t += `\nTotal estimado: ${formatoMoneda(g.items.reduce((s, f) => s + qtyDe(f) * (f.p.costo || 0), 0))}`;
    return t;
  };
  const compartirWA = (g) => { window.open('https://wa.me/?text=' + encodeURIComponent(textoPedido(g)), '_blank', 'noopener,noreferrer'); };
  const copiarPedido = async (g) => {
    try { await navigator.clipboard.writeText(textoPedido(g)); setCopiado(g.proveedor); setTimeout(() => setCopiado(null), 2000); } catch (e) { /* selección manual */ }
  };
  const imprimirPedido = (g) => {
    try {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write('<html><head><title>Pedido</title></head><body><pre style="font-family:monospace;font-size:14px;">' + textoPedido(g).replace(/</g, '&lt;') + '</pre></body></html>');
      w.document.close();
      w.print();
    } catch (e) { /* restringido en vista embebida */ }
  };
  const descargarPedido = (g) => {
    try {
      const blob = new Blob([textoPedido(g)], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'pedido-' + g.proveedor.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.txt';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { /* restringido en vista embebida */ }
  };

  const iniciarConfirmacion = (g) => {
    setFlujo({ proveedor: g.proveedor, paso: 'opciones', grupo: g, items: g.items.map((f) => ({ productoId: f.p.id, nombre: f.p.nombre, unidad: f.p.unidad, cantidadSugerida: f.sugerido, cantidadPedida: qtyDe(f), cantidadRecibida: qtyDe(f), costoUnitario: f.ultimaCompra ? f.ultimaCompra.costoUnitario : (f.p.costo || 0), recibido: true })) });
  };
  const elegirOpcion = (opcion) => {
    if (opcion === 'completo') revisarDuplicado({ ...flujo, estado: 'completo' });
    else if (opcion === 'precios') setFlujo((f) => ({ ...f, paso: 'precios', estado: 'precios' }));
    else setFlujo((f) => ({ ...f, paso: 'checklist', estado: opcion }));
  };
  const revisarDuplicado = (estadoFlujo) => {
    const recibidos = estadoFlujo.items.filter((i) => i.recibido && i.cantidadRecibida > 0);
    const candidato = { proveedor: estadoFlujo.proveedor, fecha: hoy, total: recibidos.reduce((s, i) => s + i.cantidadRecibida * i.costoUnitario, 0), nombres: recibidos.map((i) => i.nombre) };
    const match = detectarDuplicado(candidato, agruparLotesCompras(compras, pedidos, hoy, CFG), hoy, CFG);
    if (match) setFlujo({ ...estadoFlujo, paso: 'duplicado', match });
    else finalizar(estadoFlujo, true);
  };
  const finalizar = (estadoFlujo, crearCompras) => {
    const recibidos = estadoFlujo.items.filter((i) => i.recibido && i.cantidadRecibida > 0);
    const faltantes = estadoFlujo.items.filter((i) => !i.recibido || i.cantidadRecibida < i.cantidadPedida).map((i) => i.nombre);
    const pedido = {
      id: generarId(), proveedor: estadoFlujo.proveedor, fechaCreado: hoy, fechaRecibido: hoy,
      estado: estadoFlujo.estado || 'completo', items: estadoFlujo.items.map(({ productoId, nombre, cantidadSugerida, cantidadPedida, cantidadRecibida, costoUnitario, recibido }) => ({ productoId, nombre, cantidadSugerida, cantidadPedida, cantidadRecibida: recibido ? cantidadRecibida : 0, costoUnitario })),
      totalEstimado: estadoFlujo.items.reduce((s, i) => s + i.cantidadPedida * i.costoUnitario, 0),
      totalRecibido: recibidos.reduce((s, i) => s + i.cantidadRecibida * i.costoUnitario, 0),
      faltantes,
    };
    const comprasNuevas = crearCompras ? recibidos.map((i) => ({
      id: generarId(), fecha: hoy, productoId: i.productoId, productoNombre: i.nombre,
      cantidad: i.cantidadRecibida, costoUnitario: i.costoUnitario, total: +(i.cantidadRecibida * i.costoUnitario).toFixed(2),
      proveedor: estadoFlujo.proveedor, loteId: pedido.id, origenPedidoId: pedido.id,
    })) : [];
    const muestras = {};
    estadoFlujo.items.forEach((i) => {
      if (i.cantidadSugerida > 0) {
        const ratio = i.cantidadPedida / i.cantidadSugerida;
        if (Math.abs(ratio - 1) > MOTOR_CONFIG.ajustePersonal.umbralDesvio) muestras[i.productoId] = ratio;
      }
    });
    onConfirmarPedido({ pedido, comprasNuevas, muestras });
    setFlujo(null);
    setCantidades({});
    setExito(crearCompras ? 'Pedido registrado: inventario y costos actualizados.' : 'Listo. Se marcó el pedido sin duplicar la compra que ya tenías registrada.');
    setTimeout(() => setExito(null), 3500);
  };

  const faltantesPrevios = useMemo(() => {
    const set = new Set();
    (pedidos || []).forEach((pd) => {
      if (pd.faltantes && pd.fechaRecibido && diasEntre(pd.fechaRecibido, hoy) <= 7) pd.faltantes.forEach((n) => set.add(n));
    });
    return set;
  }, [pedidos, hoy]);

  const TarjetaFila = ({ f }) => {
    const dias = Math.ceil(f.S / Math.max(0.01, f.v));
    const q = qtyDe(f);
    const anclado = f.p.stockFecha === hoy;
    return (
      <div className="border border-stone-100 rounded-xl p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-800 truncate">{f.p.nombre}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className={`inline-flex items-center gap-1 text-2xs border rounded-full px-2 py-0.5 ${chipNivel[f.nivel]}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${colorNivel[f.nivel]}`} /> {textoNivel[f.nivel]}
              </span>
              {f.nuevo && <span className="text-2xs border border-sky-200 bg-sky-50 text-sky-700 rounded-full px-2 py-0.5">Nuevo · estimación inicial</span>}
              {f.confianza.etiqueta !== 'Alta precisión' && <span className="text-2xs border border-stone-200 bg-stone-50 text-stone-500 rounded-full px-2 py-0.5">{f.confianza.etiqueta}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => cambiarQty(f.p.id, -1, f.sugerido)} className="w-8 h-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-500 active:bg-stone-50"><Minus size={14} /></button>
            <span className="font-mono-num text-sm font-bold text-orange-600 w-10 text-center">{conservador ? '~' : ''}{q}</span>
            <button onClick={() => cambiarQty(f.p.id, 1, f.sugerido)} className="w-8 h-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-500 active:bg-stone-50"><Plus size={14} /></button>
          </div>
        </div>
        <div className="mt-2 text-xs text-stone-500 space-y-0.5">
          <p>Vende ~{(f.v * 7).toFixed(1)}/semana · quedan ~{f.S.toFixed(0)} {f.p.unidad}{anclado ? ' (contado hoy)' : ''} · ~{dias} día{dias === 1 ? '' : 's'} de cobertura</p>
          <p>
            Surtido en {f.T === 0 ? 'hoy' : `${f.T} día${f.T === 1 ? '' : 's'}`}
            {f.r >= CFG.tendencia.alza && <span className="text-emerald-700"> · va en subida</span>}
            {f.r <= CFG.tendencia.baja && <span className="text-stone-400"> · se está enfriando</span>}
            {faltantesPrevios.has(f.p.nombre) && <span className="text-orange-700"> · quedó pendiente de tu pedido anterior</span>}
          </p>
          <p>
            Costo est.: <span className="font-mono-num text-stone-700">{formatoMoneda(q * (f.p.costo || 0))}</span>
            {!conservador && f.p.precio > f.p.costo && <> · si lo vendes todo: ~<span className="font-mono-num text-emerald-700">{formatoMoneda(q * (f.p.precio - f.p.costo))}</span></>}
          </p>
          {f.ultimaCompra && (
            <p>
              Último costo: {formatoMoneda(f.ultimaCompra.costoUnitario)} · ticket {formatoFechaCorta(f.ultimaCompra.fecha)}
              {f.deltaCosto != null && Math.abs(f.deltaCosto) >= 0.05 && (
                <span className={f.deltaCosto > 0 ? 'text-orange-700' : 'text-emerald-700'}> · {f.deltaCosto > 0 ? '⚠️ subió' : 'bajó'} {Math.abs(f.deltaCosto * 100).toFixed(0)}%</span>
              )}
            </p>
          )}
        </div>
        <details className="mt-1.5">
          <summary className="text-2xs text-stone-400 cursor-pointer">Ver detalle técnico</summary>
          <div className="text-2xs text-stone-500 mt-1 space-y-0.5">
            <p>Confianza: {f.confianza.puntos}/100 ({f.confianza.etiqueta}){f.nuevo && f.fuentePrior ? ` · estimado por ${f.fuentePrior}` : ''}</p>
            <p>Para mejorar: {f.confianza.accion}</p>
            {f.factorPersonal !== 1 && <p>Ajustado a tu preferencia: {f.factorPersonal > 1 ? '+' : ''}{Math.round((f.factorPersonal - 1) * 100)}% (aprendido de tus pedidos)</p>}
          </div>
        </details>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="font-display font-semibold text-stone-800 text-sm">Estado de Salud de la Tienda</p>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full bg-${estadoSalud.color}-50 text-${estadoSalud.color}-700 border border-${estadoSalud.color}-200`}>{estadoSalud.texto}</span>
        </div>
        <p className="text-xs text-stone-500 mb-2">Qué tan confiables son los análisis con tus datos de hoy.</p>
        {salud.acciones.length > 0 && (
          <div className="space-y-1">
            {salud.acciones.map((a, i) => (
              <p key={i} className="text-xs text-stone-600 flex items-start gap-1.5"><Sparkles size={12} className="text-orange-500 mt-0.5 shrink-0" /> <span>{a.texto} <span className="text-stone-400">(+{a.gana} pts)</span></span></p>
            ))}
          </div>
        )}
        <details className="mt-2">
          <summary className="text-2xs text-stone-400 cursor-pointer">Ver detalle técnico</summary>
          <div className="text-2xs text-stone-500 mt-1 space-y-0.5">
            <p>Salud: {salud.puntos}/100 · Calidad de datos: {icd.puntos}/100 ({estadoICD.texto})</p>
            {explicacionCambio && <p>{explicacionCambio}</p>}
            {icd.componentes.map((c) => <p key={c.clave}>· {c.texto}: {Math.round(c.obtenido)}/{c.max}</p>)}
            <p>Motor v{CFG.version}{conservador ? ' · modo conservador activo' : ''}</p>
          </div>
        </details>
      </div>

      {conservador && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-900">Trabajando con información atrasada</p>
              <p className="text-xs text-amber-800 mt-0.5">{icd.diasSinCorte >= 900 ? 'Aún no tienes cortes registrados.' : `Llevas ${icd.diasSinCorte} días sin corte y tu ritmo es cada ${Math.round(icd.cadencia)}.`} Las cantidades se muestran aproximadas (~) y en versión prudente para no inflar tu compra.</p>
              <button onClick={onPonerseAlDia} className="mt-2 bg-amber-600 text-white rounded-xl px-3 py-2 text-xs font-medium flex items-center gap-1.5"><RefreshCw size={13} /> Ponerme al día (3 min)</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-stone-900 text-white rounded-xl p-4">
        <p className="font-display font-semibold text-sm mb-1.5">Tu negocio hoy</p>
        <p className="text-sm text-stone-200 leading-relaxed">{resumen.frases.join(' ')}</p>
        {analisisIA && <p className="text-sm text-orange-200 leading-relaxed mt-2 pt-2 border-t border-white/10 whitespace-pre-line">{analisisIA}</p>}
        <button onClick={analizarConIA} disabled={generandoIA} className="mt-2 text-xs text-orange-300 font-medium flex items-center gap-1.5 disabled:opacity-60">
          {generandoIA ? (<><Loader2 size={13} className="animate-spin" /> Analizando…</>) : (<><Sparkles size={13} /> {analisisIA ? 'Actualizar análisis con IA' : 'Análisis con IA'}</>)}
        </button>
      </div>

      {exito && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">{exito}</p>}

      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <p className="font-display font-semibold text-stone-800 text-sm mb-1">¿Qué debo comprar?</p>
        <p className="text-xs text-stone-500 mb-3">Calculado con tu ritmo real de venta, tu inventario estimado y tus fechas de surtido.</p>
        {motor.filas.length === 0 ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-3">Todo tu inventario alcanza hasta tu próximo surtido. No necesitas comprar nada por ahora.</p>
        ) : (
          <div className="space-y-2">
            {motor.filas.map((f) => <TarjetaFila key={f.p.id} f={f} />)}
          </div>
        )}
        {motor.verdes > 0 && (
          <p className="text-2xs text-stone-400 mt-3 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {motor.verdes} producto{motor.verdes === 1 ? '' : 's'} más con stock suficiente.</p>
        )}
      </div>

      {motor.basicas.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="font-display font-semibold text-stone-800 text-sm mb-1">Sugerencias básicas</p>
          <p className="text-xs text-stone-500 mb-3">Productos sin historial de venta: sugerencia simple por stock mínimo. Monitoréalos en un corte para recomendaciones inteligentes.</p>
          <div className="space-y-1.5">
            {motor.basicas.map(({ p, faltan }) => (
              <div key={p.id} className="flex items-center justify-between text-sm border border-stone-100 rounded-xl px-3 py-2">
                <span className="text-stone-700 truncate">{p.nombre} <span className="text-2xs text-stone-400">· Estimación</span></span>
                <span className="font-mono-num text-orange-600 font-bold shrink-0 ml-2">+{faltan}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {motor.pedidosSugeridos.map((g) => {
        const total = g.items.reduce((s, f) => s + qtyDe(f) * (f.p.costo || 0), 0);
        const alzas = g.items.filter((f) => f.deltaCosto != null && f.deltaCosto >= 0.05);
        const sumaAlzas = alzas.reduce((s, f) => s + (f.ultimaCompra.costoUnitario - f.ultimaCompra.costoUnitario / (1 + f.deltaCosto)) * qtyDe(f), 0);
        const enFlujo = flujo && flujo.proveedor === g.proveedor;
        return (
          <div key={g.proveedor} className="bg-white rounded-xl border border-stone-200 p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="font-display font-semibold text-stone-800 text-sm truncate">{g.proveedor}</p>
              <ShoppingCart size={15} className="text-orange-500 shrink-0" />
            </div>
            <p className="text-xs text-stone-500">
              Pedir: <span className={g.contieneRojo ? 'text-rose-600 font-medium' : 'text-stone-700 font-medium'}>{g.diasHastaPedido === 0 ? 'hoy' : formatoFechaCorta(g.fechaPedido)}</span>
              {' '}· {g.items.length} producto{g.items.length === 1 ? '' : 's'} · <span className="font-mono-num text-stone-700">{formatoMoneda(total)}</span>
              {config.presupuestoSemanal > 0 && <> · {Math.round((total / config.presupuestoSemanal) * 100)}% de tu presupuesto</>}
            </p>
            {alzas.length > 0 && (
              <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5 mt-2">⚠️ {alzas.map((f) => `${f.p.nombre} +${Math.round(f.deltaCosto * 100)}%`).join(', ')}{sumaAlzas > 0.5 ? ` · este pedido trae ~${formatoMoneda(sumaAlzas)} extra por aumentos` : ''}</p>
            )}
            <div className="mt-2 border-t border-stone-100 pt-2 space-y-1">
              {g.items.map((f) => (
                <div key={f.p.id} className="flex items-center justify-between text-xs">
                  <span className="text-stone-600 truncate">{f.p.nombre} <span className="text-stone-400">×{qtyDe(f)}</span></span>
                  <span className="font-mono-num text-stone-500 shrink-0 ml-2">{formatoMoneda(qtyDe(f) * (f.p.costo || 0))}</span>
                </div>
              ))}
            </div>

            {!enFlujo && (
              <>
                <div className="grid grid-cols-4 gap-1.5 mt-3">
                  <button onClick={() => compartirWA(g)} className="rounded-xl py-2 text-2xs font-medium text-white flex flex-col items-center gap-0.5" style={{ backgroundColor: '#25D366' }}><Send size={14} /> WhatsApp</button>
                  <button onClick={() => copiarPedido(g)} className="rounded-xl py-2 text-2xs font-medium border border-stone-200 text-stone-600 flex flex-col items-center gap-0.5">{copiado === g.proveedor ? <Check size={14} /> : <Copy size={14} />} {copiado === g.proveedor ? 'Copiado' : 'Copiar'}</button>
                  <button onClick={() => imprimirPedido(g)} className="rounded-xl py-2 text-2xs font-medium border border-stone-200 text-stone-600 flex flex-col items-center gap-0.5"><Printer size={14} /> Imprimir</button>
                  <button onClick={() => descargarPedido(g)} className="rounded-xl py-2 text-2xs font-medium border border-stone-200 text-stone-600 flex flex-col items-center gap-0.5"><Download size={14} /> Bajar</button>
                </div>
                <button onClick={() => iniciarConfirmacion(g)} className="w-full bg-orange-600 text-white rounded-xl py-2.5 text-sm font-medium mt-2">Ya recibí el pedido</button>
              </>
            )}

            {enFlujo && flujo.paso === 'opciones' && (
              <div className="mt-3 border-t border-stone-100 pt-3">
                <p className="text-sm font-medium text-stone-800 mb-2">¿Recibiste todo correctamente?</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button onClick={() => elegirOpcion('completo')} className="bg-emerald-700 text-white rounded-xl py-2 text-xs font-medium">Sí, completo</button>
                  <button onClick={() => elegirOpcion('parcial')} className="border border-stone-200 rounded-xl py-2 text-xs font-medium text-stone-600">Llegó parcialmente</button>
                  <button onClick={() => elegirOpcion('faltaron')} className="border border-stone-200 rounded-xl py-2 text-xs font-medium text-stone-600">Faltaron productos</button>
                  <button onClick={() => elegirOpcion('precios')} className="border border-stone-200 rounded-xl py-2 text-xs font-medium text-stone-600">Cambiaron precios</button>
                </div>
                <button onClick={() => setFlujo(null)} className="w-full text-2xs text-stone-400 mt-2 py-1">Cancelar</button>
              </div>
            )}

            {enFlujo && flujo.paso === 'checklist' && (
              <div className="mt-3 border-t border-stone-100 pt-3 space-y-1.5">
                <p className="text-sm font-medium text-stone-800">Marca lo que sí llegó:</p>
                {flujo.items.map((it, idx) => (
                  <div key={it.productoId} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={it.recibido} onChange={(e) => setFlujo((f) => ({ ...f, items: f.items.map((x, i) => i === idx ? { ...x, recibido: e.target.checked } : x) }))} className="rounded border-stone-300" />
                    <span className="flex-1 text-stone-700 truncate">{it.nombre}</span>
                    <input type="number" inputMode="numeric" value={it.cantidadRecibida} disabled={!it.recibido}
                      onChange={(e) => setFlujo((f) => ({ ...f, items: f.items.map((x, i) => i === idx ? { ...x, cantidadRecibida: parseFloat(e.target.value) || 0 } : x) }))}
                      className="w-16 border border-stone-200 rounded-lg px-2 py-1 text-sm font-mono-num text-right disabled:opacity-40" />
                  </div>
                ))}
                <p className="text-2xs text-stone-400">Lo que falte quedará sugerido para tu próximo pedido.</p>
                <button onClick={() => revisarDuplicado(flujo)} className="w-full bg-emerald-700 text-white rounded-xl py-2 text-sm font-medium">Confirmar</button>
              </div>
            )}

            {enFlujo && flujo.paso === 'precios' && (
              <div className="mt-3 border-t border-stone-100 pt-3 space-y-1.5">
                <p className="text-sm font-medium text-stone-800">Corrige los costos que cambiaron:</p>
                {flujo.items.map((it, idx) => (
                  <div key={it.productoId} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-stone-700 truncate">{it.nombre}</span>
                    <input type="number" inputMode="decimal" value={it.costoUnitario}
                      onChange={(e) => setFlujo((f) => ({ ...f, items: f.items.map((x, i) => i === idx ? { ...x, costoUnitario: parseFloat(e.target.value) || 0 } : x) }))}
                      className="w-20 border border-stone-200 rounded-lg px-2 py-1 text-sm font-mono-num text-right" />
                  </div>
                ))}
                <p className="text-2xs text-stone-400">Los costos nuevos actualizan tus márgenes y futuras alertas.</p>
                <button onClick={() => revisarDuplicado(flujo)} className="w-full bg-emerald-700 text-white rounded-xl py-2 text-sm font-medium">Confirmar</button>
              </div>
            )}

            {enFlujo && flujo.paso === 'duplicado' && (
              <div className="mt-3 border-t border-stone-100 pt-3">
                <p className="text-sm text-stone-700 mb-2">Esto se parece a {flujo.match.lote.descripcion} por {formatoMoneda(flujo.match.lote.total)}. ¿Es la misma compra?</p>
                <div className="grid grid-cols-1 gap-1.5">
                  <button onClick={() => finalizar(flujo, false)} className="border border-stone-200 rounded-xl py-2 text-xs font-medium text-stone-700">Es la misma (no duplicar inventario)</button>
                  <button onClick={() => finalizar(flujo, true)} className="bg-emerald-700 text-white rounded-xl py-2 text-xs font-medium">Es una compra diferente, registrar</button>
                </div>
              </div>
            )}

            {!enFlujo && (
              <p className="text-2xs text-stone-400 mt-2">Al confirmar, este pedido queda registrado: no vuelvas a escanear su ticket en el corte.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ======================= Modal: Ponerme al día (recuperación rápida) ======================= */

function ModalRecuperacion({ productos, ventasDiarias, compras, pedidos, cortes, onAplicar, onCerrar }) {
  const hoy = hoyISO();
  const [paso, setPaso] = useState(1);
  const ultimaVenta = ventasDiarias.reduce((max, v) => (!max || v.fecha > max ? v.fecha : max), null);
  const desde = ultimaVenta ? sumarDias(ultimaVenta, 1) : sumarDias(hoy, -7);
  const diasHueco = desde <= sumarDias(hoy, -1) ? listaFechasEnRango(desde, sumarDias(hoy, -1)) : [];
  const [ventaAprox, setVentaAprox] = useState('');

  const [imagenPreview, setImagenPreview] = useState(null);
  const [imagenBase64, setImagenBase64] = useState(null);
  const [imagenMediaType, setImagenMediaType] = useState(null);
  const [analizando, setAnalizando] = useState(false);
  const [errorTicket, setErrorTicket] = useState(null);
  const [itemsTicket, setItemsTicket] = useState([]);
  const [dupTicket, setDupTicket] = useState(null);

  const topMonitoreados = useMemo(() => productos.filter((p) => p.monitoreado).slice(0, 5).map((p) => ({ p })), [productos]);
  const [conteos, setConteos] = useState({});

  const manejarFoto = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setErrorTicket(null);
    const lector = new FileReader();
    lector.onload = () => { setImagenPreview(lector.result); setImagenBase64(String(lector.result).split(',')[1]); setImagenMediaType(file.type); };
    lector.readAsDataURL(file);
  };

  const analizarTicket = async () => {
    if (!imagenBase64) return;
    setAnalizando(true); setErrorTicket(null);
    try {
      const listaProductos = productos.map((p) => p.nombre).join(', ');
      const respuesta = await fetch('/api/claude', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 1000,
          system: `Eres un asistente que lee tickets de compra de mercancía para una tienda de abarrotes en México. La tienda maneja: ${listaProductos || 'abarrotes en general'}. Si un producto coincide con uno de esos, usa exactamente ese nombre. Responde ÚNICAMENTE con JSON válido, sin markdown: {"items": [{"producto": "nombre", "cantidad": numero, "costoUnitario": numero}]}`,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: imagenMediaType, data: imagenBase64 } },
            { type: 'text', text: 'Lee este ticket y extrae cada producto con cantidad y costo unitario.' },
          ] }],
        }),
      });
      const datos = await respuesta.json();
      const texto = (datos.content || []).map((b) => b.text || '').join('');
      const parseado = JSON.parse(texto.replace(/```json|```/g, '').trim());
      const items = (parseado.items || []).map((it) => {
        const nom = String(it.producto || '').toLowerCase();
        const match = productos.find((p) => p.nombre.toLowerCase() === nom || p.nombre.toLowerCase().includes(nom) || nom.includes(p.nombre.toLowerCase()));
        return { productoNombre: it.producto || 'Sin identificar', productoId: match ? match.id : null, cantidad: it.cantidad || 1, costoUnitario: it.costoUnitario || 0 };
      });
      const candidato = { proveedor: null, fecha: hoy, total: items.reduce((s, i) => s + i.cantidad * i.costoUnitario, 0), nombres: items.map((i) => i.productoNombre) };
      const match = detectarDuplicado(candidato, agruparLotesCompras(compras, pedidos, hoy, MOTOR_CONFIG), hoy, MOTOR_CONFIG);
      if (match) { setDupTicket({ items, match }); } else { setItemsTicket(items); }
      setImagenPreview(null); setImagenBase64(null);
    } catch (e) { setErrorTicket('No se pudo leer el ticket. Intenta con mejor luz.'); }
    finally { setAnalizando(false); }
  };

  const aplicar = () => {
    const ventasNuevas = [];
    const montoDia = parseFloat(ventaAprox) || 0;
    if (montoDia > 0) diasHueco.forEach((f) => ventasNuevas.push({ id: generarId(), fecha: f, monto: montoDia, estimado: true }));
    const loteId = generarId();
    const comprasNuevas = itemsTicket.filter((i) => i.cantidad > 0).map((i) => ({
      id: generarId(), fecha: hoy, productoId: i.productoId, productoNombre: i.productoNombre,
      cantidad: i.cantidad, costoUnitario: i.costoUnitario, total: +(i.cantidad * i.costoUnitario).toFixed(2), loteId,
    }));
    const conteosLimpios = {};
    Object.entries(conteos).forEach(([id, val]) => { if (val !== '' && !isNaN(parseFloat(val))) conteosLimpios[id] = parseFloat(val); });
    onAplicar({ ventasNuevas, comprasNuevas, conteos: conteosLimpios });
  };

  return (
    <Modal titulo="Ponerme al día" onCerrar={onCerrar}>
      <div className="flex gap-1 mb-3">
        {[1, 2, 3].map((n) => <div key={n} className={`flex-1 h-1 rounded-full ${paso >= n ? 'bg-emerald-600' : 'bg-stone-200'}`} />)}
      </div>

      {paso === 1 && (
        <div>
          <p className="text-sm font-medium text-stone-800 mb-1">1 · Ventas aproximadas</p>
          {diasHueco.length === 0 ? (
            <p className="text-xs text-stone-500 mb-3">Tus ventas diarias están al día. Pasa al siguiente paso.</p>
          ) : (
            <>
              <p className="text-xs text-stone-500 mb-2">Faltan {diasHueco.length} día{diasHueco.length === 1 ? '' : 's'} ({formatoFechaCorta(diasHueco[0])} – {formatoFechaCorta(diasHueco[diasHueco.length - 1])}). ¿Cuánto vendiste aprox. por día?</p>
              <input type="number" inputMode="decimal" value={ventaAprox} onChange={(e) => setVentaAprox(e.target.value)} placeholder="Ej. 2500" className={claseInput + ' font-mono-num mb-1'} />
              <p className="text-2xs text-stone-400 mb-2">Se guardará marcado como estimado; puedes afinarlo después en un corte.</p>
            </>
          )}
          <button onClick={() => setPaso(2)} className="w-full bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-medium">Siguiente</button>
        </div>
      )}

      {paso === 2 && (
        <div>
          <p className="text-sm font-medium text-stone-800 mb-1">2 · Tu último ticket de compra</p>
          <p className="text-xs text-stone-500 mb-2">Con la foto actualizamos costos e inventario de un jalón. Si no lo tienes a la mano, sáltalo.</p>
          {dupTicket ? (
            <div className="border border-orange-200 bg-orange-50 rounded-xl p-3 mb-2">
              <p className="text-xs text-orange-800 mb-2">Este ticket se parece a {dupTicket.match.lote.descripcion} por {formatoMoneda(dupTicket.match.lote.total)}. ¿Es la misma compra?</p>
              <div className="grid grid-cols-1 gap-1.5">
                <button onClick={() => setDupTicket(null)} className="border border-stone-200 bg-white rounded-xl py-2 text-xs font-medium text-stone-700">Es la misma (no duplicar)</button>
                <button onClick={() => { setItemsTicket(dupTicket.items); setDupTicket(null); }} className="bg-emerald-700 text-white rounded-xl py-2 text-xs font-medium">Es diferente, usar el ticket</button>
              </div>
            </div>
          ) : itemsTicket.length > 0 ? (
            <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-3 mb-2">
              <p className="text-xs text-emerald-800">Ticket leído: {itemsTicket.length} producto{itemsTicket.length === 1 ? '' : 's'} por {formatoMoneda(itemsTicket.reduce((s, i) => s + i.cantidad * i.costoUnitario, 0))}.</p>
            </div>
          ) : !imagenPreview ? (
            <label htmlFor="foto-recuperacion" className="w-full border-2 border-dashed border-stone-300 rounded-xl py-5 flex flex-col items-center gap-2 text-stone-500 active:bg-stone-50 cursor-pointer mb-2">
              <Camera size={22} />
              <span className="text-sm font-medium">Foto del último ticket</span>
            </label>
          ) : (
            <div className="space-y-2 mb-2">
              <img src={imagenPreview} alt="Ticket de compra" className="w-full rounded-xl max-h-44 object-cover" />
              <div className="flex gap-2">
                <button onClick={() => { setImagenPreview(null); setImagenBase64(null); }} className="flex-1 border border-stone-200 rounded-xl py-2 text-sm font-medium text-stone-600">Cancelar</button>
                <button onClick={analizarTicket} disabled={analizando} className="flex-1 bg-orange-600 text-white rounded-xl py-2 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60">
                  {analizando ? (<><Loader2 size={16} className="animate-spin" /> Leyendo…</>) : (<><Sparkles size={16} /> Leer ticket</>)}
                </button>
              </div>
            </div>
          )}
          <input id="foto-recuperacion" type="file" accept="image/*" onClick={(e) => { e.currentTarget.value = null; }} onChange={manejarFoto} className="hidden" />
          {errorTicket && <p className="text-sm text-rose-600 mb-2">{errorTicket}</p>}
          <button onClick={() => setPaso(3)} className="w-full bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-medium">Siguiente</button>
        </div>
      )}

      {paso === 3 && (
        <div>
          <p className="text-sm font-medium text-stone-800 mb-1">3 · Conteo express</p>
          <p className="text-xs text-stone-500 mb-2">Cuenta rápido cuántas piezas te quedan de tus productos clave (los que puedas):</p>
          <div className="space-y-1.5 mb-3">
            {topMonitoreados.map(({ p }) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-stone-700 truncate">{p.nombre}</span>
                <input type="number" inputMode="numeric" value={conteos[p.id] || ''} onChange={(e) => setConteos((c) => ({ ...c, [p.id]: e.target.value }))} placeholder={String(p.stock)} className="w-20 border border-stone-200 rounded-lg px-2 py-1 text-sm font-mono-num text-right" />
              </div>
            ))}
            {topMonitoreados.length === 0 && <p className="text-xs text-stone-400">No tienes productos monitoreados aún.</p>}
          </div>
          <button onClick={aplicar} className="w-full bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-medium">Aplicar y recalcular</button>
        </div>
      )}
    </Modal>
  );
}

/* ======================= Tab: Zona (oportunidades de mercado) ======================= */

function TabZona({ zona, historial, onGuardarZona, onNuevaBusqueda }) {
  const [zonaInput, setZonaInput] = useState(zona || '');
  const [pidiendoUbicacion, setPidiendoUbicacion] = useState(false);
  const [ubicacionConfirmada, setUbicacionConfirmada] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState(null);

  const pedirUbicacion = () => {
    setPidiendoUbicacion(true);
    setErrorUbicacion(null);
    if (!navigator.geolocation) {
      setErrorUbicacion('Tu navegador no soporta ubicación. Escribe tu zona abajo.');
      setPidiendoUbicacion(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => { setUbicacionConfirmada(true); setPidiendoUbicacion(false); },
      () => { setErrorUbicacion('No se pudo obtener tu ubicación. Escribe tu zona abajo.'); setPidiendoUbicacion(false); },
      { timeout: 8000 }
    );
  };

  const guardarZona = () => {
    if (!zonaInput.trim()) return;
    onGuardarZona(zonaInput.trim());
  };

  const buscarOportunidades = async () => {
    setBuscando(true);
    setErrorBusqueda(null);
    try {
      const respuesta = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: 'Eres un analista de mercado local para pequeños comercios en México. Te dan la zona donde está un abarrotes (tienda de conveniencia de barrio). Usa búsqueda web para investigar qué negocios y servicios existen en esa zona, y detecta cuáles parecen escasos o ausentes cerca. Responde en español de México, tono directo y práctico, máximo 150 palabras, sin markdown. Menciona 2-4 oportunidades concretas. Aclara que es una estimación basada en lo que encontraste en internet, no un censo exacto.',
          messages: [{ role: 'user', content: `Zona del negocio: ${zona}. Tipo de negocio: tienda de abarrotes de barrio. Encuentra oportunidades de mercado cercanas: productos o servicios que parecen faltar cerca y que un abarrotes podría aprovechar.` }],
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        }),
      });
      const datos = await respuesta.json();
      const texto = (datos.content || []).map((b) => (b.type === 'text' ? b.text : '')).filter(Boolean).join('\n').trim();
      await onNuevaBusqueda({ id: generarId(), fecha: hoyISO(), texto });
    } catch (e) {
      setErrorBusqueda('No se pudo hacer la búsqueda. Intenta de nuevo.');
    } finally {
      setBuscando(false);
    }
  };

  if (!zona) {
    return (
      <div className="space-y-4 pb-4">
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin size={16} className="text-orange-600" />
            <p className="font-display font-semibold text-stone-800 text-sm">Oportunidades cerca de tu negocio</p>
          </div>
          <p className="text-xs text-stone-500 mb-4">Detecta qué productos o servicios no existen cerca de tu tienda, para que consideres ofrecerlos.</p>

          <button onClick={pedirUbicacion} disabled={pidiendoUbicacion} className="w-full border border-stone-200 rounded-xl py-2.5 text-sm font-medium text-stone-600 flex items-center justify-center gap-2 mb-3 disabled:opacity-60">
            {pidiendoUbicacion ? (<><Loader2 size={16} className="animate-spin" /> Detectando…</>) : ubicacionConfirmada ? (<><Check size={16} className="text-emerald-600" /> Ubicación confirmada</>) : (<><MapPin size={16} /> Usar mi ubicación</>)}
          </button>
          {errorUbicacion && <p className="text-xs text-amber-600 mb-3">{errorUbicacion}</p>}

          <Campo etiqueta="Tu colonia, barrio o zona">
            <input value={zonaInput} onChange={(e) => setZonaInput(e.target.value)} placeholder="Ej. Colonia Obrera, CDMX" className={claseInput} />
          </Campo>
          <button onClick={guardarZona} disabled={!zonaInput.trim()} className="w-full bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50">
            Guardar zona
          </button>
          <p className="text-2xs text-stone-400 mt-3">Tu ubicación solo confirma que estás cerca; la búsqueda siempre usa el texto que escribas arriba.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-orange-600" />
            <p className="font-display font-semibold text-stone-800 text-sm">Tu zona: {zona}</p>
          </div>
          <button onClick={() => onGuardarZona('')} className="text-2xs text-stone-400 underline shrink-0">cambiar</button>
        </div>
        <p className="text-xs text-stone-500 mt-2 mb-3">Busca qué productos o servicios no existen cerca de tu tienda, según lo que hay disponible en internet.</p>
        <button onClick={buscarOportunidades} disabled={buscando} className="w-full bg-orange-600 text-white rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60">
          {buscando ? (<><Loader2 size={16} className="animate-spin" /> Buscando en tu zona…</>) : (<><Sparkles size={16} /> Buscar oportunidades</>)}
        </button>
        {errorBusqueda && <p className="text-sm text-rose-600 mt-2">{errorBusqueda}</p>}
        {historial[0] && (
          <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-line mt-3 pt-3 border-t border-stone-100">{historial[0].texto}</p>
        )}
        <p className="text-2xs text-stone-400 mt-3">Es una estimación basada en lo que hay indexado en internet, no un censo exacto. Úsalo como punto de partida.</p>
      </div>

      {historial.length > 1 && (
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="font-display font-semibold text-stone-800 text-sm mb-2">Búsquedas anteriores</p>
          <div className="space-y-2">
            {historial.slice(1).map((h) => (
              <details key={h.id} className="text-sm">
                <summary className="text-stone-500 cursor-pointer">{formatoFechaCorta(h.fecha)}</summary>
                <p className="text-stone-600 mt-1 whitespace-pre-line">{h.texto}</p>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ======================= Modal: Registrar corte ======================= */

function ModalCorte({ productos, fiados, cortes, bitacora, compras, pedidos, onGuardar, onCerrar }) {
  const ultimoCorte = cortes[0];
  const inicioSugerido = ultimoCorte ? sumarDias(ultimoCorte.fechaFin, 1) : sumarDias(hoyISO(), -2);
  const [fechaInicio, setFechaInicio] = useState(inicioSugerido > hoyISO() ? hoyISO() : inicioSugerido);
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const fechas = fechaInicio <= fechaFin ? listaFechasEnRango(fechaInicio, fechaFin) : [];

  const ultimaEntrada = (bitacora || []).find((b) => b.tipo === 'semana' || b.tipo === 'informe-legado');
  const diasDesdeBitacora = ultimaEntrada ? diasEntre(ultimaEntrada.fechaFin, hoyISO()) : null;
  const bitacoraReciente = ultimaEntrada && diasDesdeBitacora <= 8;
  const [posibleDuplicado, setPosibleDuplicado] = useState(null);

  const [ventasPorDia, setVentasPorDia] = useState({});
  const cambiarVentaDia = (fecha, valor) => setVentasPorDia((v) => ({ ...v, [fecha]: valor }));
  const totalVentasLapso = Object.values(ventasPorDia).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const [buscarProducto, setBuscarProducto] = useState('');
  const [destacados, setDestacados] = useState([]);
  const productosFiltrados = buscarProducto
    ? productos.filter((p) => p.nombre.toLowerCase().includes(buscarProducto.toLowerCase()) && !destacados.some((d) => d.productoId === p.id)).slice(0, 5)
    : [];
  const agregarDestacado = (p) => {
    setDestacados((d) => [...d, { productoId: p.id, nombre: p.nombre, cantidad: 1, existenciaActual: '' }]);
    setBuscarProducto('');
  };
  const quitarDestacado = (id) => setDestacados((d) => d.filter((x) => x.productoId !== id));
  const cambiarDestacado = (id, campo, valor) => setDestacados((d) => d.map((x) => (x.productoId === id ? { ...x, [campo]: valor } : x)));

  const [imagenPreview, setImagenPreview] = useState(null);
  const [imagenBase64, setImagenBase64] = useState(null);
  const [imagenMediaType, setImagenMediaType] = useState(null);
  const [analizandoTicket, setAnalizandoTicket] = useState(false);
  const [errorTicket, setErrorTicket] = useState(null);
  const [draftCompras, setDraftCompras] = useState([]);
  const inputFotoRef = useRef(null);

  const manejarSeleccionFoto = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setErrorTicket(null);
    const lector = new FileReader();
    lector.onload = () => {
      setImagenPreview(lector.result);
      setImagenBase64(String(lector.result).split(',')[1]);
      setImagenMediaType(file.type);
    };
    lector.readAsDataURL(file);
  };

  const analizarTicket = async () => {
    if (!imagenBase64) return;
    setAnalizandoTicket(true);
    setErrorTicket(null);
    try {
      const listaProductos = productos.map((p) => p.nombre).join(', ');
      const respuesta = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: `Eres un asistente que lee tickets o facturas de compra de mercancía para una tienda de abarrotes en México. La tienda maneja productos como: ${listaProductos || 'productos de abarrotes en general'}. Si un producto del ticket coincide con uno de esos, usa exactamente ese nombre. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin bloques de código markdown, con esta estructura exacta: {"items": [{"producto": "nombre", "cantidad": numero, "costoUnitario": numero}]}`,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: imagenMediaType, data: imagenBase64 } },
              { type: 'text', text: 'Lee este ticket o factura de compra y extrae cada producto con su cantidad y costo unitario.' },
            ],
          }],
        }),
      });
      const datos = await respuesta.json();
      const texto = (datos.content || []).map((b) => b.text || '').join('');
      const limpio = texto.replace(/```json|```/g, '').trim();
      const parseado = JSON.parse(limpio);
      const items = (parseado.items || []).map((it) => {
        const nombreIt = String(it.producto || '').toLowerCase();
        const coincidencia = productos.find((p) => p.nombre.toLowerCase() === nombreIt || p.nombre.toLowerCase().includes(nombreIt) || nombreIt.includes(p.nombre.toLowerCase()));
        return {
          productoNombre: it.producto || 'Producto sin identificar',
          productoId: coincidencia ? coincidencia.id : null,
          cantidad: it.cantidad || 1,
          costoUnitario: it.costoUnitario || 0,
        };
      });
      const hoy = hoyISO();
      const conteoProv = {};
      items.forEach((it) => { if (it.productoId) { const pr = productos.find((p) => p.id === it.productoId); if (pr && pr.proveedor) conteoProv[pr.proveedor] = (conteoProv[pr.proveedor] || 0) + 1; } });
      const provModa = Object.entries(conteoProv).sort((a, b) => b[1] - a[1])[0];
      const candidato = { proveedor: provModa ? provModa[0] : null, fecha: hoy, total: items.reduce((s, i) => s + (i.cantidad || 0) * (i.costoUnitario || 0), 0), nombres: items.map((i) => i.productoNombre) };
      const match = detectarDuplicado(candidato, agruparLotesCompras(compras || [], pedidos || [], hoy, MOTOR_CONFIG), hoy, MOTOR_CONFIG);
      if (match) {
        setPosibleDuplicado({ items, match });
      } else {
        setDraftCompras((d) => [...d, ...items]);
      }
      setImagenPreview(null);
      setImagenBase64(null);
    } catch (e) {
      setErrorTicket('No se pudo leer el ticket. Intenta con una foto más clara o agrégalo manualmente abajo.');
    } finally {
      setAnalizandoTicket(false);
    }
  };

  const cambiarDraftCompra = (idx, campo, valor) => setDraftCompras((d) => d.map((x, i) => (i === idx ? { ...x, [campo]: valor } : x)));
  const quitarDraftCompra = (idx) => setDraftCompras((d) => d.filter((_, i) => i !== idx));
  const agregarCompraManual = () => setDraftCompras((d) => [...d, { productoNombre: '', productoId: null, cantidad: 1, costoUnitario: 0 }]);

  const fiadosPendientes = fiados.filter((f) => !f.cobrado);
  const [cobrosMarcados, setCobrosMarcados] = useState([]);
  const toggleCobro = (id) => setCobrosMarcados((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const [fiadosNuevos, setFiadosNuevos] = useState([]);
  const agregarFiadoNuevo = () => setFiadosNuevos((f) => [...f, { cliente: '', monto: '' }]);
  const cambiarFiadoNuevo = (idx, campo, valor) => setFiadosNuevos((f) => f.map((x, i) => (i === idx ? { ...x, [campo]: valor } : x)));
  const quitarFiadoNuevo = (idx) => setFiadosNuevos((f) => f.filter((_, i) => i !== idx));

  const [mermasNuevas, setMermasNuevas] = useState([]);
  const agregarMermaNueva = () => setMermasNuevas((m) => [...m, { producto: '', motivo: '', valor: '' }]);
  const cambiarMermaNueva = (idx, campo, valor) => setMermasNuevas((m) => m.map((x, i) => (i === idx ? { ...x, [campo]: valor } : x)));
  const quitarMermaNueva = (idx) => setMermasNuevas((m) => m.filter((_, i) => i !== idx));

  const puedeGuardar = fechaInicio <= fechaFin && fechas.length > 0;

  const confirmar = () => {
    onGuardar({ fechaInicio, fechaFin, ventasPorDia, destacados, draftCompras, fiadosNuevos, cobrosIds: cobrosMarcados, mermasNuevas });
  };

  return (
    <Modal titulo="Registrar corte" onCerrar={onCerrar}>
      <div className="space-y-5">
        <div className="rounded-xl p-3 flex items-start gap-2 bg-orange-50 border border-orange-200">
          <BookOpen size={16} className="mt-0.5 shrink-0 text-orange-600" />
          <p className="text-xs text-orange-800">
            {bitacoraReciente
              ? `Tu última entrada de bitácora cubre hasta el ${formatoFechaCorta(ultimaEntrada.fechaFin)}. Este corte alimenta la próxima.`
              : 'Registrar este corte mantiene tu bitácora al día y hace más precisas tus recomendaciones de compra.'}
          </p>
        </div>

        <div>
          <p className="font-display font-semibold text-stone-800 text-sm mb-2">1 · ¿Qué días vas a registrar?</p>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Desde">
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} max={fechaFin} className={claseInput} />
            </Campo>
            <Campo etiqueta="Hasta">
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} max={hoyISO()} className={claseInput} />
            </Campo>
          </div>
        </div>

        {fechas.length > 0 && (
          <div>
            <p className="font-display font-semibold text-stone-800 text-sm mb-2">2 · Ventas de cada día</p>
            <div className="space-y-2">
              {fechas.map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <span className="text-xs text-stone-500 w-16 shrink-0">{formatoFechaCorta(f)}</span>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">$</span>
                    <input type="number" inputMode="decimal" value={ventasPorDia[f] || ''} onChange={(e) => cambiarVentaDia(f, e.target.value)} placeholder="0.00" className={claseInput + ' pl-7 font-mono-num'} />
                  </div>
                </div>
              ))}
            </div>
            {totalVentasLapso > 0 && <p className="text-xs text-stone-400 mt-2">Total del lapso: <span className="font-mono-num font-semibold text-stone-700">{formatoMoneda(totalVentasLapso)}</span></p>}
          </div>
        )}

        <div>
          <p className="font-display font-semibold text-stone-800 text-sm mb-2">3 · Productos que más se vendieron</p>
          <p className="text-xs text-stone-500 mb-2">No hace falta anotar todo, solo lo que más salió. Al agregarlo se marcará como monitoreado.</p>
          <input value={buscarProducto} onChange={(e) => setBuscarProducto(e.target.value)} placeholder="Buscar producto para agregar…" className={claseInput} />
          {productosFiltrados.length > 0 && (
            <div className="border border-stone-200 rounded-xl mt-1 overflow-hidden">
              {productosFiltrados.map((p) => (
                <button key={p.id} onClick={() => agregarDestacado(p)} className="w-full text-left px-3 py-2 text-sm text-stone-700 border-b border-stone-100 last:border-0 active:bg-stone-50">
                  + {p.nombre}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2 mt-3">
            {destacados.map((d) => (
              <div key={d.productoId} className="border border-stone-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-stone-800">{d.nombre}</span>
                  <button onClick={() => quitarDestacado(d.productoId)} className="text-stone-400"><X size={16} /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-2xs text-stone-400 mb-1">Cantidad vendida</span>
                    <input type="number" inputMode="numeric" min="0" value={d.cantidad} onChange={(e) => cambiarDestacado(d.productoId, 'cantidad', parseFloat(e.target.value) || 0)} className={claseInput + ' font-mono-num'} />
                  </label>
                  <label className="block">
                    <span className="block text-2xs text-stone-400 mb-1">Existencia hoy (opcional)</span>
                    <input type="number" inputMode="numeric" min="0" value={d.existenciaActual} onChange={(e) => cambiarDestacado(d.productoId, 'existenciaActual', e.target.value)} placeholder="Contar" className={claseInput + ' font-mono-num'} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="font-display font-semibold text-stone-800 text-sm mb-2">4 · Tickets de lo que surtiste</p>
          <p className="text-xs text-stone-500 mb-2">Toma foto de cada ticket de compra, uno a la vez.</p>
          {!imagenPreview ? (
            <label htmlFor="foto-ticket" className="w-full border-2 border-dashed border-stone-300 rounded-xl py-5 flex flex-col items-center gap-2 text-stone-500 active:bg-stone-50 cursor-pointer">
              <Camera size={22} />
              <span className="text-sm font-medium">Tomar foto de ticket</span>
            </label>
          ) : (
            <div className="space-y-2">
              <img src={imagenPreview} alt="Ticket de compra" className="w-full rounded-xl max-h-48 object-cover" />
              <div className="flex gap-2">
                <button onClick={() => { setImagenPreview(null); setImagenBase64(null); }} className="flex-1 border border-stone-200 rounded-xl py-2 text-sm font-medium text-stone-600">Cancelar</button>
                <button onClick={analizarTicket} disabled={analizandoTicket} className="flex-1 bg-orange-600 text-white rounded-xl py-2 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60">
                  {analizandoTicket ? (<><Loader2 size={16} className="animate-spin" /> Leyendo…</>) : (<><Sparkles size={16} /> Leer ticket</>)}
                </button>
              </div>
            </div>
          )}
          <input id="foto-ticket" ref={inputFotoRef} type="file" accept="image/*" onClick={(e) => { e.currentTarget.value = null; }} onChange={manejarSeleccionFoto} className="hidden" />
          {errorTicket && <p className="text-sm text-rose-600 mt-2">{errorTicket}</p>}

          {posibleDuplicado && (
            <div className="border border-orange-200 bg-orange-50 rounded-xl p-3 mt-3">
              <p className="text-xs text-orange-800 mb-2">Este ticket se parece a {posibleDuplicado.match.lote.descripcion} por {formatoMoneda(posibleDuplicado.match.lote.total)}. ¿Es la misma compra que ya tienes registrada?</p>
              <div className="grid grid-cols-1 gap-1.5">
                <button onClick={() => setPosibleDuplicado(null)} className="border border-stone-200 bg-white rounded-xl py-2 text-xs font-medium text-stone-700">Es la misma, descartar el ticket</button>
                <button onClick={() => { setDraftCompras((d) => [...d, ...posibleDuplicado.items]); setPosibleDuplicado(null); }} className="bg-emerald-700 text-white rounded-xl py-2 text-xs font-medium">Es una compra diferente, agregar</button>
              </div>
            </div>
          )}

          {draftCompras.length > 0 && (
            <div className="space-y-2 mt-3">
              {draftCompras.map((dc, idx) => (
                <div key={idx} className="border border-stone-100 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <input value={dc.productoNombre} onChange={(e) => cambiarDraftCompra(idx, 'productoNombre', e.target.value)} className="flex-1 text-sm font-medium text-stone-800 border-b border-stone-200 focus:outline-none" />
                    <button onClick={() => quitarDraftCompra(idx)} className="text-stone-400 shrink-0"><X size={16} /></button>
                  </div>
                  {!dc.productoId && <p className="text-2xs text-amber-600 mb-2">No coincide con tu catálogo — se contará como inversión, sin actualizar existencia.</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-2xs text-stone-400 mb-1">Cantidad</span>
                      <input type="number" inputMode="numeric" value={dc.cantidad} onChange={(e) => cambiarDraftCompra(idx, 'cantidad', parseFloat(e.target.value) || 0)} className={claseInput + ' font-mono-num'} />
                    </label>
                    <label className="block">
                      <span className="block text-2xs text-stone-400 mb-1">Costo unitario</span>
                      <input type="number" inputMode="decimal" value={dc.costoUnitario} onChange={(e) => cambiarDraftCompra(idx, 'costoUnitario', parseFloat(e.target.value) || 0)} className={claseInput + ' font-mono-num'} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={agregarCompraManual} className="text-sm font-medium text-emerald-700 flex items-center gap-1 mt-2"><Plus size={14} /> Agregar compra manual</button>
        </div>

        {fiadosPendientes.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users size={14} className="text-stone-400" />
              <p className="font-display font-semibold text-stone-800 text-sm">5 · Fiado pendiente de cobro</p>
            </div>
            <div className="space-y-1.5">
              {fiadosPendientes.map((f) => (
                <label key={f.id} className="flex items-center justify-between text-sm border border-stone-100 rounded-xl px-3 py-2">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={cobrosMarcados.includes(f.id)} onChange={() => toggleCobro(f.id)} className="rounded border-stone-300" />
                    {f.cliente}
                  </span>
                  <span className="font-mono-num text-stone-700">{formatoMoneda(f.monto)}</span>
                </label>
              ))}
            </div>
            <p className="text-2xs text-stone-400 mt-1">Marca lo que ya te pagaron en este lapso.</p>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-stone-400" />
            <p className="font-display font-semibold text-stone-800 text-sm">6 · ¿Fiaste algo nuevo?</p>
          </div>
          <div className="space-y-2">
            {fiadosNuevos.map((f, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input value={f.cliente} onChange={(e) => cambiarFiadoNuevo(idx, 'cliente', e.target.value)} placeholder="Cliente" className={claseInput} />
                <input type="number" inputMode="decimal" value={f.monto} onChange={(e) => cambiarFiadoNuevo(idx, 'monto', e.target.value)} placeholder="$" className={claseInput + ' w-24 font-mono-num'} />
                <button onClick={() => quitarFiadoNuevo(idx)} className="text-stone-400 shrink-0"><X size={16} /></button>
              </div>
            ))}
          </div>
          <button onClick={agregarFiadoNuevo} className="text-sm font-medium text-emerald-700 flex items-center gap-1 mt-2"><Plus size={14} /> Agregar fiado</button>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <PackageX size={14} className="text-stone-400" />
            <p className="font-display font-semibold text-stone-800 text-sm">7 · ¿Algo se perdió o se echó a perder?</p>
          </div>
          <div className="space-y-2">
            {mermasNuevas.map((m, idx) => (
              <div key={idx} className="border border-stone-100 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input value={m.producto} onChange={(e) => cambiarMermaNueva(idx, 'producto', e.target.value)} placeholder="Producto" className={claseInput} />
                  <button onClick={() => quitarMermaNueva(idx)} className="text-stone-400 shrink-0"><X size={16} /></button>
                </div>
                <input value={m.motivo} onChange={(e) => cambiarMermaNueva(idx, 'motivo', e.target.value)} placeholder="Motivo (caducó, se rompió…)" className={claseInput} />
                <input type="number" inputMode="decimal" value={m.valor} onChange={(e) => cambiarMermaNueva(idx, 'valor', e.target.value)} placeholder="Valor estimado en pesos" className={claseInput + ' font-mono-num'} />
              </div>
            ))}
          </div>
          <button onClick={agregarMermaNueva} className="text-sm font-medium text-emerald-700 flex items-center gap-1 mt-2"><Plus size={14} /> Agregar pérdida</button>
        </div>

        <button onClick={confirmar} disabled={!puedeGuardar} className="w-full bg-emerald-700 text-white rounded-xl py-3 font-medium disabled:opacity-50">
          Guardar corte
        </button>
      </div>
    </Modal>
  );
}

/* ======================= Otros modales ======================= */

function ModalGasto({ onGuardar, onCerrar }) {
  const [categoria, setCategoria] = useState(CATEGORIAS_GASTO[0]);
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(hoyISO());

  return (
    <Modal titulo="Registrar gasto" onCerrar={onCerrar}>
      <Campo etiqueta="Categoría">
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={claseInput}>
          {CATEGORIAS_GASTO.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Descripción">
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. Pago de luz" className={claseInput} />
      </Campo>
      <Campo etiqueta="Monto">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">$</span>
          <input type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} className={claseInput + ' pl-7 font-mono-num'} />
        </div>
      </Campo>
      <Campo etiqueta="Fecha">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} max={hoyISO()} className={claseInput} />
      </Campo>
      <button
        onClick={() => monto && onGuardar({ categoria, descripcion: descripcion || categoria, monto: parseFloat(monto) || 0, fecha })}
        disabled={!monto}
        className="w-full bg-stone-800 text-white rounded-xl py-2.5 font-medium disabled:opacity-50"
      >
        Guardar gasto
      </button>
    </Modal>
  );
}

function ModalProducto({ productoInicial, onGuardar, onCerrar, onEliminar }) {
  const esEdicion = Boolean(productoInicial && productoInicial.id);
  const [form, setForm] = useState({
    nombre: (productoInicial && productoInicial.nombre) || '',
    categoria: (productoInicial && productoInicial.categoria) || CATEGORIAS_PRODUCTO[0],
    costo: productoInicial && productoInicial.costo != null ? productoInicial.costo : '',
    precio: productoInicial && productoInicial.precio != null ? productoInicial.precio : '',
    stock: productoInicial && productoInicial.stock != null ? productoInicial.stock : 0,
    stockMinimo: productoInicial && productoInicial.stockMinimo != null ? productoInicial.stockMinimo : 5,
    unidad: (productoInicial && productoInicial.unidad) || 'pieza',
    proveedor: (productoInicial && productoInicial.proveedor) || '',
    ivaExento: productoInicial ? Boolean(productoInicial.ivaExento) : false,
    monitoreado: productoInicial ? Boolean(productoInicial.monitoreado) : false,
    ventaSemanalEstimada: productoInicial && productoInicial.ventaSemanalEstimada != null ? productoInicial.ventaSemanalEstimada : '',
  });
  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const guardar = () => {
    if (!form.nombre.trim()) return;
    const hoy = hoyISO();
    const stockNum = parseInt(form.stock) || 0;
    const base = {
      id: (productoInicial && productoInicial.id) || generarId(),
      nombre: form.nombre.trim(),
      categoria: form.categoria,
      costo: parseFloat(form.costo) || 0,
      precio: parseFloat(form.precio) || 0,
      stock: stockNum,
      stockMinimo: parseInt(form.stockMinimo) || 0,
      unidad: form.unidad,
      proveedor: form.proveedor.trim(),
      ivaExento: form.ivaExento,
      monitoreado: form.monitoreado,
      ventaSemanalEstimada: form.ventaSemanalEstimada === '' ? null : parseFloat(form.ventaSemanalEstimada) || null,
    };
    if (esEdicion) {
      const stockCambio = stockNum !== (productoInicial.stock || 0);
      onGuardar({
        ...base,
        creadoEn: productoInicial.creadoEn || hoy,
        stockFecha: stockCambio ? hoy : (productoInicial.stockFecha || hoy),
        ultimoConteo: stockCambio ? hoy : (productoInicial.ultimoConteo || null),
      });
    } else {
      onGuardar({ ...base, creadoEn: hoy, stockFecha: hoy, ultimoConteo: stockNum > 0 ? hoy : null });
    }
  };

  return (
    <Modal titulo={esEdicion ? 'Editar producto' : 'Nuevo producto'} onCerrar={onCerrar}>
      <Campo etiqueta="Nombre">
        <input value={form.nombre} onChange={(e) => cambiar('nombre', e.target.value)} className={claseInput} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Categoría">
          <select value={form.categoria} onChange={(e) => cambiar('categoria', e.target.value)} className={claseInput}>
            {CATEGORIAS_PRODUCTO.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Unidad">
          <select value={form.unidad} onChange={(e) => cambiar('unidad', e.target.value)} className={claseInput}>
            {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Costo">
          <input type="number" inputMode="decimal" value={form.costo} onChange={(e) => cambiar('costo', e.target.value)} className={claseInput + ' font-mono-num'} />
        </Campo>
        <Campo etiqueta="Precio de venta">
          <input type="number" inputMode="decimal" value={form.precio} onChange={(e) => cambiar('precio', e.target.value)} className={claseInput + ' font-mono-num'} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Stock actual">
          <input type="number" inputMode="numeric" value={form.stock} onChange={(e) => cambiar('stock', e.target.value)} className={claseInput + ' font-mono-num'} />
        </Campo>
        <Campo etiqueta="Stock mínimo">
          <input type="number" inputMode="numeric" value={form.stockMinimo} onChange={(e) => cambiar('stockMinimo', e.target.value)} className={claseInput + ' font-mono-num'} />
        </Campo>
      </div>
      <Campo etiqueta="Proveedor">
        <input value={form.proveedor} onChange={(e) => cambiar('proveedor', e.target.value)} placeholder="Opcional" className={claseInput} />
      </Campo>
      <Campo etiqueta="¿Cuántas vendes por semana, aprox? (opcional)">
        <input type="number" inputMode="decimal" value={form.ventaSemanalEstimada} onChange={(e) => cambiar('ventaSemanalEstimada', e.target.value)} placeholder="Ayuda a estimar productos nuevos" className={claseInput + ' font-mono-num'} />
      </Campo>
      <label className="flex items-center gap-2 mb-2 text-sm text-stone-600">
        <input type="checkbox" checked={form.ivaExento} onChange={(e) => cambiar('ivaExento', e.target.checked)} className="rounded border-stone-300" />
        Exento de IVA
      </label>
      <label className="flex items-center gap-2 mb-4 text-sm text-stone-600">
        <input type="checkbox" checked={form.monitoreado} onChange={(e) => cambiar('monitoreado', e.target.checked)} className="rounded border-stone-300" />
        Monitorear (seguimiento detallado en cada corte)
      </label>
      <div className="flex gap-2">
        {esEdicion && (
          <button onClick={() => onEliminar(productoInicial.id)} className="p-2.5 rounded-xl border border-rose-200 text-rose-600">
            <Trash2 size={18} />
          </button>
        )}
        <button onClick={guardar} className="flex-1 bg-emerald-700 text-white rounded-xl py-2.5 font-medium">Guardar</button>
      </div>
    </Modal>
  );
}

function ModalConfig({ config, onGuardar, onCerrar, onBorrarTodo }) {
  const [nombreNegocio, setNombreNegocio] = useState(config.nombreNegocio);
  const [ivaTasa, setIvaTasa] = useState(config.ivaTasa);
  const [presupuestoSemanal, setPresupuestoSemanal] = useState(config.presupuestoSemanal != null ? config.presupuestoSemanal : '');
  const [diaPedidoSemanal, setDiaPedidoSemanal] = useState(config.diaPedidoSemanal != null ? config.diaPedidoSemanal : '');
  const [confirmando, setConfirmando] = useState(false);

  return (
    <Modal titulo="Configuración" onCerrar={onCerrar}>
      <Campo etiqueta="Nombre del negocio">
        <input value={nombreNegocio} onChange={(e) => setNombreNegocio(e.target.value)} className={claseInput} />
      </Campo>
      <Campo etiqueta="Tasa de IVA (%)">
        <input type="number" inputMode="decimal" value={ivaTasa} onChange={(e) => setIvaTasa(e.target.value)} className={claseInput + ' font-mono-num'} />
      </Campo>
      <Campo etiqueta="Presupuesto semanal de compra (opcional)">
        <input type="number" inputMode="decimal" value={presupuestoSemanal} onChange={(e) => setPresupuestoSemanal(e.target.value)} placeholder="Ej. 8000" className={claseInput + ' font-mono-num'} />
      </Campo>
      <Campo etiqueta="Día en que sueles pedir (opcional)">
        <select value={diaPedidoSemanal} onChange={(e) => setDiaPedidoSemanal(e.target.value)} className={claseInput}>
          <option value="">Sin definir</option>
          <option value="0">Domingo</option>
          <option value="1">Lunes</option>
          <option value="2">Martes</option>
          <option value="3">Miércoles</option>
          <option value="4">Jueves</option>
          <option value="5">Viernes</option>
          <option value="6">Sábado</option>
        </select>
      </Campo>
      <button
        onClick={() => onGuardar({ ...config, nombreNegocio, ivaTasa: parseFloat(ivaTasa) || 16, presupuestoSemanal: presupuestoSemanal === '' ? null : parseFloat(presupuestoSemanal) || null, diaPedidoSemanal: diaPedidoSemanal === '' ? null : diaPedidoSemanal })}
        className="w-full bg-emerald-700 text-white rounded-xl py-2.5 font-medium mb-4"
      >
        Guardar cambios
      </button>

      <div className="border-t border-stone-100 pt-4">
        {!confirmando ? (
          <button onClick={() => setConfirmando(true)} className="w-full text-sm text-rose-600 font-medium py-2">Borrar todos los datos</button>
        ) : (
          <div className="text-center">
            <p className="text-sm text-stone-600 mb-2">Esto borrará productos, ventas y gastos. No se puede deshacer.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmando(false)} className="flex-1 border border-stone-200 rounded-xl py-2 text-sm">Cancelar</button>
              <button onClick={onBorrarTodo} className="flex-1 bg-rose-600 text-white rounded-xl py-2 text-sm font-medium">Sí, borrar todo</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ======================= App ======================= */

export default function App() {
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState('inicio');
  const [productos, setProductos] = useState([]);
  const [ventasDiarias, setVentasDiarias] = useState([]);
  const [ventasProducto, setVentasProducto] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [fiados, setFiados] = useState([]);
  const [mermas, setMermas] = useState([]);
  const [cortes, setCortes] = useState([]);
  const [informes, setInformes] = useState([]);
  const [oportunidadesZona, setOportunidadesZona] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [bitacora, setBitacora] = useState([]);
  const [ajustesPersonales, setAjustesPersonales] = useState({});
  const [icdSnapshot, setIcdSnapshot] = useState(null);
  const [config, setConfig] = useState({ nombreNegocio: 'Mi Tienda', ivaTasa: 16, moneda: 'MXN', zona: '' });
  const [modalActivo, setModalActivo] = useState(null);
  const [productoEditar, setProductoEditar] = useState(null);

  useEffect(() => {
    (async () => {
      const datos = await cargarTodo();
      const hoy = hoyISO();
      let prods, vd, vp, gas, cmp, fia, mer, cor, inf, opz, cfg, ped, bit, aj;
      if (datos.productos && datos.productos.length) {
        prods = datos.productos; vd = datos.ventasDiarias || []; vp = datos.ventasProducto || [];
        gas = datos.gastos || []; cmp = datos.compras || []; fia = datos.fiados || []; mer = datos.mermas || [];
        cor = datos.cortes || []; inf = datos.informes || []; opz = datos.oportunidadesZona || [];
        cfg = datos.config || { nombreNegocio: 'Mi Tienda', ivaTasa: 16, moneda: 'MXN', zona: '' };
        ped = datos.pedidos || []; bit = datos.bitacora || []; aj = datos.ajustesPersonales || {};
      } else {
        prods = PRODUCTOS_SEED; vd = generarVentasDiariasIniciales();
        const gen = generarVentasProductoIniciales(PRODUCTOS_SEED);
        vp = gen.registros; cor = gen.cortes;
        cmp = generarComprasIniciales(PRODUCTOS_SEED); gas = generarGastosIniciales();
        fia = generarFiadosIniciales(); mer = generarMermasIniciales(); inf = generarInformeSemanalInicial();
        opz = []; ped = []; bit = []; aj = {};
        cfg = { nombreNegocio: 'Abarrotes Don Beto', ivaTasa: 16, moneda: 'MXN', zona: '' };
      }

      // Migración: campos nuevos de producto (stockFecha, creadoEn, ultimoConteo, ventaSemanalEstimada)
      const mig = migrarProductos(prods, cor, hoy);
      prods = mig.migrados;

      // Migración una sola vez: informes viejos -> entradas legado de bitácora
      if (bit.length === 0 && inf.length > 0) {
        bit = inf.map((i) => ({ id: i.id || generarId(), tipo: 'informe-legado', fechaInicio: i.fechaInicio, fechaFin: i.fechaFin, texto: i.texto, snapshot: null, generadoEn: i.generadoEn || hoy }));
      }

      // Generar entradas de bitácora faltantes (localmente, sin IA)
      const datosBit = { ventasDiarias: vd, ventasProducto: vp, gastos: gas, compras: cmp, fiados: fia, mermas: mer };
      const faltantes = generarBitacoraFaltante(datosBit, bit, hoy, MOTOR_CONFIG, null);
      if (faltantes.length) bit = [...faltantes, ...bit].sort((a, b) => (a.fechaFin < b.fechaFin ? 1 : -1)).slice(0, MOTOR_CONFIG.bitacora.maxEntradas);

      // Rotación diaria del snapshot de ICD (para explicar cambios)
      let snap = datos.icdSnapshot || null;
      if (!snap || snap.fecha !== hoy) {
        const icdHoy = calcularICD({ cortes: cor, compras: cmp, ventasDiarias: vd, productos: prods, ventasProducto: vp, pedidos: ped }, hoy, MOTOR_CONFIG);
        snap = { fecha: hoy, puntos: icdHoy.puntos, componentes: icdHoy.componentes.map((c) => ({ clave: c.clave, obtenido: c.obtenido, max: c.max })), previo: snap ? { puntos: snap.puntos, componentes: snap.componentes } : null };
      }

      setProductos(prods); setVentasDiarias(vd); setVentasProducto(vp); setGastos(gas);
      setCompras(cmp); setFiados(fia); setMermas(mer); setCortes(cor); setInformes(inf);
      setOportunidadesZona(opz); setConfig(cfg); setPedidos(ped); setBitacora(bit);
      setAjustesPersonales(aj); setIcdSnapshot(snap);

      await Promise.all([
        guardar('productos', prods), guardar('ventasDiarias', vd), guardar('ventasProducto', vp),
        guardar('compras', cmp), guardar('gastos', gas), guardar('fiados', fia), guardar('mermas', mer),
        guardar('cortes', cor), guardar('informes', inf), guardar('oportunidadesZona', opz),
        guardar('config', cfg), guardar('pedidos', ped), guardar('bitacora', bit),
        guardar('ajustesPersonales', aj), guardar('icdSnapshot', snap),
      ]);
      setCargando(false);
    })();
  }, []);

  const guardarCorte = async (datos) => {
    const { fechaInicio, fechaFin, ventasPorDia, destacados, draftCompras, fiadosNuevos, cobrosIds, mermasNuevas } = datos;

    const nuevasVD = Object.entries(ventasPorDia)
      .filter(([, monto]) => parseFloat(monto) > 0)
      .map(([fecha, monto]) => ({ id: generarId(), fecha, monto: parseFloat(monto) }));
    const fechasNuevas = new Set(nuevasVD.map((v) => v.fecha));
    const vdRestantes = ventasDiarias.filter((v) => !fechasNuevas.has(v.fecha));
    const vdFinal = [...nuevasVD, ...vdRestantes];

    let productosActualizados = [...productos];
    const nuevasVP = [];
    const mermasAuto = [];
    destacados.forEach((d) => {
      const prod = productosActualizados.find((p) => p.id === d.productoId);
      if (!prod) return;
      nuevasVP.push({
        id: generarId(), fechaInicio, fechaFin, productoId: prod.id, productoNombre: prod.nombre,
        cantidad: d.cantidad, precioUnitario: prod.precio, costoUnitario: prod.costo,
      });
      let stockTrasVenta = Math.max(0, prod.stock - d.cantidad);
      if (d.existenciaActual !== '' && d.existenciaActual != null && !isNaN(parseFloat(d.existenciaActual))) {
        const contado = parseFloat(d.existenciaActual);
        const diferencia = stockTrasVenta - contado;
        if (diferencia > 0.5) {
          mermasAuto.push({
            id: generarId(), fecha: fechaFin, productoNombre: prod.nombre,
            motivo: 'Detectado al comparar existencia contada vs. esperada', valorEstimado: +(diferencia * prod.costo).toFixed(2),
          });
        }
        stockTrasVenta = contado;
      }
      const huboConteo = d.existenciaActual !== '' && d.existenciaActual != null && !isNaN(parseFloat(d.existenciaActual));
      productosActualizados = productosActualizados.map((p) => (p.id === prod.id ? { ...p, stock: stockTrasVenta, monitoreado: true, stockFecha: fechaFin, ultimoConteo: huboConteo ? fechaFin : (p.ultimoConteo || null) } : p));
    });

    const loteCorte = generarId();
    const nuevasCompras = draftCompras.filter((dc) => (parseFloat(dc.cantidad) || 0) > 0).map((dc) => ({
      id: generarId(), fecha: fechaFin, productoId: dc.productoId || null, productoNombre: dc.productoNombre,
      cantidad: parseFloat(dc.cantidad) || 0, costoUnitario: parseFloat(dc.costoUnitario) || 0,
      total: +((parseFloat(dc.cantidad) || 0) * (parseFloat(dc.costoUnitario) || 0)).toFixed(2), loteId: loteCorte,
    }));
    nuevasCompras.forEach((c) => {
      if (c.productoId) {
        productosActualizados = productosActualizados.map((p) => (p.id === c.productoId ? { ...p, stock: p.stock + c.cantidad, stockFecha: fechaFin } : p));
      }
    });

    const nuevosFiados = fiadosNuevos.filter((f) => (parseFloat(f.monto) || 0) > 0).map((f) => ({
      id: generarId(), fecha: fechaFin, cliente: f.cliente || 'Cliente', monto: parseFloat(f.monto), cobrado: false, fechaCobro: null,
    }));
    const fiadosActualizados = fiados.map((f) => (cobrosIds.includes(f.id) ? { ...f, cobrado: true, fechaCobro: fechaFin } : f));

    const nuevasMermasManual = mermasNuevas.filter((m) => (parseFloat(m.valor) || 0) > 0).map((m) => ({
      id: generarId(), fecha: fechaFin, productoNombre: m.producto || 'General', motivo: m.motivo || 'No especificado', valorEstimado: parseFloat(m.valor),
    }));

    const nuevoCorte = { id: generarId(), fechaInicio, fechaFin, fechaRegistro: hoyISO() };

    const vpFinal = [...nuevasVP, ...ventasProducto];
    const comprasFinal = [...nuevasCompras, ...compras];
    const fiadosFinal = [...nuevosFiados, ...fiadosActualizados];
    const mermasFinal = [...nuevasMermasManual, ...mermasAuto, ...mermas];
    const cortesFinal = [nuevoCorte, ...cortes];

    setVentasDiarias(vdFinal);
    setVentasProducto(vpFinal);
    setProductos(productosActualizados);
    setCompras(comprasFinal);
    setFiados(fiadosFinal);
    setMermas(mermasFinal);
    setCortes(cortesFinal);
    setModalActivo(null);

    await Promise.all([
      guardar('ventasDiarias', vdFinal),
      guardar('ventasProducto', vpFinal),
      guardar('productos', productosActualizados),
      guardar('compras', comprasFinal),
      guardar('fiados', fiadosFinal),
      guardar('mermas', mermasFinal),
      guardar('cortes', cortesFinal),
    ]);
  };

  const registrarGasto = async (gasto) => {
    const nuevoGasto = { id: generarId(), ...gasto };
    const nuevosGastos = [nuevoGasto, ...gastos];
    setGastos(nuevosGastos);
    setModalActivo(null);
    await guardar('gastos', nuevosGastos);
  };

  const guardarProducto = async (producto) => {
    const existe = productos.some((p) => p.id === producto.id);
    const nuevosProductos = existe ? productos.map((p) => (p.id === producto.id ? producto : p)) : [producto, ...productos];
    setProductos(nuevosProductos);
    setModalActivo(null);
    setProductoEditar(null);
    await guardar('productos', nuevosProductos);
  };

  const eliminarProducto = async (id) => {
    const nuevosProductos = productos.filter((p) => p.id !== id);
    setProductos(nuevosProductos);
    setModalActivo(null);
    setProductoEditar(null);
    await guardar('productos', nuevosProductos);
  };

  const marcarReabastecer = async (nombreProducto) => {
    const encontrado = productos.find((p) => p.nombre.toLowerCase() === nombreProducto.toLowerCase());
    if (!encontrado) return;
    const nuevoStock = Math.min(encontrado.stock, Math.max(0, encontrado.stockMinimo - 1));
    const nuevosProductos = productos.map((p) => (p.id === encontrado.id ? { ...p, stock: nuevoStock } : p));
    setProductos(nuevosProductos);
    await guardar('productos', nuevosProductos);
  };

  const confirmarPedido = async ({ pedido, comprasNuevas, muestras }) => {
    const hoy = hoyISO();
    const comprasFinal = [...comprasNuevas, ...compras];
    const nuevosProductos = productos.map((p) => {
      const recibido = comprasNuevas.filter((c) => c.productoId === p.id).reduce((s, c) => s + c.cantidad, 0);
      if (recibido > 0) {
        const ultCosto = comprasNuevas.filter((c) => c.productoId === p.id).slice(-1)[0];
        return { ...p, stock: p.stock + recibido, stockFecha: hoy, costo: ultCosto ? ultCosto.costoUnitario : p.costo };
      }
      return p;
    });
    const pedidosFinal = [pedido, ...pedidos].slice(0, 30);
    const ajustesFinal = { ...ajustesPersonales };
    Object.entries(muestras || {}).forEach(([id, ratio]) => { ajustesFinal[id] = [...(ajustesFinal[id] || []), ratio].slice(-6); });
    setCompras(comprasFinal); setProductos(nuevosProductos); setPedidos(pedidosFinal); setAjustesPersonales(ajustesFinal);
    await Promise.all([guardar('compras', comprasFinal), guardar('productos', nuevosProductos), guardar('pedidos', pedidosFinal), guardar('ajustesPersonales', ajustesFinal)]);
  };

  const aplicarRecuperacion = async ({ ventasNuevas, comprasNuevas, conteos }) => {
    const hoy = hoyISO();
    const fechasNuevas = new Set(ventasNuevas.map((v) => v.fecha));
    const vdFinal = [...ventasNuevas, ...ventasDiarias.filter((v) => !fechasNuevas.has(v.fecha))];
    const comprasFinal = [...comprasNuevas, ...compras];
    let nuevosProductos = productos.map((p) => {
      const recibido = comprasNuevas.filter((c) => c.productoId === p.id).reduce((s, c) => s + c.cantidad, 0);
      return recibido > 0 ? { ...p, stock: p.stock + recibido, stockFecha: hoy } : p;
    });
    nuevosProductos = nuevosProductos.map((p) => (conteos[p.id] != null ? { ...p, stock: conteos[p.id], stockFecha: hoy, ultimoConteo: hoy } : p));
    setVentasDiarias(vdFinal); setCompras(comprasFinal); setProductos(nuevosProductos); setModalActivo(null);
    await Promise.all([guardar('ventasDiarias', vdFinal), guardar('compras', comprasFinal), guardar('productos', nuevosProductos)]);
  };

  const actualizarBitacora = async (entrada) => {
    const nuevas = bitacora.map((b) => (b.id === entrada.id ? entrada : b));
    setBitacora(nuevas);
    await guardar('bitacora', nuevas);
  };

  const actualizarConfig = async (nuevoConfig) => {
    setConfig(nuevoConfig);
    setModalActivo(null);
    await guardar('config', nuevoConfig);
  };

  const actualizarZona = async (zona) => {
    const nuevoConfig = { ...config, zona };
    setConfig(nuevoConfig);
    await guardar('config', nuevoConfig);
  };

  const guardarOportunidadZona = async (entrada) => {
    const nuevas = [entrada, ...oportunidadesZona].slice(0, 5);
    setOportunidadesZona(nuevas);
    await guardar('oportunidadesZona', nuevas);
  };

  const borrarTodo = async () => {
    setProductos([]); setVentasDiarias([]); setVentasProducto([]); setGastos([]);
    setCompras([]); setFiados([]); setMermas([]); setCortes([]); setInformes([]);
    setPedidos([]); setBitacora([]); setAjustesPersonales({}); setIcdSnapshot(null);
    setModalActivo(null);
    await Promise.all([
      guardar('productos', []), guardar('ventasDiarias', []), guardar('ventasProducto', []),
      guardar('gastos', []), guardar('compras', []), guardar('fiados', []), guardar('mermas', []),
      guardar('cortes', []), guardar('informes', []), guardar('pedidos', []), guardar('bitacora', []),
      guardar('ajustesPersonales', {}), guardar('icdSnapshot', null),
    ]);
  };

  const usarEnInventario = (costo, precio) => {
    setProductoEditar({ nombre: '', categoria: CATEGORIAS_PRODUCTO[0], costo, precio, stock: 0, stockMinimo: 5, unidad: 'pieza', proveedor: '', ivaExento: false, monitoreado: false });
    setModalActivo('producto');
  };

  const agregarDesdeEscaneo = (draft) => {
    setProductoEditar(draft);
    setModalActivo('producto');
  };

  const alertasCompras = productos.filter((p) => p.stock <= p.stockMinimo).length;

  if (cargando) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-700" size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@500;600;700&display=swap');
        .font-display { font-family: 'Archivo', sans-serif; }
        .font-mono-num { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        .text-2xs { font-size: 11px; line-height: 1rem; }
      `}</style>
      <Encabezado nombreNegocio={config.nombreNegocio} onConfig={() => setModalActivo('config')} />
      <main className="max-w-lg mx-auto px-4 pt-4 pb-24">
        {tab === 'inicio' && (
          <TabInicio productos={productos} ventasDiarias={ventasDiarias} ventasProducto={ventasProducto} gastos={gastos} compras={compras} fiados={fiados} mermas={mermas} cortes={cortes} bitacora={bitacora}
            onRegistrarCorte={() => setModalActivo('corte')} onRegistrarGasto={() => setModalActivo('gasto')} onIrAFinanzas={() => setTab('finanzas')} />
        )}
        {tab === 'inventario' && (
          <TabInventario productos={productos}
            onNuevoProducto={() => { setProductoEditar(null); setModalActivo('producto'); }}
            onEditarProducto={(p) => { setProductoEditar(p); setModalActivo('producto'); }}
            onMarcarReabastecer={marcarReabastecer}
            onAgregarDesdeEscaneo={agregarDesdeEscaneo} />
        )}
        {tab === 'finanzas' && (
          <TabFinanzas productos={productos} ventasDiarias={ventasDiarias} ventasProducto={ventasProducto} gastos={gastos} compras={compras} fiados={fiados} mermas={mermas} bitacora={bitacora} onActualizarBitacora={actualizarBitacora} nombreNegocio={config.nombreNegocio} />
        )}
        {tab === 'precios' && <TabPrecios ivaDefault={config.ivaTasa} onUsarEnInventario={usarEnInventario} />}
        {tab === 'compras' && <TabCompras productos={productos} ventasProducto={ventasProducto} ventasDiarias={ventasDiarias} compras={compras} cortes={cortes} pedidos={pedidos} config={config} ajustesPersonales={ajustesPersonales} icdSnapshot={icdSnapshot} onConfirmarPedido={confirmarPedido} onPonerseAlDia={() => setModalActivo('recuperacion')} />}
        {tab === 'zona' && <TabZona zona={config.zona} historial={oportunidadesZona} onGuardarZona={actualizarZona} onNuevaBusqueda={guardarOportunidadZona} />}
        {tab === 'anaqueles' && <ModuloAnaqueles />}
      </main>
      <NavInferior tab={tab} setTab={setTab} alertasCompras={alertasCompras} />

      {modalActivo === 'corte' && <ModalCorte productos={productos} fiados={fiados} cortes={cortes} bitacora={bitacora} compras={compras} pedidos={pedidos} onGuardar={guardarCorte} onCerrar={() => setModalActivo(null)} />}
      {modalActivo === 'gasto' && <ModalGasto onGuardar={registrarGasto} onCerrar={() => setModalActivo(null)} />}
      {modalActivo === 'producto' && (
        <ModalProducto productoInicial={productoEditar} onGuardar={guardarProducto}
          onCerrar={() => { setModalActivo(null); setProductoEditar(null); }} onEliminar={eliminarProducto} />
      )}
      {modalActivo === 'recuperacion' && <ModalRecuperacion productos={productos} ventasDiarias={ventasDiarias} compras={compras} pedidos={pedidos} cortes={cortes} onAplicar={aplicarRecuperacion} onCerrar={() => setModalActivo(null)} />}
      {modalActivo === 'config' && <ModalConfig config={config} onGuardar={actualizarConfig} onCerrar={() => setModalActivo(null)} onBorrarTodo={borrarTodo} />}
    </div>
  );
}
