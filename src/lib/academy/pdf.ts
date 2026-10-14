import PDFDocument from "pdfkit";
let font:Promise<Buffer>|undefined;
async function reportFont() {
 // OFL-licensed Lato; this request sends no academy or user data.
 font??=fetch("https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Regular.ttf",{signal:AbortSignal.timeout(12000)})
  .then(async r=>{if(!r.ok)throw new Error("Document font unavailable");return Buffer.from(await r.arrayBuffer());})
  .catch(e=>{font=undefined;throw e;});
 return font;
}
export async function academyPDF(title:string,sections:{heading:string;lines:string[]}[]) {
 const typeface=await reportFont();
 return new Promise<Buffer>((resolve,reject)=>{
  const doc=new PDFDocument({size:"A4",margin:48,info:{Title:title,Author:"ProsperWork Music Academy"}});
  const chunks:Buffer[]=[];doc.on("data",c=>chunks.push(c));doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject);
  doc.font(typeface).fillColor("#135B45").fontSize(11).text("PROSPERWORK MUSIC ACADEMY");
  doc.moveDown().fontSize(23).text(title).moveDown(.7);
  for(const section of sections){
   if(doc.y>680)doc.addPage();
   doc.fillColor("#135B45").fontSize(13).text(section.heading).moveDown(.4);
   doc.fillColor("#182622").fontSize(10);
   for(const line of section.lines){if(doc.y>740)doc.addPage();doc.text(line,{lineGap:4});}
   doc.moveDown();
  }
  doc.fillColor("#596B63").fontSize(8).text("Private academy document. Generated from authorized academy records.");
  doc.end();
 });
}
