/**
 * Nombre y descripción de cada letra del alfabeto dactilológico, sin sus plantillas de
 * reconocimiento (content/signs/fingerspelling.json pesa ~1 MB): para pintar la letra en el
 * repaso o en un ejercicio sin cargar el reconocedor. Un test comprueba que coincide con
 * fingerspelling.json.
 */
export const LETTERS: Record<string, { translation: string; description: string }> = {
  "A": { translation: "A", description: "Puño cerrado con el pulgar extendido apoyado al lateral." },
  "B": { translation: "B", description: "Palma plana hacia delante, cuatro dedos juntos y pulgar cruzado sobre la palma." },
  "C": { translation: "C", description: "Mano en forma de C, dedos y pulgar curvados." },
  "D": { translation: "D", description: "Índice extendido hacia arriba; pulgar toca las yemas de los dedos medios y anular." },
  "E": { translation: "E", description: "Puño con las yemas de los dedos tocando el pulgar plegado." },
  "F": { translation: "F", description: "Pulgar y índice forman un círculo; anular, corazón y meñique extendidos." },
  "G": { translation: "G", description: "Pulgar e índice extendidos paralelos, orientados horizontalmente." },
  "H": { translation: "H", description: "Índice y corazón extendidos juntos, en horizontal." },
  "I": { translation: "I", description: "Puño con el meñique extendido hacia arriba." },
  "J": { translation: "J", description: "Meñique extendido dibujando una J en el aire (aproximación estática: meñique + curva hacia abajo)." },
  "K": { translation: "K", description: "Índice y corazón extendidos en V con pulgar tocando la base del corazón." },
  "L": { translation: "L", description: "Pulgar y índice extendidos formando una L." },
  "M": { translation: "M", description: "Tres dedos (índice, corazón, anular) sobre el pulgar plegado." },
  "N": { translation: "N", description: "Dos dedos (índice y corazón) sobre el pulgar plegado." },
  "O": { translation: "O", description: "Dedos y pulgar forman un círculo cerrado." },
  "P": { translation: "P", description: "Como K rotada hacia abajo: índice y corazón bajos con pulgar entre ellos." },
  "Q": { translation: "Q", description: "Como G rotada hacia abajo: pulgar e índice hacia el suelo." },
  "R": { translation: "R", description: "Índice y corazón cruzados, extendidos hacia arriba." },
  "S": { translation: "S", description: "Puño cerrado con el pulgar por delante de los dedos." },
  "T": { translation: "T", description: "Pulgar entre índice y corazón, ambos parcialmente flexionados." },
  "U": { translation: "U", description: "Índice y corazón extendidos y juntos hacia arriba." },
  "V": { translation: "V", description: "Índice y corazón extendidos separados formando V." },
  "W": { translation: "W", description: "Índice, corazón y anular extendidos separados." },
  "X": { translation: "X", description: "Índice extendido y flexionado en la primera falange (forma de gancho)." },
  "Y": { translation: "Y", description: "Pulgar y meñique extendidos, resto de dedos cerrados." },
  "Z": { translation: "Z", description: "Índice extendido dibujando una Z (aproximación estática: solo índice extendido)." },
  "Ñ": { translation: "Ñ", description: "Como N pero con movimiento ondulatorio del dorso (aproximación estática igual a N)." },
};

export function getLetterMeta(letterId: string): { translation: string; description: string } | undefined {
  return LETTERS[letterId];
}
