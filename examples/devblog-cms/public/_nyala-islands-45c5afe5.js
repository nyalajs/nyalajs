const ISLANDS = {"MenuReorder":"MenuReorder-QSDNXFEB.js","MediaUploader":"MediaUploader-XZISXKXD.js"};
document.querySelectorAll("[data-nyala-island]").forEach(async (el) => {
    const name = el.getAttribute("data-nyala-island");
    const file = ISLANDS[name];
    if (!file) {
        console.error(`[nyala] no bundle for island "${name}" — rebuild with \`nyala build\`?`);
        return;
    }
    try {
        const props = JSON.parse(el.getAttribute("data-nyala-props") || "{}");
        const mod = await import(`/public/islands/${file}`);
        await mod.hydrate(el, props);
    } catch (error) {
        console.error(`[nyala] failed to hydrate island "${name}":`, error);
    }
});
