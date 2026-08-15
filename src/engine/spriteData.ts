// Pixel-art sprite grids and their palette — the single source of truth for
// every friend's face (PLAN 13.9).
//
// This module is deliberately dependency-free so the icon generator
// (`scripts/gen-icons.mjs`) can import it directly under Node's TypeScript type
// stripping. That keeps the shipped app icons and the in-app sprites from
// drifting apart. Keep it free of imports and of runtime-only TS syntax
// (enum/namespace/decorators).

export type AnimalKind = 'bunny' | 'cat' | 'duck' | 'owl' | 'crab' | 'octopus';

export const PALETTE: Record<string, string | null> = {
  '.': null,
  o: '#6e5577', // outline (muted plum)
  w: '#fff7fb', // cream body (bunny)
  p: '#ffd3e8', // inner ear pink
  c: '#ff9cc2', // cheek
  e: '#5b4660', // eye
  n: '#ef93b4', // nose
  g: '#cdb8ec', // cat lavender
  d: '#b79fe3', // cat inner ear
  y: '#ffe08a', // duck yellow
  b: '#ffae4d', // duck beak
  t: '#f4c452', // duck wing
  h: '#cdd7ea', // owl cloud blue-grey
  f: '#a8b8d8', // owl wing
  a: '#ff8a8a', // crab rosy red
  u: '#ffa98c', // octopus coral
};

// Full-body chibi sprites: ears/head on top, rounded body, little feet.
export const SPRITES: Record<AnimalKind, string[]> = {
  bunny: [
    '...oo....oo...',
    '..opo....opo..',
    '..opo....opo..',
    '..owo....owo..',
    '.oowwwwwwwwoo.',
    '.owwwwwwwwwwo.',
    '.oweewwwweewo.',
    '.oweewwwweewo.',
    '.owwwwnnwwwwo.',
    '.owcwwwwwwcwo.',
    '..owwwwwwwwo..',
    '..owwwwwwwwo..',
    '.oowwwwwwwwoo.',
    '..owwwwwwwwo..',
    '..owwwoowwwo..',
    '...ooo..ooo...',
  ],
  cat: [
    '.oo........oo.',
    '.odo......odo.',
    '.oddo....oddo.',
    '.odddoooodddo.',
    '.oggggggggggo.',
    '.ogeeggggeego.',
    '.ogeeggggeego.',
    '.oggggnnggggo.',
    '.ogcggggggcgo.',
    '..oggggggggo..',
    '..oggggggggo..',
    '.oogggwwgggoo.',
    '..ogggwwgggo..',
    '..oggggggggo..',
    '..ogggoogggo..',
    '...ooo..ooo...',
  ],
  duck: [
    '....oooooo....',
    '...oyyyyyyo...',
    '..oyyyyyyyyo..',
    '..oyeeyyeeyo..',
    '..oyeeyyeeyo..',
    '..oyybbbbyyo..',
    '..oyyybbyyyo..',
    '..oycyyyycyo..',
    '.oyyyyyyyyyyo.',
    '.otyyyyyyyyto.',
    '.otyyyyyyyyto.',
    '.oyyyyyyyyyyo.',
    '..oyyyyyyyyo..',
    '..obbboobbbo..',
    '...ooo..ooo...',
  ],
  owl: [
    '..oo......oo..',
    '..oho....oho..',
    '.oohhoooohhoo.',
    '.ohhhhhhhhhho.',
    '.oheehhhheeho.',
    '.oheehhhheeho.',
    '.ohhhhbbhhhho.',
    '.ohchhhhhhcho.',
    '.offhwwwwhffo.',
    '.offhwwwwhffo.',
    '.ofhhwwwwhhfo.',
    '.ohhhwwwwhhho.',
    '..ohhwwwwhho..',
    '..ohhhhhhhho..',
    '...obo..obo...',
  ],
  crab: [
    '....o....o....',
    '...oao..oao...',
    '..ooaooooaoo..',
    '..oaaaaaaaao..',
    'oooaeeaaeeaooo',
    'oaoaeeaaeeaoao',
    'oaoacannacaoao',
    'oooaaaaaaaaooo',
    '..oaaaaaaaao..',
    '..oaoaooaoao..',
    '...o.o..o.o...',
  ],
  octopus: [
    '....oooooo....',
    '..oouuuuuuoo..',
    '.ouuuuuuuuuuo.',
    '.ouuuuuuuuuuo.',
    '.ouueeuueeuuo.',
    '.ouueeuueeuuo.',
    '.oucuuuuuucuo.',
    '.ouuuunnuuuuo.',
    '..ouuuuuuuuo..',
    '..ouuuuuuuuo..',
    '..ouuouuouuo..',
    'oouuoouuoouuoo',
    'ouuo.ouuo.ouuo',
    '.oo...oo...oo.',
  ],
};
