# Licence of the shipped models

**The application's source code is MIT (see [`LICENSE`](../../LICENSE)). The two trained models
in this directory carry different terms, and they are not interchangeable — read both.**

| model | licence | why |
| --- | --- | --- |
| `lse-vocabulary.*` | **CC BY-NC 4.0** | derives from a non-commercial corpus |
| `lse-alphabet.*` | **CC BY 4.0** | derives only from CC BY 4.0 material |

## `lse-vocabulary.bin` and `lse-vocabulary.json` — CC BY-NC 4.0

The vocabulary model is trained on two corpora, and one of them is non-commercial:

| corpus | licence | DOI |
| --- | --- | --- |
| **SWL-LSE** | CC BY 4.0 | [`10.5281/zenodo.13691887`][swl] |
| **LSE-Health-UVigo** | **CC BY-NC 4.0** | [`10.5281/zenodo.10234465`][health] |

[swl]: https://doi.org/10.5281/zenodo.13691887
[health]: https://doi.org/10.5281/zenodo.10234465

So these weights are distributed under **Creative Commons Attribution-NonCommercial 4.0
International**, with attribution as recorded in [`NOTICE.md`](../../NOTICE.md).

Using Esku is unaffected: the app is free and stays free. What this does mean is that **a
commercial fork cannot ship this model**. Retraining on SWL-LSE alone produces an MIT-clean model,
at the cost of the accuracy that LSE-Health's co-articulated annotations buy.

## `lse-alphabet.bin` and `lse-alphabet.json` — CC BY 4.0

The fingerspelling model is trained on one corpus, and it carries no commercial restriction:

| corpus | licence | DOI |
| --- | --- | --- |
| **LSE-FS-UVigo** | CC BY 4.0 | [`10.5281/zenodo.15797079`][fs] |

[fs]: https://doi.org/10.5281/zenodo.15797079

**These weights are not encumbered by the vocabulary model's non-commercial clause.** Sitting in
the same directory is not contagion, and the distinction is worth stating plainly: a commercial
fork may ship `lse-alphabet.*` and must not ship `lse-vocabulary.*`. Attribution as recorded in
[`NOTICE.md`](../../NOTICE.md).

This is the cautious reading. UVigo's reply pointing us at the corpus placed LSE-Health under
CC BY 4.0 while its Zenodo record declares CC BY-NC 4.0; until that is settled we assume the
stricter of the two. If it is confirmed as CC BY, this file goes away.

## `hand_landmarker.task`, `pose_landmarker_lite.task`, `face_landmarker.task` — Apache 2.0

Google's MediaPipe Tasks Vision bundles, vendored so they are served same-origin.
<https://github.com/google-ai-edge/mediapipe>

## `hand.glb` — MIT

The app's mascot: the right "generic-hand" model of the WebXR Input Profiles assets
(`@webxr-input-profiles/assets` 1.0.19, `dist/profiles/generic-hand/right.glb`), unchanged.
<https://github.com/immersive-web/webxr-input-profiles>

> MIT License — Copyright (c) 2019 Amazon
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software
> and associated documentation files (the "Software"), to deal in the Software without
> restriction, including without limitation the rights to use, copy, modify, merge, publish,
> distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
> Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
> BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## What is not here

No video and no landmark file from any corpus is redistributed — only weights derived from them.
That matters twice over for LSE-Health, whose recordings are of identifiable Deaf signers, and
whose sibling corpus LSE_Lex40 was never published because the university's data protection
assessment did not clear it.
