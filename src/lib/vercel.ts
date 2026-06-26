const VERCEL_API = "https://api.vercel.com";

function teamQuery() {
  return process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
}

/**
 * Aggiunge un sottodominio per il tenant sul progetto Vercel.
 * Se il dominio esiste già (HTTP 409), l'operazione è considerata un successo (idempotente).
 */
export async function addTenantDomain(slug: string): Promise<string> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const rootDomain = process.env.TENANT_ROOT_DOMAIN || "app.dogwash24.it";

  if (!token || !projectId) {
    throw new Error("Variabili d'ambiente VERCEL_TOKEN o VERCEL_PROJECT_ID mancanti.");
  }

  const name = `${slug}.${rootDomain}`;
  console.log(`[Vercel API] Registrazione del dominio: ${name}`);

  const res = await fetch(
    `${VERCEL_API}/v10/projects/${projectId}/domains${teamQuery()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    }
  );

  if (!res.ok) {
    if (res.status === 409) {
      console.log(`[Vercel API] Il dominio ${name} è già registrato sul progetto.`);
      return name;
    }
    const err = await res.text();
    throw new Error(`Vercel addDomain failed (${res.status}): ${err}`);
  }

  console.log(`[Vercel API] Dominio ${name} aggiunto con successo.`);
  return name;
}

/**
 * Recupera lo stato del dominio di un tenant su Vercel.
 */
export async function getTenantDomainStatus(slug: string): Promise<any> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const rootDomain = process.env.TENANT_ROOT_DOMAIN || "app.dogwash24.it";

  if (!token || !projectId) {
    console.warn("[Vercel API] getTenantDomainStatus ignorato: token o projectId mancanti.");
    return null;
  }

  const name = `${slug}.${rootDomain}`;
  const res = await fetch(
    `${VERCEL_API}/v9/projects/${projectId}/domains/${name}${teamQuery()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    console.error(`[Vercel API] Errore recupero stato dominio ${name} (${res.status})`);
    return null;
  }

  return res.json();
}

/**
 * Rimuove il dominio del tenant dal progetto Vercel.
 */
export async function removeTenantDomain(slug: string): Promise<string> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const rootDomain = process.env.TENANT_ROOT_DOMAIN || "app.dogwash24.it";

  if (!token || !projectId) {
    throw new Error("Variabili d'ambiente VERCEL_TOKEN o VERCEL_PROJECT_ID mancanti.");
  }

  const name = `${slug}.${rootDomain}`;
  console.log(`[Vercel API] Eliminazione del dominio: ${name}`);

  const res = await fetch(
    `${VERCEL_API}/v9/projects/${projectId}/domains/${name}${teamQuery()}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    if (res.status === 404) {
      console.log(`[Vercel API] Il dominio ${name} non è presente su Vercel (già rimosso).`);
      return name;
    }
    const err = await res.text();
    throw new Error(`Vercel removeDomain failed (${res.status}): ${err}`);
  }

  console.log(`[Vercel API] Dominio ${name} rimosso con successo.`);
  return name;
}
