import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/**
 * Entrega o arquivo ao usuário. No navegador baixa direto; no app Android grava no
 * armazenamento do app e abre o menu de compartilhar/salvar.
 */
export async function entregarArquivo(nome: string, blob: Blob): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const data = await blobParaBase64(blob);
    const r = await Filesystem.writeFile({ path: nome, data, directory: Directory.Cache });
    try {
      await Share.share({ title: nome, url: r.uri, dialogTitle: "Salvar ou enviar arquivo" });
    } catch {
      /* usuário fechou o menu */
    }
    return `Arquivo ${nome} pronto.`;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return `Arquivo ${nome} baixado.`;
}
