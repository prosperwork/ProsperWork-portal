import {z} from "zod";
import{currencyCode}from"./currency";
const id=z.string().min(1).max(100),uuid=z.string().uuid(),note=z.string().trim().min(5).max(2000);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
const currency=currencyCode,amount=z.number().finite().min(0).max(1e9);
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const zone=z.string().max(100).refine(v=>{try{new Intl.DateTimeFormat("en",{timeZone:v});return true;}catch{return false;}});
export const operationsAction=z.discriminatedUnion("action",[
 z.object({action:z.literal("contract"),studentId:id,amount:amount.positive(),currency,terms:z.enum(["upfront","after_service"]),anchor:date,notes:note}).strict(),
 z.object({action:z.literal("generate"),id:uuid}).strict(),
 z.object({action:z.literal("contract_stop"),id:uuid,notes:note}).strict(),
 z.object({action:z.literal("fx"),currency:currency.refine(c=>c!=="NGN","NGN is the reporting base"),date,rate:amount.positive(),notes:note}).strict(),
 z.object({action:z.literal("finance_settings"),taxPercent:z.number().min(0).max(100),financeProfit:z.boolean(),referralPercent:z.number().min(0).max(100).default(0)}).strict(),
 z.object({action:z.literal("expense"),title:z.string().trim().min(1).max(120),amount:amount.positive(),currency,date,category:z.string().trim().min(1).max(100),notes:note}).strict(),
 z.object({action:z.literal("availability"),staffId:uuid,weekday:z.number().int().min(0).max(6),from:time,to:time,notes:note}).strict(),
 z.object({action:z.literal("availability_remove"),id:uuid,notes:note}).strict(),
 z.object({action:z.literal("recurrence"),studentId:id,weekday:z.number().int().min(0).max(6),time,zone,duration:z.number().int().min(45).max(180),startsOn:date,weeks:z.number().int().min(1).max(26),notes:note}).strict(),
 z.object({action:z.literal("pause"),studentId:id,resumeOn:date.nullable(),notes:note}).strict(),
 z.object({action:z.literal("resume"),id:uuid,notes:note}).strict(),
 z.object({action:z.literal("reassign"),studentId:id,teacherId:uuid,adminId:uuid,notes:note}).strict(),
 z.object({action:z.literal("observe"),staffId:uuid,kind:z.enum(["observation","coaching"]),score:z.number().int().min(0).max(100),notes:note}).strict(),
 z.object({action:z.literal("lead_assign"),id,staffId:uuid,notes:note}).strict(),
 z.object({action:z.literal("trial"),id,studentId:id,teacherId:uuid,adminId:uuid,at:z.string().datetime({offset:true}),notes:note}).strict(),
 z.object({action:z.literal("convert"),id,notes:note}).strict(),
 z.object({action:z.literal("referral"),parentName:z.string().trim().min(1).max(120),email:z.string().email().max(254),phone:z.string().max(40),childName:z.string().trim().min(1).max(120),instrument:z.string().trim().min(1).max(120),contactConsent:z.literal(true),notes:note}).strict(),
 z.object({action:z.literal("media_submit"),fileId:uuid,notes:note}).strict(),
 z.object({action:z.literal("media_review"),id:uuid,approve:z.boolean(),safetyChecked:z.literal(true),notes:note}).strict(),
 z.object({action:z.literal("media_publish"),id:uuid,url:z.string().url().startsWith("https://").max(2000),notes:note}).strict(),
 z.object({action:z.literal("media_withdraw"),id:uuid,notes:note}).strict(),
]);
export type OperationsAction=z.infer<typeof operationsAction>;
