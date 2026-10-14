import{z}from"zod";
const uuid=z.string().uuid(),reason=z.string().trim().min(5).max(2000);
export const communicationsAction=z.discriminatedUnion("action",[
 z.object({action:z.literal("consent"),leadId:z.string().min(1).max(100).optional(),enabled:z.boolean(),reason}).strict(),
 z.object({action:z.literal("campaign"),requestId:uuid,subject:z.string().trim().min(1).max(160),body:z.string().trim().min(5).max(5000),audience:z.enum(["families","leads","all"]),confirm:z.literal("SEND"),reason}).strict(),
 z.object({action:z.literal("cancel"),id:uuid,reason}).strict(),
]);
