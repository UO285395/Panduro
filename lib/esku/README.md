# lib/esku

Motor de reconocimiento de LSE de [Esku](https://github.com/Endika/esku) (MIT, © 2026 Endika
Iglesias; licencia en `LICENSE`), copiado del commit `680a672` (release 1.18.0).

Se ha copiado la parte independiente de la interfaz: `domain/`, los casos de uso
`RecognizeSignsUseCase` y `TeachCustomSignUseCase`, `infrastructure/recognition`,
`infrastructure/vision` y los fixtures de paridad con PyTorch. Cambios respecto al original:

- Alias de importación reescritos a `@/lib/esku/...`.
- `gru.ts`: `Float32Array<ArrayBuffer>` → `Float32Array` (TypeScript 5.6 no admite el genérico).
- Rutas de los fixtures y de `public/models` en los tests.

Los tests de paridad (`VocabularySignClassifier`, `alphabetParity`, `vocabularySignature`)
comparan la red y las características con las salidas de PyTorch del entrenamiento: si
alguno falla, lo que ve el modelo ya no coincide con lo que aprendió. No modificar la lógica
de este directorio sin actualizar esos fixtures.

Los pesos (`public/models/lse-*.bin`) tienen licencias propias: ver `CREDITS.md`.
