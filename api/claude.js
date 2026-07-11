// Función serverless de Vercel: intermediario seguro con la API de Anthropic.
// La API key vive SOLO aquí (variable de entorno del servidor), nunca en el navegador.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en el servidor' });
  }

  try {
    // El cuerpo llega ya con el shape del endpoint /v1/messages (model, max_tokens, system, messages)
    const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const datos = await respuesta.json();
    return res.status(respuesta.status).json(datos);
  } catch (e) {
    return res.status(500).json({ error: 'Error al contactar la API', detalle: String(e) });
  }
}
