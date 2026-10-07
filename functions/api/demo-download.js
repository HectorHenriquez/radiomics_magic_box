const OBJECT_KEYS = ['data_radiomics_demo.zip.part1', 'data_radiomics_demo.zip.part2'];

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function equalBytes(a, b) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] || 0) ^ (b[i] || 0);
  return difference === 0;
}

export async function onRequestPost({ request, env }) {
  if (!env.DEMO_DOWNLOAD_KEY || !env.DEMO_BUCKET) {
    return new Response('La descarga aún no está configurada.', { status: 503 });
  }
  const form = await request.formData();
  const supplied = form.get('key');
  if (typeof supplied !== 'string' || supplied.length > 256 ||
      !equalBytes(await digest(supplied), await digest(env.DEMO_DOWNLOAD_KEY))) {
    return new Response('Clave incorrecta.', { status: 403 });
  }
  const objects = await Promise.all(OBJECT_KEYS.map(key => env.DEMO_BUCKET.get(key)));
  if (objects.some(object => !object)) return new Response('El paquete todavía no está disponible.', { status: 503 });
  const readers = objects.map(object => object.body.getReader());
  let part = 0;
  const body = new ReadableStream({
    async pull(controller) {
      while (part < readers.length) {
        const { done, value } = await readers[part].read();
        if (done) { part++; continue; }
        controller.enqueue(value);
        return;
      }
      controller.close();
    },
    cancel(reason) { return Promise.all(readers.map(reader => reader.cancel(reason))); },
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="data_radiomics_demo.zip"',
      'Content-Length': String(objects.reduce((total, object) => total + object.size, 0)),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
