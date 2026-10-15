/**
 * Nombre y descripción de cada letra del alfabeto dactilológico, sin sus plantillas de
 * reconocimiento (content/signs/fingerspelling.json pesa ~1 MB): para pintar la letra en el
 * repaso o en un ejercicio sin cargar el reconocedor. Un test comprueba que coincide con
 * fingerspelling.json.
 */
export const LETTERS: Record<string, { translation: string; description: string }> = {
  "A": { translation: "A", description: "La mano en puño, con la palma hacia delante y el pulgar estirado, pegado al lado del índice." },
  "B": { translation: "B", description: "La mano plana y horizontal delante del pecho, con los dedos juntos apuntando hacia el otro lado y la palma hacia abajo." },
  "C": { translation: "C", description: "La mano en forma de C, vista de lado: los dedos juntos y curvados frente al pulgar." },
  "D": { translation: "D", description: "El índice estirado hacia arriba; los demás dedos, doblados, tocan con las yemas el pulgar." },
  "E": { translation: "E", description: "La palma hacia delante, los cuatro dedos doblados por la mitad, como un gancho, y el pulgar estirado hacia un lado." },
  "F": { translation: "F", description: "La palma hacia delante; el índice, doblado, toca con la yema la del pulgar, y el corazón, el anular y el meñique quedan estirados y separados." },
  "G": { translation: "G", description: "El índice estirado en horizontal, apuntando hacia el otro lado, y los demás dedos cerrados." },
  "H": { translation: "H", description: "El índice y el corazón estirados y separados, con el pulgar hacia fuera y el anular y el meñique cerrados; la mano gira la muñeca hasta que los dedos apuntan hacia abajo." },
  "I": { translation: "I", description: "La mano en puño con el meñique estirado hacia arriba." },
  "J": { translation: "J", description: "Como la I, con el meñique estirado hacia arriba, y la mano gira dibujando una J." },
  "K": { translation: "K", description: "El índice estirado hacia arriba, en diagonal, y el corazón estirado hacia delante, con el pulgar tocándolo; el anular y el meñique, cerrados." },
  "L": { translation: "L", description: "El índice estirado hacia arriba y el pulgar hacia un lado, formando una L; los demás dedos, cerrados." },
  "M": { translation: "M", description: "El dorso de la mano hacia arriba y la muñeca doblada: el índice, el corazón y el anular estirados hacia abajo; el meñique y el pulgar, recogidos." },
  "N": { translation: "N", description: "Como la M, pero solo con el índice y el corazón estirados hacia abajo." },
  "O": { translation: "O", description: "El pulgar y el índice forman un círculo redondo; el corazón, el anular y el meñique, estirados hacia arriba y separados." },
  "P": { translation: "P", description: "El índice, el corazón y el anular estirados hacia arriba y juntos; el pulgar y el meñique, doblados, se tocan por las yemas." },
  "Q": { translation: "Q", description: "Los dedos juntos y algo doblados hacia delante, con el pulgar por debajo, como un pico abierto." },
  "R": { translation: "R", description: "El índice y el corazón estirados hacia arriba y cruzados; los demás dedos, cerrados." },
  "S": { translation: "S", description: "El índice y el meñique estirados hacia arriba; el corazón y el anular, doblados, tocan el pulgar." },
  "T": { translation: "T", description: "El índice, doblado, y el pulgar, hacia arriba, se tocan por la punta; el corazón, el anular y el meñique, estirados y separados. Se parece a la F, con el pulgar más vertical." },
  "U": { translation: "U", description: "El índice y el corazón estirados hacia arriba y abiertos en V, con la palma hacia delante; el pulgar sujeta el anular y el meñique." },
  "V": { translation: "V", description: "El índice y el corazón estirados hacia arriba, separados y casi paralelos; el pulgar sujeta el anular y el meñique." },
  "W": { translation: "W", description: "El índice, el corazón y el anular estirados hacia arriba y separados; el pulgar sujeta el meñique." },
  "X": { translation: "X", description: "El índice doblado en gancho y los demás dedos cerrados; la mano avanza un poco hacia delante." },
  "Y": { translation: "Y", description: "El pulgar estirado hacia arriba y el índice doblado hacia delante, en horizontal; los demás dedos, cerrados." },
  "Z": { translation: "Z", description: "El índice estirado dibuja una Z en el aire, delante del pecho." },
  "Ñ": { translation: "Ñ", description: "Como la N, con el índice y el corazón hacia abajo, y la mano se balancea a un lado y a otro." },
};

export function getLetterMeta(letterId: string): { translation: string; description: string } | undefined {
  return LETTERS[letterId];
}
