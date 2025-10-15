// app/lib/pdf2img.ts
// Robust PDF -> PNG (first page) converter for Vite + React Router apps

export interface PdfConversionResult {
    imageUrl: string;
    file: File | null;
    error?: string;
}

let pdfjsLib: any = null;
let loadPromise: Promise<any> | null = null;

/**
 * Ensure we have a valid worker URL.
 * - In Vite, importing `?url` returns the final asset URL.
 * - Fallback to `/pdf.worker.min.mjs` if the asset import fails (you can place it in /public).
 */
async function getWorkerUrl(): Promise<string> {
    try {
        // Vite will turn this into a URL string at build time.
        const mod: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        return (mod && (mod.default as string)) || "/pdf.worker.min.mjs";
    } catch {
        // Fallback: serve it yourself from /public if needed
        return "/pdf.worker.min.mjs";
    }
}

async function loadPdfJs(): Promise<any> {
    if (pdfjsLib) return pdfjsLib;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        // Use legacy ESM build for broad browser support
        const lib: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const workerUrl = await getWorkerUrl();
        lib.GlobalWorkerOptions.workerSrc = workerUrl;
        pdfjsLib = lib;
        return lib;
    })();

    return loadPromise;
}

export async function convertPdfToImage(file: File): Promise<PdfConversionResult> {
    if (typeof window === "undefined") {
        return {
            imageUrl: "",
            file: null,
            error: "PDF conversion is only available in the browser.",
        };
    }

    if (!file || !/\.pdf$/i.test(file.name)) {
        return {
            imageUrl: "",
            file: null,
            error: "Please provide a valid .pdf file.",
        };
    }

    try {
        const lib = await loadPdfJs();

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        // Increase scale for better quality; adjust 2–4 based on performance
        const viewport = page.getViewport({ scale: 3 });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
            return {
                imageUrl: "",
                file: null,
                error: "Unable to get 2D canvas context.",
            };
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";

        await page.render({ canvasContext: context, viewport }).promise;

        // Canvas -> PNG Blob
        const blob: Blob | null = await new Promise((resolve) =>
            canvas.toBlob((b) => resolve(b), "image/png", 1.0)
        );

        if (!blob) {
            return {
                imageUrl: "",
                file: null,
                error: "Failed to create image blob from canvas.",
            };
        }

        const originalName = file.name.replace(/\.pdf$/i, "");
        const imageFile = new File([blob], `${originalName}.png`, { type: "image/png" });
        const imageUrl = URL.createObjectURL(blob);

        return { imageUrl, file: imageFile };
    } catch (err: any) {
        console.error("convertPdfToImage error:", err);
        return {
            imageUrl: "",
            file: null,
            error: `Failed to convert PDF: ${err?.message || String(err)}`,
        };
    }
}
