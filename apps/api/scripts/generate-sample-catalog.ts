// Generator for the clearly synthetic sample Catalog PDF (feature catalog-rag-ingestion).
// Runs with Node's native type stripping (erasable syntax only, no relative imports):
//   node apps/api/scripts/generate-sample-catalog.ts [out-dir] [--edition 2]
// Wrapper: scripts/catalog/generate-sample-catalog.sh. The tests import buildSampleCatalog().
// Output is byte-identical across runs: fixed metadata dates, built-in fonts only.
// Edition 2 changes exactly one price (BM-SYN-WTP-300: 189.90 -> 199.90 EUR).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import PDFDocument from 'pdfkit';

export const SAMPLE_CATALOG_FILE_NAME = 'bricomission-sample-catalog.pdf';
export const SAMPLE_CATALOG_TITLE = 'BricoMission Sample Kitchen Catalog (synthetic)';
export const SAMPLE_CATALOG_BANNER = 'SYNTHETIC SAMPLE - not real products or prices';

export interface SampleProduct {
  sku: string;
  name: string;
  unit: string;
  price: string;
}

export interface SampleCatalogPage {
  heading: string;
  products: SampleProduct[];
}

/** Product pages (pages 2-4). The worktop page is page 3. */
export function sampleProductPages(edition: number): SampleCatalogPage[] {
  const worktopPrice = edition === 2 ? '199.90' : '189.90';
  return [
    {
      heading: 'Kitchen cabinets / Muebles de cocina',
      products: [
        { sku: 'BM-SYN-CAB-040', name: 'Base cabinet 40 cm white / Mueble bajo 40 cm blanco', unit: 'unit', price: '96.50' },
        { sku: 'BM-SYN-CAB-060', name: 'Base cabinet 60 cm white / Mueble bajo 60 cm blanco', unit: 'unit', price: '129.00' },
        { sku: 'BM-SYN-CAB-080', name: 'Drawer cabinet 80 cm / Cajonera 80 cm', unit: 'unit', price: '214.00' },
        { sku: 'BM-SYN-WAL-060', name: 'Wall cabinet 60 cm / Mueble alto 60 cm', unit: 'unit', price: '88.40' },
        { sku: 'BM-SYN-TAL-060', name: 'Tall pantry cabinet 60 cm / Columna despensa 60 cm', unit: 'unit', price: '319.00' },
        { sku: 'BM-SYN-HDL-128', name: 'Brushed steel handle 128 mm / Tirador acero cepillado 128 mm', unit: 'unit', price: '4.95' },
      ],
    },
    {
      heading: 'Worktops and splashbacks / Encimeras y frentes',
      products: [
        { sku: 'BM-SYN-WTP-300', name: 'Oak laminate worktop 300 cm / Encimera laminada roble 300 cm', unit: 'unit', price: worktopPrice },
        { sku: 'BM-SYN-WTP-240', name: 'White quartz worktop 240 cm / Encimera cuarzo blanco 240 cm', unit: 'unit', price: '649.00' },
        { sku: 'BM-SYN-WTP-EDG', name: 'Worktop edge strip oak / Canto encimera roble', unit: 'm', price: '6.20' },
        { sku: 'BM-SYN-SPL-TIL', name: 'Ceramic metro tile 10x20 / Azulejo metro ceramico 10x20', unit: 'm2', price: '24.90' },
        { sku: 'BM-SYN-SPL-GLS', name: 'Glass splashback panel / Panel frontal de vidrio', unit: 'm2', price: '138.00' },
        { sku: 'BM-SYN-ADH-310', name: 'Worktop adhesive 310 ml / Adhesivo encimera 310 ml', unit: 'unit', price: '9.75' },
      ],
    },
    {
      heading: 'Sinks, taps and appliances / Fregaderos, grifos y electrodomesticos',
      products: [
        { sku: 'BM-SYN-SNK-100', name: 'Stainless steel sink 1 bowl / Fregadero acero inoxidable 1 seno', unit: 'unit', price: '119.00' },
        { sku: 'BM-SYN-TAP-200', name: 'Mixer tap chrome / Grifo monomando cromado', unit: 'unit', price: '74.90' },
        { sku: 'BM-SYN-HOB-600', name: 'Induction hob 60 cm / Placa de induccion 60 cm', unit: 'unit', price: '389.00' },
        { sku: 'BM-SYN-OVN-600', name: 'Built-in oven 60 cm / Horno integrable 60 cm', unit: 'unit', price: '429.00' },
        { sku: 'BM-SYN-HOD-600', name: 'Extractor hood 60 cm / Campana extractora 60 cm', unit: 'unit', price: '159.00' },
        { sku: 'BM-SYN-LAB-HR', name: 'Fitting labour / Mano de obra montaje', unit: 'h', price: '32.00' },
      ],
    },
  ];
}

