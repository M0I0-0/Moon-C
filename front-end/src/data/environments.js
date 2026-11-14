export const ENVIRONMENTS = {
  iss: {
    id: 'iss',
    name: 'Estación Espacial',
    place: 'Órbita baja · 408 km',
    description: 'Módulo de habitación en órbita terrestre.',
    swatch: ['#05070c', '#2f6db3'],
  },
  moon: {
    id: 'moon',
    name: 'Base Lunar',
    place: 'Cráter Shackleton · polo sur',
    description: 'Hábitat de superficie en la Luna.',
    swatch: ['#0b0b0c', '#8a8780'],
  },
  mars: {
    id: 'mars',
    name: 'Base en Marte',
    place: 'Cráter Jezero · sol 214',
    description: 'Asentamiento en la superficie marciana.',
    swatch: ['#3a1d12', '#c9774c'],
  },
  home: {
    id: 'home',
    name: 'Casa',
    place: 'Sala · modo hogar',
    description: 'Una sala cálida para platicar con calma.',
    swatch: ['#f3e6d3', '#d9895b'],
  },
}

export const ENV_LIST = Object.values(ENVIRONMENTS)
