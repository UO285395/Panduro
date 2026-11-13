/** Los dos aspectos de la app (ver app/globals.css y components/ui/StyleSwitch). */
export type Estilo = "juego" | "cuaderno";

export const ESTILO_KEY = "panduro.estilo";

/**
 * Se ejecuta en <head>, antes de pintar: pone en <html> el estilo guardado para que la página
 * no parpadee de uno a otro al cargar.
 */
export const ESTILO_SCRIPT = `try{var e=localStorage.getItem(${JSON.stringify(ESTILO_KEY)});if(e==="cuaderno"||e==="juego")document.documentElement.dataset.estilo=e}catch(_){}`;