/** Builds the synthetic sample Catalog PDF. Edition 1 is the committed file. */
export function buildSampleCatalog(edition = 1): Promise<Buffer> {
  const fixedDate = new Date('2026-01-01T00:00:00.000Z');
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    autoFirstPage: false,
    info: {
      Title: SAMPLE_CATALOG_TITLE,
      Author: 'BricoMission (synthetic test data)',
      Subject: SAMPLE_CATALOG_BANNER,
      Creator: 'apps/api/scripts/generate-sample-catalog.ts',
      Producer: 'PDFKit',
      CreationDate: fixedDate,
      ModDate: fixedDate,
    },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolveBuffer, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolveBuffer(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const footer = (page: number): void => {
    doc.font('Helvetica').fontSize(8).fillColor('#555555');
    doc.text(`${SAMPLE_CATALOG_BANNER} - page ${page}`, 40, 800, { lineBreak: false });
    doc.fillColor('#000000');
  };

  // Page 1: cover.
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(22).text(SAMPLE_CATALOG_BANNER, 40, 120, { lineBreak: false });
  doc.font('Helvetica').fontSize(16).text('BricoMission Sample Kitchen Catalog', 40, 170, { lineBreak: false });
  doc.fontSize(11);
  doc.text('All products, SKUs and prices in this document are invented for software tests.', 40, 210, { lineBreak: false });
  doc.text('Todos los productos, referencias y precios de este documento son ficticios.', 40, 228, { lineBreak: false });
  doc.text('Prices in EUR, VAT excluded. Columns: SKU | name (en / es) | unit | price.', 40, 246, { lineBreak: false });
  footer(1);

  // Pages 2-4: product tables with a text layer.
  sampleProductPages(edition).forEach((page, index) => {
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).text(page.heading, 40, 60, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9);
    const header = 100;
    doc.text('SKU', 40, header, { lineBreak: false });
    doc.text('Product / Producto', 130, header, { lineBreak: false });
    doc.text('Unit', 450, header, { lineBreak: false });
    doc.text('Price', 500, header, { lineBreak: false });
    doc.font('Helvetica').fontSize(8);
    page.products.forEach((product, row) => {
      const y = header + 24 + row * 22;
      doc.text(product.sku, 40, y, { lineBreak: false });
      doc.text(product.name, 130, y, { lineBreak: false });
      doc.text(product.unit, 450, y, { lineBreak: false });
      doc.text(`${product.price} EUR`, 500, y, { lineBreak: false });
    });
    footer(index + 2);
  });

  // Page 5: drawn with shapes only, no text at all (simulates a scanned or image-only page).
  doc.addPage();
  doc.lineWidth(2).rect(60, 80, 475, 300).stroke();
  doc.rect(80, 100, 120, 60).fillAndStroke('#d9c7a3', '#000000');
  doc.rect(220, 100, 120, 60).fillAndStroke('#d9c7a3', '#000000');
  doc.circle(420, 260, 50).stroke();
  doc.moveTo(60, 420).lineTo(535, 420).stroke();
  doc.fillColor('#000000');

  doc.end();
  return done;
}

function parseArgs(argv: string[]): { outDir: string; edition: number } {
  let outDir = 'infra/catalog/samples';
  let edition = 1;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--edition') {
      edition = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--edition=')) {
      edition = Number(arg.slice('--edition='.length));
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      outDir = arg;
    }
  }
  if (edition !== 1 && edition !== 2) {
    throw new Error('--edition must be 1 or 2');
  }
  return { outDir, edition };
}

if (import.meta.main) {
  try {
    const { outDir, edition } = parseArgs(process.argv.slice(2));
    const target = resolve(outDir);
    mkdirSync(target, { recursive: true });
    const file = join(target, SAMPLE_CATALOG_FILE_NAME);
    writeFileSync(file, await buildSampleCatalog(edition));
    console.log(`wrote ${file} (edition ${edition})`);
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    console.error('usage: generate-sample-catalog.ts [out-dir] [--edition 1|2]');
    process.exitCode = 2;
  }
}
