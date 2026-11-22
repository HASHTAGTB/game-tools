export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard API needs a secure context (localhost is fine; a LAN IP over http is not)
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}
