const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString()

export const SEED_ANNOUNCEMENTS = [
  {
    id: 'a1',
    author: 'Rubén · Comandante',
    priority: 'important',
    text: 'Ventana de comunicación con la Tierra a las 16:40 UTC. Dejen sus registros listos antes.',
    at: minutesAgo(25),
  },
  {
    id: 'a2',
    author: 'Ana · Oficial médica',
    priority: 'normal',
    text: 'Recuerden registrar sus horas de sueño al despertar. Hoy toca toma de signos a las 18:00.',
    at: minutesAgo(70),
  },
]
