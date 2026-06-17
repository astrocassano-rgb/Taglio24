import { Jimp } from "jimp";
import fs from "fs";
import path from "path";

async function run() {
  const logoPath = "public/logo.png";
  const outputDir = "public/icons";

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log("Lettura di public/logo.png...");
  const image = await Jimp.read(logoPath);

  console.log("Generazione icon-192.png (192x192)...");
  const img192 = image.clone().resize({ w: 192, h: 192 });
  await img192.write(path.join(outputDir, "icon-192.png"));

  console.log("Generazione icon-512.png (512x512)...");
  const img512 = image.clone().resize({ w: 512, h: 512 });
  await img512.write(path.join(outputDir, "icon-512.png"));

  console.log("Generazione maskable-512.png (512x512)...");
  const imgMask = image.clone().resize({ w: 512, h: 512 });
  await imgMask.write(path.join(outputDir, "maskable-512.png"));

  console.log("Tutte le icone PWA sono state generate con successo in public/icons/!");
}

run().catch((err) => {
  console.error("Errore durante la generazione delle icone:", err);
  process.exit(1);
});
