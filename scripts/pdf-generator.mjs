import PDFDocument from 'pdfkit';

export function createPolicyPdf(title, subtitle, sections) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 54, bottom: 54, left: 54, right: 54 },
        info: {
          Title: title,
          Author: 'ProsperWork Music Concepts',
          Subject: subtitle,
          Creator: 'ProsperWork Academy Publishing System'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Academy Header
      doc.fillColor('#0f172a')
         .fontSize(10)
         .font('Helvetica-Bold')
         .text('PROSPERWORK MUSIC CONCEPTS', { characterSpacing: 1.5 });
      
      doc.fillColor('#64748b')
         .fontSize(8)
         .font('Helvetica')
         .text('Online Music Academy · Virtual 1-on-1 Music Education · Safeguarding & Compliance Desk', { characterSpacing: 0.5 });
      
      doc.moveDown(0.5);
      doc.strokeColor('#e2e8f0')
         .lineWidth(1)
         .moveTo(54, doc.y)
         .lineTo(541, doc.y)
         .stroke();
      
      doc.moveDown(1);

      // Document Title
      doc.fillColor('#090d16')
         .fontSize(20)
         .font('Helvetica-Bold')
         .text(title);
      
      doc.moveDown(0.3);
      doc.fillColor('#475569')
         .fontSize(10)
         .font('Helvetica')
         .text(subtitle);
      
      doc.moveDown(0.4);
      doc.fillColor('#64748b')
         .fontSize(8)
         .font('Helvetica-Bold')
         .text('EFFECTIVE DATE: OCTOBER 2026   |   VERSION: 1.0 (OFFICIAL RELEASE)');
      
      doc.moveDown(0.8);
      doc.strokeColor('#cbd5e1')
         .lineWidth(0.5)
         .moveTo(54, doc.y)
         .lineTo(541, doc.y)
         .stroke();
      
      doc.moveDown(1);

      // Sections
      for (const section of sections) {
        // Check remaining page space
        if (doc.y > 680) {
          doc.addPage();
        }

        if (section.heading) {
          doc.fillColor('#0f172a')
             .fontSize(12)
             .font('Helvetica-Bold')
             .text(section.heading);
          doc.moveDown(0.3);
        }

        if (section.body) {
          doc.fillColor('#334155')
             .fontSize(9.5)
             .font('Helvetica')
             .text(section.body, { lineGap: 2.5 });
          doc.moveDown(0.6);
        }

        if (section.bullets && section.bullets.length > 0) {
          for (const bullet of section.bullets) {
            if (doc.y > 700) {
              doc.addPage();
            }
            doc.fillColor('#334155')
               .fontSize(9.5)
               .font('Helvetica')
               .text(`•   ${bullet}`, { lineGap: 2.5, indent: 10 });
            doc.moveDown(0.25);
          }
          doc.moveDown(0.5);
        }
      }

      // Final Footer Notice
      if (doc.y > 680) {
        doc.addPage();
      }
      doc.moveDown(1);
      doc.strokeColor('#e2e8f0')
         .lineWidth(0.5)
         .moveTo(54, doc.y)
         .lineTo(541, doc.y)
         .stroke();
      doc.moveDown(0.6);
      doc.fillColor('#64748b')
         .fontSize(8)
         .font('Helvetica')
         .text('ProsperWork Music Concepts · Lagos, Nigeria · Phone / WhatsApp: +234 703 192 6969 · Email: info@prosperworkmusic.com', { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

