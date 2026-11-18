import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

let font: Promise<Buffer | null> | undefined;

async function reportFont(): Promise<Buffer | null> {
  const localPath = path.resolve(process.cwd(), "assets", "fonts", "Lato-Regular.ttf");
  if (fs.existsSync(localPath)) {
    return fs.promises.readFile(localPath);
  }
  font ??= fetch("https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Regular.ttf", {
    signal: AbortSignal.timeout(5000),
  })
    .then(async (r) => {
      if (!r.ok) return null;
      return Buffer.from(await r.arrayBuffer());
    })
    .catch(() => {
      font = undefined;
      return null;
    });
  return font;
}

export async function academyPDF(title: string, sections: { heading: string; lines: string[] }[]) {
  const typeface = await reportFont();
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: { Title: title, Author: "ProsperWork Music Academy" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.font(typeface ?? "Helvetica").fillColor("#135B45").fontSize(11).text("PROSPERWORK MUSIC ACADEMY");
    doc.moveDown().fontSize(23).text(title).moveDown(0.7);
    for (const section of sections) {
      if (doc.y > 680) doc.addPage();
      doc.fillColor("#135B45").fontSize(13).text(section.heading).moveDown(0.4);
      doc.fillColor("#182622").fontSize(10);
      for (const line of section.lines) {
        if (doc.y > 740) doc.addPage();
        doc.text(line, { lineGap: 4 });
      }
      doc.moveDown();
    }
    doc.fillColor("#596B63").fontSize(8).text("Private academy document. Generated from authorized academy records.");
    doc.end();
  });
}
